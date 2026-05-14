/**
 * Custom journey builder — type any start/end (and optional waypoints),
 * geocode them via Nominatim (OpenStreetMap, free, no API key), and
 * synthesize a LocationConfig on the fly.
 *
 * The result plugs straight into the Director pipeline alongside the
 * predefined LocationConfigs in src/config/. Both flow shapes end up
 * the same downstream (peakMoments → /v1/script → render).
 *
 * Nominatim usage policy: max 1 req/sec, set a real User-Agent (we
 * use "yatra-director/1.8") and provide an email or repo URL via the
 * `referer` header when the app is deployed. Free tier is sufficient
 * for the side-project scale; production deploys should swap in their
 * own Nominatim instance or a paid geocoder before scaling.
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "yatra-director/1.8 (https://github.com/mathconcepts/yatra)";

/**
 * Pure: turn one place name into a geocode request URL.
 */
export function buildGeocodeUrl(query) {
  const params = new URLSearchParams({
    q: query,
    format: "json",
    limit: "1",
    addressdetails: "0",
  });
  return `${NOMINATIM}?${params.toString()}`;
}

/**
 * Geocode one free-form place query. Returns { name, lat, lon } or
 * throws Error with `code` = "not-found" | "network" | "rate".
 */
export async function geocodePlace(query, { fetchImpl = globalThis.fetch, signal } = {}) {
  if (!query || typeof query !== "string" || !query.trim()) {
    const e = new Error("geocodePlace: empty query");
    e.code = "not-found";
    throw e;
  }
  if (typeof fetchImpl !== "function") {
    const e = new Error("geocodePlace: fetch unavailable");
    e.code = "network";
    throw e;
  }
  let res;
  try {
    res = await fetchImpl(buildGeocodeUrl(query), {
      method: "GET",
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw err;
    const e = new Error(`geocodePlace: ${err?.message || err}`);
    e.code = "network";
    throw e;
  }
  if (res.status === 429) {
    const e = new Error("Nominatim rate-limited the request");
    e.code = "rate";
    throw e;
  }
  if (!res.ok) {
    const e = new Error(`Nominatim returned ${res.status}`);
    e.code = "network";
    throw e;
  }
  const json = await res.json();
  if (!Array.isArray(json) || json.length === 0) {
    const e = new Error(`No place matched "${query}"`);
    e.code = "not-found";
    throw e;
  }
  const hit = json[0];
  return {
    name: hit.display_name?.split(",")[0]?.trim() || query.trim(),
    fullName: hit.display_name || query.trim(),
    lat: Number(hit.lat),
    lon: Number(hit.lon),
  };
}

/**
 * Pure: assemble a LocationConfig from already-geocoded points.
 * Used by buildCustomJourney() and directly by tests.
 *
 * `waypoints` is an array of { name, lat, lon } already resolved.
 * The first becomes origin; the last becomes destination; middles
 * become landmarks AND tour POIs.
 */
export function assembleCustomConfig({ title, points, color = "#a05a32" }) {
  if (!Array.isArray(points) || points.length < 2) {
    throw new Error("assembleCustomConfig: need at least 2 points");
  }
  const origin = points[0];
  const dest = points[points.length - 1];
  const middles = points.slice(1, -1);
  const bounds = computeBounds(points);
  const id = `custom-${slug(title || `${origin.name}-${dest.name}`)}-${Date.now().toString(36)}`;
  const landmarks = points.map((p, i) => ({
    id: `pt-${i}`,
    name: p.name,
    lat: p.lat, lon: p.lon, elev: 0,
    type: i === 0 ? "gateway" : i === points.length - 1 ? "destination" : "milestone",
    blurb: p.fullName ? `${p.name} — ${p.fullName}` : p.name,
  }));
  return {
    id,
    title: title || `${origin.name} → ${dest.name}`,
    subtitle: middles.length > 0
      ? `Via ${middles.map((m) => m.name).join(", ")}`
      : "A custom journey",
    bounds,
    origin: { name: origin.name, lat: origin.lat, lon: origin.lon, elev: 0 },
    destination: { name: dest.name, lat: dest.lat, lon: dest.lon, elev: 0 },
    mode: "mixed",
    routes: [{
      id: "direct",
      name: "Direct path",
      color,
      difficulty: "—",
      stats: { distanceKm: round1(haversineKmTotal(points)) },
      waypoints: points.map((p) => ({ lat: p.lat, lon: p.lon, elev: 0 })),
    }],
    landmarks,
    tours: middles.length > 0
      ? [{
          id: "custom-tour",
          name: `Tour: ${origin.name} → ${dest.name}`,
          subtitle: `${points.length} stops`,
          pois: landmarks.map((l) => l.id),
          stats: { distanceKm: round1(haversineKmTotal(points)) },
          color,
        }]
      : [],
    topography: { basemap: "topo", zoom: 11, pitch: 35, bearing: 0, terrainExaggeration: 1.2 },
    region: { country: "", state: "", district: "", governingBody: "", timeZone: "", advisories: [] },
    culture: { accentColor: color, motif: "custom", summary: "A user-defined journey." },
    units: { distance: "km", elevation: "m", temperature: "C" },
  };
}

/**
 * High-level: take a free-form spec, geocode every point, return a
 * ready-to-use LocationConfig. Hits Nominatim sequentially with a 1.1s
 * delay between calls to stay under the rate limit.
 */
export async function buildCustomJourney({
  title,
  originQuery,
  destinationQuery,
  waypointQueries = [],
  color,
  fetchImpl = globalThis.fetch,
  signal,
  delayMs = 1100,
}) {
  const queries = [originQuery, ...waypointQueries, destinationQuery].filter(
    (q) => typeof q === "string" && q.trim().length > 0,
  );
  if (queries.length < 2) {
    throw new Error("buildCustomJourney: provide at least origin + destination");
  }
  const points = [];
  for (let i = 0; i < queries.length; i++) {
    if (i > 0 && delayMs > 0) await sleep(delayMs);
    if (signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
    points.push(await geocodePlace(queries[i], { fetchImpl, signal }));
  }
  return assembleCustomConfig({ title, points, color });
}

// ─── helpers ──────────────────────────────────────────────────────

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function round1(n) { return Math.round(n * 10) / 10; }
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40); }

function computeBounds(points) {
  let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
  for (const p of points) {
    if (p.lat < latMin) latMin = p.lat;
    if (p.lat > latMax) latMax = p.lat;
    if (p.lon < lonMin) lonMin = p.lon;
    if (p.lon > lonMax) lonMax = p.lon;
  }
  // pad
  const pad = 0.05;
  return {
    latMin: latMin - pad, latMax: latMax + pad,
    lonMin: lonMin - pad, lonMax: lonMax + pad,
  };
}

function haversineKmTotal(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineKm(points[i - 1], points[i]);
  }
  return total;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
