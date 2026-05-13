/**
 * Pure helpers for comparing journeys (v3.4 Slice P).
 *
 * Given two LocationConfigs, compute side-by-side stats so the user can
 * see the deltas without computing them in the UI layer.
 */

import { distanceKm } from "../utils/route";

/**
 * Pure: total route distance + elevation gain + landmark count.
 */
export function summarizeJourney(config) {
  if (!config) return null;
  const route = config.routes?.[0];
  const wps = route?.waypoints || [];
  let totalKm = 0;
  let gain = 0;
  for (let i = 1; i < wps.length; i++) {
    totalKm += distanceKm(wps[i - 1], wps[i]);
    const d = (wps[i].elev ?? 0) - (wps[i - 1].elev ?? 0);
    if (d > 0) gain += d;
  }
  return {
    title: config.title || "Memory",
    color: route?.color || "#8a4528",
    waypoints: wps.length,
    landmarks: (config.landmarks || []).length,
    distanceKm: Math.round(totalKm * 10) / 10,
    elevationGainM: Math.round(gain),
    mode: config.mode || "road",
  };
}

/**
 * Pure: union bounds of multiple configs — used to fit the comparison map.
 */
export function unionBounds(configs) {
  const valid = (configs || []).filter((c) => c?.bounds);
  if (valid.length === 0) return null;
  return {
    latMin: Math.min(...valid.map((c) => c.bounds.latMin)),
    latMax: Math.max(...valid.map((c) => c.bounds.latMax)),
    lonMin: Math.min(...valid.map((c) => c.bounds.lonMin)),
    lonMax: Math.max(...valid.map((c) => c.bounds.lonMax)),
  };
}

/**
 * Pure: produce a side-by-side stats table the UI can render directly.
 */
export function compareStats(configA, configB) {
  const a = summarizeJourney(configA);
  const b = summarizeJourney(configB);
  if (!a || !b) return null;
  return {
    a, b,
    deltas: {
      distanceKm: Math.round((b.distanceKm - a.distanceKm) * 10) / 10,
      elevationGainM: b.elevationGainM - a.elevationGainM,
      waypoints: b.waypoints - a.waypoints,
      landmarks: b.landmarks - a.landmarks,
    },
  };
}
