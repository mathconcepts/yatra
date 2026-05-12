/**
 * Tiny GPX parser. Pure — accepts a string, returns waypoints.
 *
 * Why hand-rolled instead of a dependency: GPX is XML with <trkpt lat lon>
 * and optional <ele>. That's ~30 lines of DOMParser code. A library would
 * add 30 kB and a transitive surface for what amounts to a string scan.
 *
 * Supported: <trkpt>, <rtept>, <wpt> (in that priority order). Strava,
 * Garmin, Komoot, and FIT-converters all emit at least one of these.
 *
 * Returns { waypoints: [{lat, lon, elev}], name?: string, error?: string }.
 */

const POINT_TAGS = ["trkpt", "rtept", "wpt"];

export function parseGPX(xmlString) {
  if (typeof xmlString !== "string" || xmlString.trim().length === 0) {
    return { waypoints: [], error: "empty input" };
  }
  if (typeof DOMParser === "undefined") {
    return { waypoints: [], error: "DOMParser unavailable" };
  }
  let doc;
  try {
    doc = new DOMParser().parseFromString(xmlString, "application/xml");
  } catch (e) {
    return { waypoints: [], error: "parse failed" };
  }
  if (!doc || doc.getElementsByTagName("parsererror").length > 0) {
    return { waypoints: [], error: "malformed XML" };
  }

  let nodes = [];
  for (const tag of POINT_TAGS) {
    const found = doc.getElementsByTagName(tag);
    if (found.length > 0) { nodes = Array.from(found); break; }
  }
  if (nodes.length === 0) {
    return { waypoints: [], error: "no track points found" };
  }

  const waypoints = [];
  for (const n of nodes) {
    const lat = parseFloat(n.getAttribute("lat"));
    const lon = parseFloat(n.getAttribute("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    let elev = 0;
    const eleNode = n.getElementsByTagName("ele")[0];
    if (eleNode && eleNode.textContent) {
      const e = parseFloat(eleNode.textContent);
      if (Number.isFinite(e)) elev = e;
    }
    waypoints.push({ lat, lon, elev });
  }

  const nameNode = doc.getElementsByTagName("name")[0];
  const name = nameNode?.textContent?.trim() || null;
  return { waypoints, name };
}

/**
 * Pure: Douglas-Peucker simplification. Trims dense GPX (10k points
 * typical from a watch) down to ~500 for snappy rendering. Tolerance is
 * in degrees; 0.0001° ≈ 11m at the equator, which is plenty for the
 * vertical reel camera.
 */
export function simplify(points, tolerance = 0.0001) {
  if (!Array.isArray(points) || points.length < 3) return points || [];
  const last = points.length - 1;
  return _dpRecurse(points, 0, last, tolerance);
}

function _dpRecurse(pts, first, last, tol) {
  let maxD = 0;
  let idx = 0;
  for (let i = first + 1; i < last; i++) {
    const d = _perpDist(pts[i], pts[first], pts[last]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tol) return [pts[first], pts[last]];
  const left = _dpRecurse(pts, first, idx, tol);
  const right = _dpRecurse(pts, idx, last, tol);
  return [...left.slice(0, -1), ...right];
}

function _perpDist(p, a, b) {
  const dx = b.lon - a.lon;
  const dy = b.lat - a.lat;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    const ddx = p.lon - a.lon;
    const ddy = p.lat - a.lat;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }
  const t = ((p.lon - a.lon) * dx + (p.lat - a.lat) * dy) / len2;
  const tc = Math.max(0, Math.min(1, t));
  const projx = a.lon + tc * dx;
  const projy = a.lat + tc * dy;
  return Math.hypot(p.lon - projx, p.lat - projy);
}
