/**
 * MoodCameraEngine — pure functions that build a per-journey camera plan
 * for vertical Reels playback.
 *
 * Two strategies:
 *   - terrainHeuristic — elevation-driven; steep → high pitch + tighter
 *     zoom, flat → low pitch + wider zoom. The default.
 *   - railHeuristic — event-density-driven from rail-feature landmarks
 *     (bridges, tunnels, stations, river-crossings, viaducts). Lower
 *     default pitch so the route reads as parallel motion, not a climb.
 *
 * Output: an array of CameraStep `{t, zoom, pitch, bearing, holdMs?}`
 * sampled at fixed t intervals. ReelPlayer interpolates between steps
 * with `sampleCameraPlan(plan, t)` and drives the MapLibre map via a
 * ref-held rAF loop (no React state on the hot path).
 *
 * Reviewer corrections #2 and #5 from the v3.0 autoplan:
 *   - rail mode is an EXPLICIT second strategy, not a parameter of the
 *     terrain strategy
 *   - the runtime consumer (ReelPlayer) must call this engine OUTSIDE
 *     React's render cycle to keep Pixel 6a above 24 fps
 */

import { interpolateRoute, distanceKm } from "../utils/route";

export const RAIL_FEATURE_TYPES = ["bridge", "tunnel", "station", "river-crossing", "viaduct"];

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Total elevation gain (positive deltas only) and route length in km.
 */
export function profileStats(waypoints) {
  let gain = 0;
  let totalKm = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    const d = b.elev - a.elev;
    if (d > 0) gain += d;
    totalKm += distanceKm(a, b);
  }
  return { gain, totalKm };
}

/**
 * Slope (meters of elevation gain per meter of horizontal distance) in a
 * small window around progress `t`. Used by the terrain heuristic.
 */
export function localSlope(waypoints, t, window = 0.05) {
  const aT = Math.max(0, t - window);
  const bT = Math.min(1, t + window);
  const a = interpolateRoute(waypoints, aT);
  const b = interpolateRoute(waypoints, bT);
  const km = distanceKm(a, b);
  if (km <= 0) return 0;
  return Math.abs(b.elev - a.elev) / (km * 1000);
}

/**
 * Pure: local speed factor — distance covered per unit t-progress in a
 * small window. Normalized against the average route segment so the
 * output is roughly 0..2 where 1 = average pace. Slow sections (zig-zags,
 * dense detail) return < 1; fast sections (long straights) return > 1.
 */
export function localSpeedFactor(waypoints, t, window = 0.05) {
  if (!waypoints || waypoints.length < 2) return 1;
  const aT = Math.max(0, t - window);
  const bT = Math.min(1, t + window);
  const a = interpolateRoute(waypoints, aT);
  const b = interpolateRoute(waypoints, bT);
  if (!a || !b) return 1;
  const localKm = distanceKm(a, b);
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) total += distanceKm(waypoints[i - 1], waypoints[i]);
  const avgKmPerT = total / 1; // total / range(t) where range(t) = 1
  const windowKmPerT = localKm / (bT - aT || 1);
  if (avgKmPerT <= 0) return 1;
  return clamp(windowKmPerT / avgKmPerT, 0, 3);
}

/**
 * Pure: proximity factor — 0..1 score for "are we right next to a
 * landmark?" Returns 1 when within ~0.5 km of any landmark; falls off
 * to 0 by ~3 km. Drives the "slow zoom near landmarks" adaptive rule.
 */
export function landmarkProximityFactor(landmarks, pos, { nearKm = 0.5, farKm = 3 } = {}) {
  if (!pos || !Array.isArray(landmarks) || landmarks.length === 0) return 0;
  let minD = Infinity;
  for (const lm of landmarks) {
    const d = distanceKm(pos, lm);
    if (d < minD) minD = d;
  }
  if (minD <= nearKm) return 1;
  if (minD >= farKm) return 0;
  return 1 - (minD - nearKm) / (farKm - nearKm);
}

/**
 * Terrain heuristic. Returns CameraStep[] sampled at 8 evenly-spaced t.
 *
 * Pitch range 30..60. Steeper → higher pitch + tighter zoom. Bearing
 * sweeps gently across the journey for visual variety.
 */
export function terrainHeuristic(route, landmarks = [], { baseZoom = 12.5 } = {}) {
  const wps = route?.waypoints || [];
  if (wps.length < 2) return [];
  const N = 8;
  const steps = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const slope = localSlope(wps, t);
    const slopeScore = clamp(slope * 30, 0, 1); // 30 m gain over 1 km == max intensity
    // v3.3 adaptive cadence: landmark proximity tightens zoom + tilts up;
    // local speed eases pitch back on fast straights (gives the eye room).
    const here = interpolateRoute(wps, t);
    const proximity = landmarkProximityFactor(landmarks, here);
    const speed = localSpeedFactor(wps, t);
    const speedDamp = clamp(1 - (speed - 1) * 0.3, 0.6, 1);
    const pitch = clamp(
      30 + slopeScore * 30 * speedDamp + proximity * 8,
      25, 65
    );
    const zoom = clamp(
      baseZoom + slopeScore * 1.5 + proximity * 1.2,
      baseZoom - 0.5,
      baseZoom + 2.5
    );
    const bearing = -25 + Math.sin(t * Math.PI) * 35;
    const step = { t, zoom, pitch, bearing };
    if (proximity > 0.7) step.holdMs = 600; // pause at landmark crossings
    steps.push(step);
  }
  return steps;
}

/**
 * Rail heuristic. Returns CameraStep[] sampled at 10 evenly-spaced t.
 *
 * Density score = count of rail-feature landmarks within 10 km of the
 * current position, normalised so 3+ features in window = max
 * intensity. Density drives pitch (22..50) + zoom (10..13). Holds 0.8s
 * at high-density moments. Bearing wobbles ±12° from -15° baseline so
 * the route reads as scenic parallel motion, not a climb.
 */
export function railHeuristic(route, landmarks = [], { baseZoom = 10.5 } = {}) {
  const wps = route?.waypoints || [];
  if (wps.length < 2) return [];
  const railLandmarks = (landmarks || []).filter((l) => RAIL_FEATURE_TYPES.includes(l.type));
  const N = 10;
  const steps = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const here = interpolateRoute(wps, t);
    const nearby = railLandmarks.filter((l) => distanceKm(here, l) < 10).length;
    const density = clamp(nearby / 3, 0, 1);
    const pitch = clamp(28 + density * 22, 22, 50);
    const zoom = clamp(baseZoom + density * 2.5, baseZoom - 0.5, baseZoom + 2.5);
    const bearing = -15 + Math.sin(t * Math.PI * 2) * 12;
    const step = { t, zoom, pitch, bearing };
    if (density > 0.6) step.holdMs = 800;
    steps.push(step);
  }
  return steps;
}

/**
 * Strategy router. Returns a CameraStep[] for the given config.
 *
 * Precedence:
 *   1. config.cameraPlan (build-time-baked plan, used verbatim)
 *   2. config.cameraStrategy ("terrain" | "rail")
 *   3. config.mode === "rail" → rail; else terrain
 */
export function planCamera(config) {
  if (Array.isArray(config?.cameraPlan) && config.cameraPlan.length > 0) {
    return config.cameraPlan;
  }
  const route = config?.routes?.[0];
  if (!route) return [];
  const opts = { baseZoom: config.topography?.zoom };
  const strategy = config.cameraStrategy || (config.mode === "rail" ? "rail" : "terrain");
  if (strategy === "rail") return railHeuristic(route, config.landmarks, opts);
  return terrainHeuristic(route, config.landmarks, opts);
}

/**
 * Linear interpolation between adjacent CameraSteps by global progress t.
 * Returns the same shape as a CameraStep.
 */
export function sampleCameraPlan(plan, t) {
  if (!plan || plan.length === 0) return null;
  if (plan.length === 1) return plan[0];
  if (t <= plan[0].t) return plan[0];
  if (t >= plan[plan.length - 1].t) return plan[plan.length - 1];
  for (let i = 0; i < plan.length - 1; i++) {
    const a = plan[i];
    const b = plan[i + 1];
    if (b.t >= t) {
      const span = b.t - a.t;
      const k = span > 0 ? (t - a.t) / span : 0;
      return {
        t,
        zoom: a.zoom + (b.zoom - a.zoom) * k,
        pitch: a.pitch + (b.pitch - a.pitch) * k,
        bearing: a.bearing + (b.bearing - a.bearing) * k,
      };
    }
  }
  return plan[plan.length - 1];
}
