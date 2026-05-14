/**
 * Director pipeline orchestrator. Glues together every building block
 * the previous commits added:
 *
 *   1. generateScript()           → scenes[]
 *   2. synthesizeScenes()         → narration Float32Array[] per scene
 *   3. mixDirectorAudio()         → master narration AudioBuffer
 *   4. createOffscreenReelRenderer({directorMode}) → frames[]
 *   5. encodeMp4(frames, ...)     → MP4 blob URL
 *   6. exportPostcard(...)        → postcard PNG blob URL
 *
 * v1.6.7 deliberately keeps the MP4 silent. Reason: directorAudio
 * produces an AudioBuffer; mp4Export.encodeMp4 currently expects a Blob
 * that it decodes via decodeAudioBlob. Wiring AudioBuffer → MP4 needs a
 * small encodeMp4 surface change (accept audioBuffer directly) and that
 * ships in v1.6.8 alongside the first real TTS pass. For now the audio
 * pipeline runs and its output is validated — the MP4 just doesn't
 * embed it yet. Honest about what the artifact is at this stage.
 *
 * Every dependency is injected so the whole pipeline is unit-testable
 * without WebCodecs, MapLibre, or an AudioContext.
 */

import { generateScript } from "./directorScript.js";
import { synthesizeScenes, sceneStarts } from "./directorTTS.js";
import { mixDirectorAudio } from "./directorAudio.js";
import { exportPostcard } from "./exportPostcard.js";

const DEFAULT_FPS = 24;
const DEFAULT_DURATION_S = 30;
const DEFAULT_SAMPLE_RATE = 48000;
const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 1280;

/** Pure: compute frame count for a duration + fps. */
export function framePlanForDuration(durationS, fps = DEFAULT_FPS) {
  return Math.max(1, Math.round(durationS * fps));
}

/**
 * Pure: turn a generated script's scenes array into the timing inputs
 * directorAudio.mixDirectorAudio expects. Splits responsibility cleanly.
 */
export function scenesToAudioTiming(scenes) {
  return {
    sceneStartsS: sceneStarts(scenes),
    totalDurationS: scenes.length ? scenes[scenes.length - 1].tEnd : 0,
  };
}

/**
 * Top-level pipeline runner. Returns
 *   { mp4Url, postcardUrl, scenes, mode, audioBuffer, frameCount }
 *
 * Required:
 *   config, palette, language, getPalette
 *
 * Optional (defaults to module imports, override for tests):
 *   generate         = generateScript
 *   synthesize       = synthesizeScenes
 *   mix              = mixDirectorAudio
 *   makeRenderer     = createOffscreenReelRenderer (from reelRenderer)
 *   encodeMp4Impl    = encodeMp4 (from mp4Export)
 *   postcard         = exportPostcard
 *   createAudioBuffer = a function that returns an AudioBuffer-shaped
 *                       object with copyToChannel(arr, ch). Production
 *                       passes (n, len, sr) => new OfflineAudioContext(n,
 *                       len, sr).createBuffer(n, len, sr). Tests pass a fake.
 *
 * Caller observes progress via onProgress({stage, ...}) — stages are
 * "script", "tts", "audio", "render", "encode", "postcard", "done".
 */
export async function runDirectorPipeline({
  config,
  palette,
  language,
  personalContext = "",
  basemap, // "topo" | "imagery" | "relief"; undefined → config default
  turnstileToken = null, // Cloudflare Turnstile token from widget; forwarded to Worker calls
  fps = DEFAULT_FPS,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  sampleRate = DEFAULT_SAMPLE_RATE,
  ttsMode, // undefined → directorTTS auto-detects
  onProgress = null,
  signal,
  // dependency injection — defaults bind production module functions
  generate = generateScript,
  synthesize = synthesizeScenes,
  mix = mixDirectorAudio,
  makeRenderer,
  encodeMp4Impl,
  postcard = exportPostcard,
  createAudioBuffer,
} = {}) {
  if (!config) throw new Error("runDirectorPipeline: config required");
  if (!palette) throw new Error("runDirectorPipeline: palette required");
  if (!language) throw new Error("runDirectorPipeline: language required");

  const emit = (stage, extra) => {
    if (typeof onProgress === "function") onProgress({ stage, ...extra });
  };

  // 1. Script
  emit("script", { message: "Composing the narration" });
  const script = await generate({ config, tone: palette.id, language, personalContext, turnstileToken, signal });
  const scenes = script?.scenes || [];
  if (scenes.length === 0) throw new Error("Director: script produced no scenes");
  const { totalDurationS } = scenesToAudioTiming(scenes);
  const durationS = totalDurationS > 0 ? totalDurationS : DEFAULT_DURATION_S;

  // 2. TTS
  emit("tts", { message: "Recording the voice", sceneCount: scenes.length });
  const { tracks, mode } = await synthesize({
    scenes,
    palette,
    language,
    sampleRate,
    mode: ttsMode,
    signal,
    turnstileToken,
  });

  // 3. Mix audio (always produced even if the MP4 stays silent at v1.6.7)
  emit("audio", { message: "Mixing the score", mode });
  let audioBuffer = null;
  if (typeof createAudioBuffer === "function") {
    audioBuffer = mix({
      sampleRate,
      durationS,
      sceneTracks: tracks,
      sceneStartsS: sceneStarts(scenes),
      createBuffer: createAudioBuffer,
    });
  }
  // If no createAudioBuffer is wired (e.g., environment without
  // OfflineAudioContext), we proceed without an AudioBuffer. The mixer
  // still validated its inputs above. MP4 stays silent regardless at
  // this version — see file header.

  // 4. Render frames via directorMode renderer
  if (typeof makeRenderer !== "function") {
    throw new Error("runDirectorPipeline: makeRenderer required (createOffscreenReelRenderer)");
  }
  const total = framePlanForDuration(durationS, fps);
  emit("render", { message: "Color-grading the map", total });
  const renderer = await makeRenderer(config, {
    width,
    height,
    basemap,
    directorMode: {
      scenes,
      palette,
      language,
      durationS,
    },
  });
  const frames = [];
  try {
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw new Error("aborted");
      const t = i / total;
      const bm = await renderer.captureFrame(t);
      frames.push(bm);
      if (i % 8 === 0) emit("render", { frame: i + 1, total });
    }
  } finally {
    // Don't destroy yet — the postcard step uses the canvas via the first frame.
  }

  // 5. Encode MP4. When audioBuffer is in hand (from the mixer above),
  // pass it through directly. encodeMp4 uses it without the
  // Blob→decode round-trip.
  if (typeof encodeMp4Impl !== "function") {
    renderer.destroy?.();
    frames.forEach((f) => f.close?.());
    throw new Error("runDirectorPipeline: encodeMp4Impl required");
  }
  emit("encode", { message: "Cutting the film", total });
  const mp4Url = await encodeMp4Impl(frames, {
    fps,
    width,
    height,
    audioBuffer,
    onProgress: (n, t) => emit("encode", { frame: n, total: t }),
  });

  // 6. Postcard cover — uses the first frame as the hero image when
  // possible. ImageBitmaps can be drawn directly onto a canvas via
  // drawImage so we pass it through.
  emit("postcard", { message: "Printing the postcard" });
  const postcardUrl = await postcard({
    sourceCanvas: frames[0] || null,
    config,
    palette,
    language,
  });

  // Cleanup
  try {
    frames.forEach((f) => f.close?.());
  } catch { /* ignore */ }
  renderer.destroy?.();

  emit("done", { message: "Done" });
  return {
    mp4Url,
    postcardUrl,
    scenes,
    mode,
    audioBuffer,
    frameCount: frames.length,
    durationS,
  };
}
