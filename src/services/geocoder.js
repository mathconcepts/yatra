/**
 * Nominatim geocoder client — free, no API key, OSM-backed.
 *
 * Usage policy: 1 req/sec, set a User-Agent, link back. We honor this by
 * 1) debouncing in the calling UI, 2) Caching identical queries.
 *
 * Pure helpers (parseNominatim*, scoreResult) are exported separately so
 * tests can exercise them without hitting the network.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const CACHE = new Map(); // q → { ts, results }
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Pure: shape a raw Nominatim result row into our internal {name, lat, lon}.
 * Drops rows missing lat/lon (defensive against API drift).
 */
export function parseNominatimRow(row) {
  if (!row) return null;
  const lat = parseFloat(row.lat);
  const lon = parseFloat(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const name = row.display_name || row.name || "(unknown)";
  return { name, lat, lon, kind: row.type || row.class || "place", importance: row.importance ?? 0 };
}

/**
 * Pure: parse the full array response. Sorted by importance desc.
 */
export function parseNominatimResponse(arr) {
  if (!Array.isArray(arr)) return [];
  const parsed = arr.map(parseNominatimRow).filter(Boolean);
  parsed.sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));
  return parsed;
}

/**
 * Pure: score a candidate against the query — favors prefix match on name.
 * Used to pick the "best" result when the caller wants a single answer.
 */
export function scoreResult(query, candidate) {
  if (!candidate) return 0;
  const q = String(query || "").trim().toLowerCase();
  const n = String(candidate.name || "").toLowerCase();
  if (!q || !n) return candidate.importance ?? 0;
  let score = candidate.importance ?? 0;
  if (n.startsWith(q)) score += 1;
  if (n.includes(q)) score += 0.3;
  return score;
}

/**
 * Search Nominatim for a place. Returns up to `limit` results.
 *
 * - Caches identical queries for an hour.
 * - Aborts the previous in-flight fetch if a new query arrives (the
 *   caller passes an AbortSignal for tighter control in React effects).
 *
 * Returns [] on network error; never throws.
 */
export async function geocode(query, { limit = 5, signal, fetcher } = {}) {
  const q = String(query || "").trim();
  if (q.length < 2) return [];
  const key = `${q}|${limit}`;
  const now = Date.now();
  const cached = CACHE.get(key);
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.results;
  const fetchFn = fetcher || (typeof fetch !== "undefined" ? fetch : null);
  if (!fetchFn) return [];
  const url = `${NOMINATIM_URL}?format=json&limit=${limit}&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetchFn(url, {
      signal,
      headers: { "Accept": "application/json", "Accept-Language": "en" },
    });
    if (!res || !res.ok) return [];
    const json = await res.json();
    const results = parseNominatimResponse(json);
    CACHE.set(key, { ts: now, results });
    return results;
  } catch (err) {
    if (err && err.name === "AbortError") return [];
    return [];
  }
}

/**
 * Clear the in-memory cache. Test-only helper.
 */
export function _clearGeocoderCache() {
  CACHE.clear();
}
