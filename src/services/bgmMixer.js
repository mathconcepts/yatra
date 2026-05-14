/**
 * Background music mixer — overlays a BGM track under the narrator,
 * ducking BGM by -12 dB during speech with smooth attack/release.
 *
 * Inputs:
 *   - `narrationBuffer` : AudioBuffer mixed by directorAudio (mono or stereo)
 *   - `bgmBuffer`       : AudioBuffer decoded from a BGM URL (may be null)
 *   - `sceneStartsS`    : Array<number> — t-positions where narration speaks
 *   - `sceneEndsS`      : Array<number> — t-positions where narration ends
 *
 * Returns a new AudioBuffer that's the same length as narrationBuffer
 * but with BGM mixed underneath. If `bgmBuffer` is null/undefined, the
 * narrationBuffer is returned unchanged (idempotent on the empty-BGM
 * case).
 *
 * Mixing math:
 *   sample = narration[t] + bgm[t mod bgmLen] * gain(t)
 *
 *   gain(t) starts at 1.0 (BGM full volume).
 *   When a scene speaks, gain ramps to 0.25 (-12 dB) over 200 ms.
 *   When the scene ends, gain ramps back to 1.0 over 400 ms.
 *
 * BGM is looped if shorter than the narration. We crossfade the last
 * 200 ms of one loop into the first 200 ms of the next to avoid clicks.
 *
 * The mixer is pure: it does not touch the network or AudioContext.
 * Callers provide already-decoded AudioBuffers and the mixer returns
 * a new AudioBuffer. Tests pass plain objects shaped like AudioBuffer.
 */

const DUCK_DB = -12;
const DUCK_GAIN = Math.pow(10, DUCK_DB / 20); // ~0.2512
const ATTACK_S = 0.2;
const RELEASE_S = 0.4;
const LOOP_CROSSFADE_S = 0.2;

/**
 * Pure: gain envelope for one timestamp. Higher when no narration is
 * speaking; ducks during speech; smooth ramps at edges.
 */
export function bgmGainAtTime(t, narrationWindows) {
  if (!Array.isArray(narrationWindows) || narrationWindows.length === 0) return 1;
  for (const w of narrationWindows) {
    // Ramp DOWN before scene start
    if (t >= w.start - ATTACK_S && t < w.start) {
      const progress = (t - (w.start - ATTACK_S)) / ATTACK_S;
      return lerp(1, DUCK_GAIN, progress);
    }
    // Full duck during scene
    if (t >= w.start && t < w.end) {
      return DUCK_GAIN;
    }
    // Ramp UP after scene end
    if (t >= w.end && t < w.end + RELEASE_S) {
      const progress = (t - w.end) / RELEASE_S;
      return lerp(DUCK_GAIN, 1, progress);
    }
  }
  return 1;
}

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/**
 * Pure: get one sample from a BGM buffer at sample index `i`, looping
 * with a crossfade at the loop boundary so the seam isn't audible.
 */
export function getBgmSample(bgmChannel, i, sampleRate) {
  const len = bgmChannel.length;
  if (len === 0) return 0;
  const j = i % len;
  // Crossfade region: last LOOP_CROSSFADE_S of the loop blends with
  // the first LOOP_CROSSFADE_S of the next loop. Only meaningful when
  // the BGM track is long enough to contain a real crossfade region;
  // tiny test buffers (or sub-second tracks) skip this and use plain
  // modulo lookup.
  const xfSamples = Math.floor(LOOP_CROSSFADE_S * sampleRate);
  if (xfSamples > 0 && len > xfSamples * 2 && j >= len - xfSamples && i >= len) {
    const into = j - (len - xfSamples);  // 0..xfSamples
    const t = into / xfSamples;
    return bgmChannel[j] * (1 - t) + bgmChannel[into] * t;
  }
  return bgmChannel[j];
}

/**
 * Pure: mix narration + BGM into a new AudioBuffer-shaped object.
 *
 * `createBuffer(numChannels, length, sampleRate)` matches the
 * OfflineAudioContext.createBuffer signature, so callers can pass
 * either a real OfflineAudioContext.createBuffer or a test stub.
 */
export function mixWithBgm({
  narrationBuffer,
  bgmBuffer,
  narrationWindows,
  createBuffer,
}) {
  if (!narrationBuffer) throw new Error("mixWithBgm: narrationBuffer required");
  if (typeof createBuffer !== "function") throw new Error("mixWithBgm: createBuffer required");
  // No BGM → return narration as-is.
  if (!bgmBuffer || !Number.isFinite(bgmBuffer.length) || bgmBuffer.length === 0) {
    return narrationBuffer;
  }
  const channels = narrationBuffer.numberOfChannels || 1;
  const length = narrationBuffer.length;
  const sampleRate = narrationBuffer.sampleRate;
  const out = createBuffer(channels, length, sampleRate);
  const windows = narrationWindows || [];
  for (let ch = 0; ch < channels; ch++) {
    const inN = narrationBuffer.getChannelData(ch);
    const inBg = bgmBuffer.getChannelData(Math.min(ch, bgmBuffer.numberOfChannels - 1));
    const outArr = out.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const gain = bgmGainAtTime(t, windows);
      outArr[i] = inN[i] + getBgmSample(inBg, i, sampleRate) * gain * 0.35; // headroom
    }
  }
  return out;
}

/**
 * Pure: derive narration windows (start/end seconds) from the scene
 * timing. Each scene's `tStart`..`tEnd` becomes one window. The mixer
 * uses these to know when to duck BGM.
 */
export function deriveNarrationWindows(scenes) {
  if (!Array.isArray(scenes)) return [];
  return scenes
    .filter((s) => typeof s.tStart === "number" && typeof s.tEnd === "number" && s.tEnd > s.tStart)
    .map((s) => ({ start: s.tStart, end: s.tEnd }));
}

/**
 * Browser-side helper: fetch + decode a BGM URL into an AudioBuffer.
 * Returns null on network/decode failure. Caller decides whether to
 * proceed without BGM.
 */
export async function loadBgm({ url, audioContext, fetchImpl = globalThis.fetch }) {
  if (!url || !audioContext || typeof audioContext.decodeAudioData !== "function") return null;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return await audioContext.decodeAudioData(ab);
  } catch { return null; }
}
