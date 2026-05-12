/**
 * Pure helpers for composer route construction.
 *
 * Slice B uses interpolateLineWaypoints when both endpoints are known but
 * no GPX track has been imported. Slice C replaces these waypoints with
 * real track data once a GPX file is parsed.
 */

/**
 * Pure: linear interpolation between origin and destination → N waypoints.
 *
 * This is the dumb-but-fine version: it does NOT route on roads. For
 * sub-100 km legs the camera plan reads it as a smooth motion anyway.
 * Real road-routing (OSRM, Mapbox Directions) is intentionally out of
 * scope for v3.1 — adds a key and rate-limit dependency.
 */
export function interpolateLineWaypoints(origin, destination, n = 10) {
  if (!origin || !destination) return [];
  if (typeof origin.lat !== "number" || typeof origin.lon !== "number") return [];
  if (typeof destination.lat !== "number" || typeof destination.lon !== "number") return [];
  const count = Math.max(2, Math.floor(n));
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    out.push({
      lat: origin.lat + (destination.lat - origin.lat) * t,
      lon: origin.lon + (destination.lon - origin.lon) * t,
      elev: 0,
    });
  }
  return out;
}

/**
 * Pure: total straight-line km via Haversine. Lightweight version of the
 * one in utils/route.js — kept here to avoid a circular import in tests
 * that only need the geometry.
 */
export function haversineKm(a, b) {
  if (!a || !b) return 0;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}
