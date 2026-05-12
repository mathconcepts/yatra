/**
 * Sample a point along a polyline at progress t ∈ [0, 1].
 * Returns { lat, lon, elev } interpolated linearly between waypoints,
 * weighted by segment length.
 */
export function interpolateRoute(waypoints, t) {
  if (waypoints.length < 2) return waypoints[0];

  const segs = [];
  let total = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1];
    const d = Math.hypot(b.lat - a.lat, b.lon - a.lon);
    segs.push({ a, b, d, cum: total });
    total += d;
  }

  const target = t * total;
  let seg = segs[segs.length - 1];
  for (const s of segs) {
    if (s.cum + s.d >= target) { seg = s; break; }
  }

  const local = Math.max(0, Math.min(1, (target - seg.cum) / (seg.d || 1)));
  return {
    lat:  seg.a.lat  + (seg.b.lat  - seg.a.lat)  * local,
    lon:  seg.a.lon  + (seg.b.lon  - seg.a.lon)  * local,
    elev: seg.a.elev + (seg.b.elev - seg.a.elev) * local,
  };
}

/** Haversine distance in km (used for landmark proximity checks). */
export function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
