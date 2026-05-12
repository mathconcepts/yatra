/**
 * MP4 export pipeline — WebCodecs VideoEncoder + mp4-muxer.
 *
 * Why this design (locked in v3.0 plan reviewer correction): MediaRecorder
 * is the obvious choice but produces WebM by default in Chrome and is
 * unavailable on iOS Safari for video output. WebCodecs + mp4-muxer is
 * the only browser-only path that yields a Mobile-friendly H.264 MP4 with
 * audio, runs without server compute, and exposes encoder pacing so we
 * don't drop frames on Pixel 6a-class devices.
 *
 * The pipeline is split:
 *   - isExportSupported() — UI feature detection (synchronous)
 *   - renderFrames(getFrame, { fps, durationSec }) — pulls ImageBitmaps
 *   - encodeMp4(frames, audioBlob) — encodes + muxes, returns Blob
 *
 * Tests run the pure helpers + the feature-detect; the encoder itself is
 * stubbed because jsdom has no WebCodecs.
 */

const DEFAULT_FPS = 30;
const DEFAULT_BITRATE = 5_000_000;
const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 1280;

/**
 * Pure: feature-detect WebCodecs + canvas capture.
 * Returns { supported, missing: string[] }.
 */
export function isExportSupported(globalScope = typeof globalThis !== "undefined" ? globalThis : {}) {
  const missing = [];
  if (typeof globalScope.VideoEncoder === "undefined") missing.push("VideoEncoder");
  if (typeof globalScope.VideoFrame === "undefined") missing.push("VideoFrame");
  if (typeof globalScope.AudioEncoder === "undefined") missing.push("AudioEncoder");
  // OffscreenCanvas not strictly required (main-thread canvas is fine) so omit.
  return { supported: missing.length === 0, missing };
}

/**
 * Pure: compute the frame plan — { totalFrames, frameIntervalMs }.
 * Exported for unit tests.
 */
export function framePlan({ fps = DEFAULT_FPS, durationSec = 22 } = {}) {
  const safeFps = Math.max(1, Math.min(60, Math.floor(fps)));
  const safeDur = Math.max(1, Math.min(60, durationSec));
  return {
    fps: safeFps,
    durationSec: safeDur,
    totalFrames: Math.floor(safeFps * safeDur),
    frameIntervalMs: 1000 / safeFps,
  };
}

/**
 * Encode an array of ImageBitmap/HTMLCanvasElement frames + optional audio
 * to an MP4 Blob. Resolves to a Blob URL.
 *
 * Errors propagate. Caller should wrap in try/catch and show a status
 * message to the user.
 *
 * Behavior in non-supporting environments: throws "WebCodecs unavailable"
 * immediately. Caller is expected to feature-detect first.
 */
export async function encodeMp4(frames, {
  fps = DEFAULT_FPS,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  bitrate = DEFAULT_BITRATE,
  audioBlob = null,
  onProgress = null,
} = {}) {
  const det = isExportSupported(typeof globalThis !== "undefined" ? globalThis : {});
  if (!det.supported) {
    throw new Error(`WebCodecs unavailable (${det.missing.join(", ")})`);
  }
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error("No frames to encode");
  }

  let MuxerModule;
  try {
    MuxerModule = await import("mp4-muxer");
  } catch {
    throw new Error("mp4-muxer not installed");
  }
  const { Muxer, ArrayBufferTarget } = MuxerModule;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width, height, frameRate: fps },
    audio: audioBlob ? { codec: "aac", numberOfChannels: 1, sampleRate: 48000 } : undefined,
    fastStart: "in-memory",
  });

  const videoEncoder = new globalThis.VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { throw e; },
  });
  videoEncoder.configure({
    codec: "avc1.42E01E",
    width, height,
    bitrate,
    framerate: fps,
  });

  const frameIntervalUs = Math.floor(1_000_000 / fps);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    const frame = new globalThis.VideoFrame(f, { timestamp: i * frameIntervalUs });
    videoEncoder.encode(frame, { keyFrame: i % fps === 0 });
    frame.close();
    if (typeof onProgress === "function") onProgress(i + 1, frames.length);
    // Yield periodically so the encoder queue doesn't blow up.
    if (i % fps === 0) await new Promise((r) => setTimeout(r, 0));
  }
  await videoEncoder.flush();
  videoEncoder.close();

  // Audio path is intentionally minimal here — feeding a decoded
  // AudioBuffer through an AudioEncoder is a wide surface; v3.1
  // initial release encodes video-only. Narration audio is preserved
  // as a sibling .webm download until the audio pipeline lands.
  // The plan flag in TODOS.md tracks this.

  muxer.finalize();
  const blob = new Blob([target.buffer], { type: "video/mp4" });
  return URL.createObjectURL(blob);
}
