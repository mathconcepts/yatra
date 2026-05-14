/**
 * Architecture overlay fetcher — pulls a CC0/CC-BY image + caption from
 * Wikimedia Commons for a tour POI's `subTemplate.wikimediaTitle`.
 *
 * Used by Director's tour mode to drop an architectural close-up overlay
 * into one scene per POI. The user can skip the module entirely and the
 * film proceeds with map-only frames.
 *
 * Wikimedia Commons API:
 *   https://commons.wikimedia.org/w/api.php?action=query&...
 * Free, no API key. Rate-limit at ~200 req/sec (we won't get close).
 *
 * Returned shape:
 *   { url, thumbnailUrl, license, artist, descriptionHtml }
 *   or null when the page has no images / 404.
 *
 * Cache: each successful fetch persists in localStorage under
 *   yatra.architecture.cache.v1.<sha256(title)>
 * with a 7-day TTL. Misses are NOT cached (so a temporary outage
 * doesn't poison the cache).
 */

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const CACHE_KEY_PREFIX = "yatra.architecture.cache.v1";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Pure: build the imageinfo query URL for a Commons page title.
 * Title is a category page or file page; we ask the API for the
 * representative image with its CC license metadata.
 */
export function buildCommonsImageUrl(title) {
  const params = new URLSearchParams({
    action: "query",
    prop: "pageimages|imageinfo",
    piprop: "original|thumbnail",
    pithumbsize: "800",
    iiprop: "url|extmetadata",
    titles: title,
    format: "json",
    origin: "*",
  });
  return `${COMMONS_API}?${params.toString()}`;
}

async function sha256Hex(s) {
  if (typeof crypto?.subtle?.digest === "function") {
    const buf = new TextEncoder().encode(s);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  }
  // Fallback: simple string hash (sufficient — collision risk is cache
  // key duplication, not security).
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return ("0000000" + (h >>> 0).toString(16)).slice(-8);
}

function readCache(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt < Date.now()) return null;
    return parsed.value;
  } catch { return null; }
}

function writeCache(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify({
      value, expiresAt: Date.now() + TTL_MS,
    }));
  } catch { /* private mode / quota — drop */ }
}

/**
 * Pure: parse a Commons API response into our internal shape.
 * Exposed for testing without a real HTTP call.
 */
export function parseCommonsResponse(json) {
  const pages = json?.query?.pages;
  if (!pages || typeof pages !== "object") return null;
  for (const page of Object.values(pages)) {
    const original = page.original?.source;
    const thumb = page.thumbnail?.source;
    const url = original || thumb;
    if (!url) continue;
    const meta = page.imageinfo?.[0]?.extmetadata || {};
    const license = meta.LicenseShortName?.value || meta.License?.value || "CC";
    const artist = stripHtml(meta.Artist?.value || "");
    const descriptionHtml = meta.ImageDescription?.value || "";
    return {
      url,
      thumbnailUrl: thumb || url,
      license,
      artist,
      descriptionHtml,
    };
  }
  return null;
}

function stripHtml(html) {
  return String(html || "").replace(/<[^>]+>/g, "").trim();
}

/**
 * Fetch the architecture image + license + attribution for one POI.
 *
 * `title` is the Commons title from the landmark's
 * `subTemplate.wikimediaTitle`. Returns null on miss / network error;
 * never throws — the caller should treat a null as "skip the overlay
 * for this scene."
 */
export async function fetchArchitecture(title, { fetchImpl = globalThis.fetch, signal } = {}) {
  if (typeof title !== "string" || !title.trim()) return null;
  const cacheKey = `${CACHE_KEY_PREFIX}.${await sha256Hex(title)}`;
  const cached = readCache(cacheKey);
  if (cached) return { ...cached, cacheHit: true };

  if (typeof fetchImpl !== "function") return null;
  let res;
  try {
    res = await fetchImpl(buildCommonsImageUrl(title), { signal });
  } catch { return null; }
  if (!res.ok) return null;
  let json;
  try { json = await res.json(); } catch { return null; }
  const parsed = parseCommonsResponse(json);
  if (!parsed) return null;
  writeCache(cacheKey, parsed);
  return { ...parsed, cacheHit: false };
}

/**
 * Fetch architecture overlays for several landmarks in parallel.
 * Returns Map<landmark.id, ArchitectureOverlay | null>. Errors are
 * swallowed per-landmark — partial results are valuable.
 */
export async function fetchArchitectureForLandmarks(landmarks, opts = {}) {
  const out = new Map();
  await Promise.all(
    (landmarks || []).map(async (lm) => {
      const title = lm?.subTemplate?.wikimediaTitle;
      if (!title) { out.set(lm.id, null); return; }
      try {
        out.set(lm.id, await fetchArchitecture(title, opts));
      } catch {
        out.set(lm.id, null);
      }
    }),
  );
  return out;
}
