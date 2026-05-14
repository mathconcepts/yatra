/**
 * Camera mode transforms (v3.3 Slice M).
 *
 * A camera mode is a pure function from a base camera sample
 * `{center, zoom, pitch, bearing}` plus journey context to a new camera
 * sample. The user picks the mode; the rAF loop applies it on top of
 * `sampleCameraPlan(plan, t)`.
 *
 * Four modes:
 *   - default — passthrough (uses the mood-cadence plan verbatim)
 *   - birdseye — top-down, wider zoom, low pitch (the "what does the whole journey look like" view)
 *   - chase — low pitch, tighter zoom (the "behind the marker" view, video-game-like)
 *   - orbit — bearing rotates 360° over the full loop; mood-cadence pitch + zoom preserved
 *
 * All modes still center on the live marker (cam.center), so the marker
 * is always the visual anchor.
 */

export const CAMERA_MODES = ["default", "birdseye", "chase", "orbit"];

export function isValidMode(m) {
  return CAMERA_MODES.includes(m);
}

/**
 * Pure: apply the mode transform.
 *
 * @param {object} baseCam — sampled mood-cadence camera ({zoom,pitch,bearing,center})
 * @param {object} opts — { mode, t, baseZoom }
 * @returns {object} new camera sample
 */
export function applyCameraMode(baseCam, { mode = "default", t = 0, baseZoom = 12 } = {}) {
  if (!baseCam) return baseCam;
  const safeT = Math.max(0, Math.min(1, t));
  switch (mode) {
    case "birdseye":
      // -1.2 (was -2): less aggressive zoom-out so the marker's motion
      // across the map is visible on short routes (e.g. the 11 km
      // Tirupati→Tirumala trail). The route still fits comfortably in
      // the frame; the map background visibly shifts as the marker travels.
      return {
        ...baseCam,
        pitch: 0,
        zoom: clamp(baseZoom - 1.2, 4, 20),
        bearing: 0,
      };
    case "chase":
      return {
        ...baseCam,
        pitch: 72,
        zoom: clamp(baseZoom + 1.2, 4, 20),
        // Keep the mood-cadence bearing — feels like the camera tilts with the route
      };
    case "orbit":
      return {
        ...baseCam,
        bearing: ((safeT * 360) % 360) - 180,
      };
    case "default":
    default:
      return baseCam;
  }
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
