/**
 * Runtime FPS probe + terrain auto-disable for vertical reels.
 *
 * Locked spec from the v3.0 plan (reviewer correction #5):
 *   - Sample frame-time over the first 5 s of reel playback
 *   - If median frame-time > 41 ms (≈ 24 fps), disable terrain for the
 *     rest of the session — better to drop to 2D than to ship a janky
 *     experience on mid-range Android
 *
 * This module exports a pure-data scorer for unit tests and a wrapper
 * that calls back when the verdict is in. The actual `map.setTerrain(null)`
 * call lives in MapView so this file stays MapLibre-free.
 */

const DEFAULT_THRESHOLD_MS = 41;       // ≈ 24 fps
const DEFAULT_SAMPLE_MS = 5000;        // collect 5 s of frame samples

/**
 * Pure: given a sorted-or-unsorted array of frame durations (ms), return
 * the median + p95 + the auto-disable verdict.
 *
 * Returns `{ medianMs, p95Ms, shouldDisableTerrain }`.
 *
 * Verdict logic: shouldDisableTerrain when `medianMs > thresholdMs` AND
 * we have at least 30 samples. Below 30 samples the probe is too short to
 * be statistically meaningful — better to leave terrain on.
 */
export function scoreFrames(frameDurations, thresholdMs = DEFAULT_THRESHOLD_MS) {
  if (!Array.isArray(frameDurations) || frameDurations.length === 0) {
    return { medianMs: 0, p95Ms: 0, shouldDisableTerrain: false, sampleCount: 0 };
  }
  const sorted = [...frameDurations].sort((a, b) => a - b);
  const n = sorted.length;
  const median = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];
  const p95 = sorted[Math.min(n - 1, Math.floor(n * 0.95))];
  const shouldDisableTerrain = n >= 30 && median > thresholdMs;
  return {
    medianMs: median,
    p95Ms: p95,
    shouldDisableTerrain,
    sampleCount: n,
  };
}

/**
 * Mobile terrain clamp — apply the same `terrainExaggeration ≤ 1.3` rule
 * the Reels surface uses. Pure passthrough for landscape Atlas where
 * `cap` is not set.
 */
export function clampTerrain(exaggeration, cap = 1.3) {
  if (typeof exaggeration !== "number" || Number.isNaN(exaggeration)) return null;
  if (typeof cap !== "number" || Number.isNaN(cap)) return exaggeration;
  return Math.min(exaggeration, cap);
}

/**
 * Start sampling frame durations. Returns a stop function that resolves
 * to the scoring result. Designed for use in a useEffect — start it when
 * playback begins, await the stop after `DEFAULT_SAMPLE_MS`.
 *
 * Sampling uses raw `performance.now()` deltas inside an rAF loop. The
 * loop is self-contained — it doesn't depend on the consumer's rAF.
 */
export function startProbe({ sampleMs = DEFAULT_SAMPLE_MS, thresholdMs = DEFAULT_THRESHOLD_MS } = {}) {
  if (typeof performance === "undefined" || typeof requestAnimationFrame === "undefined") {
    return { stop: () => ({ medianMs: 0, p95Ms: 0, shouldDisableTerrain: false, sampleCount: 0 }) };
  }
  const samples = [];
  let last = performance.now();
  let active = true;
  let rafId = null;

  const tick = (now) => {
    if (!active) return;
    samples.push(now - last);
    last = now;
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  const autoStop = setTimeout(() => {
    if (active) active = false;
  }, sampleMs);

  return {
    stop() {
      active = false;
      cancelAnimationFrame(rafId);
      clearTimeout(autoStop);
      return scoreFrames(samples, thresholdMs);
    },
  };
}
