/**
 * Director audio mixer.
 *
 * Why this exists: the design doc invented a "directorAudio" component
 * but did not specify how. The /autoplan eng review caught that the
 * only viable browser path is OfflineAudioContext rendering to a single
 * AudioBuffer that the existing audioEncode pipeline can chew. LUFS
 * metering doesn't exist in Web Audio, so we target peak/RMS dBFS
 * instead — close enough for a side-project share-link.
 *
 * Layout per render (single render pass, faster than realtime):
 *
 *   ┌───────────────────────────────────────────────────────────────┐
 *   │ narration (TTS, scene-concatenated with equal-power crossfade)│  ─┐
 *   │                                                               │   │
 *   │ music bed (looped to durationS, gain = palette.music.bedDbfs) │ ──┼──► sum → final
 *   │   ┌─sidechain duck envelope from narration amplitude─┐        │   │
 *   │                                                               │   │
 *   │ ambient[]  (each gated by landmarkProximity, palette rules)   │  ─┘
 *   └───────────────────────────────────────────────────────────────┘
 *
 * Everything interesting is a pure function over Float32Array (and
 * therefore unit-testable). The orchestrator at the bottom is the only
 * thing that touches OfflineAudioContext, and that dependency is
 * injected so tests don't need web-audio-test-api.
 */

/** Convert dBFS to linear gain. -6 dBFS ≈ 0.501, -∞ dBFS = 0. Pure. */
export function dbfsToGain(dbfs) {
  if (dbfs === -Infinity) return 0;
  if (typeof dbfs !== "number" || !Number.isFinite(dbfs)) return 1;
  return Math.pow(10, dbfs / 20);
}

/**
 * Pure: write `source` into `out` starting at `outOffset`, multiplied
 * by per-sample `gainEnvelope` (or constant `gain`). Existing content
 * of `out` is preserved (additive mix).
 *
 *   out[i + outOffset] += source[i] * gain(i)
 *
 * Clips to [-1, 1] at the end of each sample to avoid summed-channel
 * overflow. Returns the number of samples actually written.
 */
export function mixInto(out, source, { outOffset = 0, gain = 1, gainEnvelope = null } = {}) {
  if (!out || !source) return 0;
  const useEnv = gainEnvelope && gainEnvelope.length === source.length;
  const limit = Math.min(source.length, out.length - outOffset);
  for (let i = 0; i < limit; i++) {
    const g = useEnv ? gainEnvelope[i] : gain;
    let v = out[outOffset + i] + source[i] * g;
    if (v > 1) v = 1;
    else if (v < -1) v = -1;
    out[outOffset + i] = v;
  }
  return Math.max(0, limit);
}

/**
 * Pure: write `source` into `out` at `outOffset` with an equal-power
 * crossfade in/out of length `fadeSamples`. Existing content of `out`
 * is preserved (additive). Equal-power means the in and out curves are
 * sin / cos so their power sum stays constant during the overlap —
 * what you want when joining two narration scenes.
 */
export function mixWithEqualPowerFade(out, source, { outOffset = 0, fadeSamples = 0, gain = 1 } = {}) {
  if (!out || !source) return 0;
  const limit = Math.min(source.length, out.length - outOffset);
  const f = Math.min(fadeSamples, Math.floor(limit / 2));
  const denom = Math.max(1, f - 1); // avoid /0; for f<=1, no fade
  for (let i = 0; i < limit; i++) {
    let env = 1;
    if (f > 1 && i < f) {
      env = Math.sin((i / denom) * (Math.PI / 2));
    } else if (f > 1 && i >= limit - f) {
      const k = i - (limit - f);
      env = Math.cos((k / denom) * (Math.PI / 2));
    }
    let v = out[outOffset + i] + source[i] * gain * env;
    if (v > 1) v = 1;
    else if (v < -1) v = -1;
    out[outOffset + i] = v;
  }
  return Math.max(0, limit);
}

/**
 * Pure: produce a sidechain-duck gain envelope from a narration
 * channel. Returns Float32Array of length narration.length where each
 * sample is the gain (0..1) the music/ambient channel should be
 * multiplied by at that moment. 1 = no duck (silence in narration);
 * lower = ducked (loud narration).
 *
 * Algorithm: detect narration RMS in sliding window; when RMS crosses
 * `thresholdRms`, ramp down to `floorGain` over `attackMs`; when it
 * drops below, ramp back up over `releaseMs`. Cheap and good-enough.
 */
export function sidechainEnvelope(narration, {
  thresholdRms = 0.05,
  floorGain = 0.35,
  attackMs = 60,
  releaseMs = 220,
  sampleRate = 48000,
  windowMs = 25,
} = {}) {
  const len = narration?.length || 0;
  const env = new Float32Array(len);
  if (len === 0) return env;
  const win = Math.max(1, Math.floor((windowMs / 1000) * sampleRate));
  const attackSamples = Math.max(1, Math.floor((attackMs / 1000) * sampleRate));
  const releaseSamples = Math.max(1, Math.floor((releaseMs / 1000) * sampleRate));

  // Pass 1: window RMS → ducked-target per sample (1 above threshold → floorGain, below → 1).
  // Use a running squared-sum window for O(n).
  const sq = new Float32Array(len);
  let acc = 0;
  for (let i = 0; i < len; i++) {
    const v = narration[i];
    acc += v * v;
    if (i >= win) acc -= narration[i - win] * narration[i - win];
    const denom = Math.min(i + 1, win);
    const rms = Math.sqrt(acc / denom);
    sq[i] = rms;
  }

  // Pass 2: smooth target with one-pole attack/release.
  let g = 1;
  for (let i = 0; i < len; i++) {
    const target = sq[i] > thresholdRms ? floorGain : 1;
    const tau = target < g ? attackSamples : releaseSamples;
    // Exponential approach: g += (target - g) / tau (1-pole)
    g += (target - g) / tau;
    env[i] = g;
  }
  return env;
}

/**
 * Pure: produce a per-sample gain envelope for an ambient track based
 * on a per-sample landmark-proximity signal (0..1). The rule specifies
 * `gateAt` (proximity below = silent) and `peakAt` (proximity at/above
 * = full gain). Between, gain interpolates linearly. Above peakAt the
 * gain saturates.
 *
 * `proximity` is expected to be the same length as the output (downsample
 * caller-side if needed).
 */
export function ambientEnvelope(proximity, rule) {
  const len = proximity?.length || 0;
  const out = new Float32Array(len);
  if (len === 0 || !rule) return out;
  const peakGain = dbfsToGain(rule.dbfs ?? -18);
  const gateAt = rule.gateAt ?? 0;
  const peakAt = Math.max(rule.peakAt ?? 1, gateAt + 1e-6);
  const span = peakAt - gateAt;
  for (let i = 0; i < len; i++) {
    const p = proximity[i];
    if (p <= gateAt) out[i] = 0;
    else if (p >= peakAt) out[i] = peakGain;
    else out[i] = ((p - gateAt) / span) * peakGain;
  }
  return out;
}

/**
 * Pure: loop a source buffer to fill `lengthSamples`. Useful for music
 * beds shorter than the render duration. Returns a new Float32Array.
 */
export function loopToLength(source, lengthSamples) {
  const out = new Float32Array(lengthSamples);
  const srcLen = source?.length || 0;
  if (srcLen === 0) return out;
  for (let i = 0; i < lengthSamples; i++) {
    out[i] = source[i % srcLen];
  }
  return out;
}

/**
 * Pure: concatenate narration scenes (one Float32Array per scene) onto
 * a master timeline of `lengthSamples`, placing each at the scene's
 * `tStart` (in seconds) and crossfading at boundaries. Returns the
 * combined narration channel.
 */
export function concatenateNarration({ sceneTracks, sceneStartsS, sampleRate, lengthSamples, crossfadeMs = 40 }) {
  const out = new Float32Array(lengthSamples);
  const fade = Math.floor((crossfadeMs / 1000) * sampleRate);
  for (let i = 0; i < sceneTracks.length; i++) {
    const t = sceneTracks[i];
    if (!t || t.length === 0) continue;
    const startSample = Math.floor((sceneStartsS[i] || 0) * sampleRate);
    mixWithEqualPowerFade(out, t, { outOffset: startSample, fadeSamples: fade, gain: 1 });
  }
  return out;
}

/**
 * Orchestrator. Pure with respect to all math; only the AudioBuffer
 * construction touches anything host-y, and `createBuffer` is injected.
 *
 * Inputs:
 *   sampleRate        e.g. 48000
 *   durationS         total render seconds
 *   sceneTracks       Float32Array[] per scene, mono, sampleRate-aligned
 *   sceneStartsS      number[] per scene, absolute seconds
 *   musicBed          Float32Array | null
 *   musicDbfs         dBFS to apply to bed before sidechain (e.g. -22)
 *   ambientSources    { rule, samples: Float32Array }[]
 *   proximityChannel  Float32Array (length == lengthSamples) of landmark-proximity over time
 *   palette           tone palette (only audio fields read)
 *   createBuffer      (numChannels, lengthSamples, sampleRate) -> { copyToChannel(arr, ch), ... }
 *
 * Returns whatever `createBuffer` returned, with the mix already written
 * into channel 0 via `copyToChannel`. Production passes a real
 * OfflineAudioContext.createBuffer; tests pass a fake.
 */
export function mixDirectorAudio({
  sampleRate,
  durationS,
  sceneTracks = [],
  sceneStartsS = [],
  musicBed = null,
  musicDbfs = -22,
  ambientSources = [],
  proximityChannel = null,
  createBuffer,
}) {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error("sampleRate required");
  if (!Number.isFinite(durationS) || durationS <= 0) throw new Error("durationS required");
  if (typeof createBuffer !== "function") throw new Error("createBuffer fn required");

  const lengthSamples = Math.ceil(durationS * sampleRate);

  // Narration timeline (channel 0 work buffer).
  const narration = concatenateNarration({ sceneTracks, sceneStartsS, sampleRate, lengthSamples });

  // Sidechain envelope from narration → music/ambient duck gain.
  const duck = sidechainEnvelope(narration, { sampleRate });

  // Music bed: loop, scale to dBFS, multiply by duck envelope.
  const finalChannel = new Float32Array(lengthSamples);
  mixInto(finalChannel, narration); // narration at unity

  if (musicBed && musicBed.length > 0) {
    const bed = loopToLength(musicBed, lengthSamples);
    const bedGain = dbfsToGain(musicDbfs);
    const bedEnv = new Float32Array(lengthSamples);
    for (let i = 0; i < lengthSamples; i++) bedEnv[i] = bedGain * duck[i];
    mixInto(finalChannel, bed, { gainEnvelope: bedEnv });
  }

  // Ambient: each rule produces its own envelope from proximityChannel,
  // multiplied by duck to keep narration intelligible.
  if (proximityChannel && proximityChannel.length === lengthSamples) {
    for (const { rule, samples } of ambientSources) {
      if (!samples || samples.length === 0 || !rule) continue;
      const src = samples.length === lengthSamples ? samples : loopToLength(samples, lengthSamples);
      const ambEnv = ambientEnvelope(proximityChannel, rule);
      const ducked = new Float32Array(lengthSamples);
      for (let i = 0; i < lengthSamples; i++) ducked[i] = ambEnv[i] * duck[i];
      mixInto(finalChannel, src, { gainEnvelope: ducked });
    }
  }

  // Hand to the host via the injected factory.
  const audioBuffer = createBuffer(1, lengthSamples, sampleRate);
  audioBuffer.copyToChannel(finalChannel, 0);
  return audioBuffer;
}
