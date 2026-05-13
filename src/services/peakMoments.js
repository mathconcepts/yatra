/**
 * Peak moments detector (v3.3 Slice O).
 *
 * Pure: given a config (route + landmarks), return a sorted array of
 * `{t, label, kind}` representing the "best moments" of the journey.
 * UI renders these as scrubbable chips below the timeline so the user
 * can jump to interesting parts without scrubbing blindly.
 *
 * Detection rules:
 *   - Origin (t=0) and Destination (t=1) — always
 *   - Each landmark — mapped to its closest t on the route
 *   - Steepest 100m+ elevation gain segment — "Steepest climb"
 *   - Longest single waypoint segment — "Longest stretch"
 *
 * Duplicates within ±2% t of each other collapse — the earlier wins.
 */

import { distanceKm } from "../utils/route";

/**
 * Pure: map a point (lat/lon) to its closest progress `t` on the route
 * by minimum great-circle distance to each interpolated segment endpoint.
 * Sub-optimal (point-to-vertex not point-to-segment) but plenty for
 * marking landmark positions on a route with 10-500 waypoints.
 */
export function landmarkToT(landmark, waypoints) {
  if (!landmark || !Array.isArray(waypoints) || waypoints.length < 2) return null;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < waypoints.length; i++) {
    const d = distanceKm(landmark, waypoints[i]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best / (waypoints.length - 1);
}

/**
 * Pure: index of the steepest 100m+ gain segment, or -1 if none.
 */
export function steepestClimbIndex(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return -1;
  let bestI = -1;
  let bestGain = 100; // require 100m+ to qualify
  for (let i = 1; i < waypoints.length; i++) {
    const gain = (waypoints[i].elev ?? 0) - (waypoints[i - 1].elev ?? 0);
    if (gain > bestGain) { bestGain = gain; bestI = i; }
  }
  return bestI;
}

/**
 * Pure: index of the longest single segment by great-circle distance,
 * or -1 if there are fewer than 2 waypoints.
 */
export function longestStretchIndex(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 2) return -1;
  let bestI = -1;
  let bestKm = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const km = distanceKm(waypoints[i - 1], waypoints[i]);
    if (km > bestKm) { bestKm = km; bestI = i; }
  }
  return bestI;
}

/**
 * Pure: return chips sorted by t. Deduplicates near-coincident chips
 * by keeping the earlier-emitted one.
 */
export function detectPeakMoments(config) {
  if (!config) return [];
  const route = config.routes?.[0];
  const wps = route?.waypoints;
  if (!Array.isArray(wps) || wps.length < 2) return [];

  // Emit order matters: dedupe keeps the earliest-emitted at each t-bucket
  // after stable sort, so origin and destination must emit BEFORE any
  // peaks that might land at t=0 or t=1.
  const chips = [];
  if (config.origin?.name) chips.push({ t: 0, label: config.origin.name, kind: "origin" });
  if (config.destination?.name) chips.push({ t: 1, label: config.destination.name, kind: "destination" });

  for (const lm of config.landmarks || []) {
    const t = landmarkToT(lm, wps);
    if (t == null) continue;
    if (t <= 0.01 || t >= 0.99) continue; // skip — origin / destination cover these
    chips.push({ t, label: lm.name || "Landmark", kind: lm.type || "landmark" });
  }

  const steepIdx = steepestClimbIndex(wps);
  if (steepIdx > 0) {
    chips.push({
      t: steepIdx / (wps.length - 1),
      label: "Steepest climb",
      kind: "peak-climb",
    });
  }

  const longIdx = longestStretchIndex(wps);
  if (longIdx > 0) {
    chips.push({
      t: longIdx / (wps.length - 1),
      label: "Longest stretch",
      kind: "peak-stretch",
    });
  }

  chips.sort((a, b) => a.t - b.t);

  // Dedupe within ±2% t
  const out = [];
  for (const c of chips) {
    if (out.length === 0 || c.t - out[out.length - 1].t > 0.02) out.push(c);
  }
  return out;
}
