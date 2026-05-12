/**
 * TileSourceChain — a pure-data state machine that decides when to swap
 * the active basemap raster source after sustained tile-load failures.
 *
 * Why pure-data? The MapLibre wiring (subscribing to `error` events,
 * calling `source.setTiles([...])` on swap) lives in MapView so the
 * decision logic can be unit-tested without a WebGL context. MapView
 * pumps tile-error timestamps in via `recordFailure()` and reads the
 * current source out via `state.activeSource`.
 *
 * Locked spec from the v3.0 plan (reviewer correction #3):
 *   - Threshold: ≥3 raster tile errors within a 4 s sliding window
 *   - Swap only when `map.isMoving() === false` — pumped via `tryFlush()`
 *     so a swap queued during a pan happens at moveend, not mid-gesture
 *   - Atomic source swap via setTiles, with a 1-frame opacity hold
 *     handled by MapView CSS, not by this module
 *
 * Source order (default): esri → osm → bhuvan-proxy. Bhuvan is last
 * because it depends on the Cloudflare Worker; if it fails too, the
 * chain stops (no further fallback).
 */

export const DEFAULT_THRESHOLD = 3;
export const DEFAULT_WINDOW_MS = 4000;

export const DEFAULT_SOURCES = ["esri", "osm", "bhuvan-proxy"];

/**
 * Initialise a chain state. The active source starts at index 0.
 */
export function createChain({
  sources = DEFAULT_SOURCES,
  threshold = DEFAULT_THRESHOLD,
  windowMs = DEFAULT_WINDOW_MS,
} = {}) {
  return {
    sources,
    threshold,
    windowMs,
    activeIndex: 0,
    failures: [],          // [{ ts: number }, ...] — recent errors for the active source
    pendingSwap: false,    // true when threshold crossed but moving — defer swap
  };
}

export function activeSource(state) {
  return state.sources[state.activeIndex];
}

/**
 * Record a tile-load failure at `now`. Prunes the window, decides if a
 * swap is warranted, and either flips `activeIndex` or sets
 * `pendingSwap`. Returns a new state (functional update).
 */
export function recordFailure(state, now) {
  const cutoff = now - state.windowMs;
  const failures = state.failures.filter((f) => f.ts >= cutoff);
  failures.push({ ts: now });
  let activeIndex = state.activeIndex;
  let pendingSwap = state.pendingSwap;
  if (failures.length >= state.threshold && activeIndex < state.sources.length - 1) {
    pendingSwap = true;
  }
  return { ...state, failures, activeIndex, pendingSwap };
}

/**
 * Called at moveend or any other safe-to-swap moment. If a swap was
 * pending, applies it: bumps `activeIndex`, clears failures + pending.
 * Returns { state, swapped } so the caller can call `setTiles` exactly
 * when a real swap happened.
 */
export function tryFlush(state) {
  if (!state.pendingSwap) return { state, swapped: false };
  const next = state.activeIndex + 1;
  if (next >= state.sources.length) {
    // No further fallback — clear the pending flag so we don't loop.
    return { state: { ...state, pendingSwap: false }, swapped: false };
  }
  return {
    state: { ...state, activeIndex: next, failures: [], pendingSwap: false },
    swapped: true,
  };
}

/**
 * Reset failures + pending — call this when the user successfully
 * loads a sustained run of tiles, or on basemap reset. Active source
 * is preserved (the chain doesn't auto-promote back to ESRI).
 */
export function reset(state) {
  return { ...state, failures: [], pendingSwap: false };
}
