/**
 * Share-link encoder (v3.2 Slice L) — serializes a LocationConfig into a
 * URL-safe base64 string suitable for `?memory=…` URL fragments.
 *
 * No backend, no upload: the URL itself carries the memory. Practical
 * limits — most browsers accept ~32 KB URLs; a 10-waypoint composed reel
 * encodes to roughly 1-3 KB, well under the limit. Konkan-sized (18 wp +
 * 8 landmarks) encodes to ~6 KB. Long imported GPX tracks (~500 points)
 * land around 25-30 KB — close to limits, so we strip imported waypoint
 * elevations to save bytes when the encoded length would exceed 24 KB.
 *
 * Pure helpers, all exported for unit testing.
 */

const URL_BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const TARGET_MAX_BYTES = 24 * 1024;

/**
 * Pure: encode a config to a URL-safe base64 string. Returns null if
 * the input is invalid.
 */
export function encodeMemoryUrl(config) {
  if (!config || typeof config !== "object") return null;
  let compact = compactConfig(config);
  let json = JSON.stringify(compact);
  let bytes = _utf8Bytes(json);
  if (bytes.length > TARGET_MAX_BYTES) {
    // Drop elevations from waypoints — saves ~10% on long routes.
    compact = compactConfig(config, { stripElev: true });
    json = JSON.stringify(compact);
    bytes = _utf8Bytes(json);
  }
  return _bytesToBase64Url(bytes);
}

/**
 * Pure: decode a URL fragment to a config, or null if invalid.
 */
export function decodeMemoryUrl(encoded) {
  if (typeof encoded !== "string" || encoded.length === 0) return null;
  try {
    const bytes = _base64UrlToBytes(encoded);
    const json = _bytesToUtf8(bytes);
    const compact = JSON.parse(json);
    return expandCompact(compact);
  } catch {
    return null;
  }
}

/**
 * Pure: drop heavyweight fields so the URL stays small. We only need
 * what ReelPlayer actually reads: title, bounds, origin, destination,
 * route waypoints + color, landmarks (without photoUrl), topography,
 * culture.accentColor.
 */
export function compactConfig(config, { stripElev = false } = {}) {
  const route = config.routes?.[0] || {};
  return {
    t: config.title || "Memory",
    s: config.subtitle || "",
    b: [config.bounds.latMin, config.bounds.latMax, config.bounds.lonMin, config.bounds.lonMax],
    o: [config.origin?.name || "Start", config.origin?.lat, config.origin?.lon],
    d: [config.destination?.name || "End", config.destination?.lat, config.destination?.lon],
    m: config.mode || "road",
    rc: route.color || "#8a4528",
    rn: route.name || config.title || "Route",
    w: (route.waypoints || []).map((p) => stripElev ? [p.lat, p.lon] : [p.lat, p.lon, p.elev || 0]),
    l: (config.landmarks || []).map((lm) => ({
      i: lm.id || "",
      n: lm.name || "",
      p: [lm.lat, lm.lon, lm.elev || 0],
      y: lm.type || "milestone",
      bl: lm.blurb || "",
    })),
    tg: {
      bm: config.topography?.basemap || "imagery",
      z: config.topography?.zoom ?? 11,
      pi: config.topography?.pitch ?? 35,
      be: config.topography?.bearing ?? -15,
      te: config.topography?.terrainExaggeration ?? 1.2,
    },
    ac: config.culture?.accentColor || "#8a4528",
  };
}

/**
 * Pure: expand a compacted object back into a LocationConfig shape.
 */
export function expandCompact(c) {
  if (!c || typeof c !== "object") return null;
  if (!Array.isArray(c.b) || c.b.length !== 4) return null;
  if (!Array.isArray(c.w)) return null;
  return {
    id: `shared-${Date.now()}`,
    title: c.t || "Shared memory",
    subtitle: c.s || "",
    bounds: { latMin: c.b[0], latMax: c.b[1], lonMin: c.b[2], lonMax: c.b[3] },
    origin: c.o ? { name: c.o[0], lat: c.o[1], lon: c.o[2], elev: 0 } : null,
    destination: c.d ? { name: c.d[0], lat: c.d[1], lon: c.d[2], elev: 0 } : null,
    mode: c.m || "road",
    routes: [{
      id: "shared-route",
      name: c.rn || "Route",
      color: c.rc || "#8a4528",
      difficulty: "Easy",
      stats: { distanceKm: 0, durationHr: 0 },
      waypoints: c.w.map((p) => ({ lat: p[0], lon: p[1], elev: p[2] ?? 0 })),
    }],
    landmarks: (c.l || []).map((lm, i) => ({
      id: lm.i || `lm-${i}`,
      name: lm.n || "Landmark",
      lat: lm.p[0], lon: lm.p[1], elev: lm.p[2] ?? 0,
      type: lm.y || "milestone",
      blurb: lm.bl || "",
    })),
    topography: {
      basemap: c.tg?.bm || "imagery",
      zoom: c.tg?.z ?? 11,
      pitch: c.tg?.pi ?? 35,
      bearing: c.tg?.be ?? -15,
      terrainExaggeration: c.tg?.te ?? 1.2,
    },
    region: { country: "—", state: "—", district: "—", governingBody: "—", timeZone: "UTC", advisories: [] },
    culture: { accentColor: c.ac || "#8a4528", motif: "shared memory", invocation: "", summary: "" },
    units: { distance: "km", elevation: "m", temperature: "C" },
  };
}

/**
 * Pure: read `?memory=…` from a URL, return decoded config or null.
 */
export function readMemoryFromUrl(href) {
  if (typeof href !== "string") return null;
  let url;
  try { url = new URL(href); } catch { return null; }
  const enc = url.searchParams.get("memory");
  if (!enc) return null;
  return decodeMemoryUrl(enc);
}

/* ─── utf-8 + url-safe base64 ───────────────────────────────────────── */

function _utf8Bytes(s) {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s);
  // Node-only fallback for tests in environments without TextEncoder.
  return new Uint8Array(Buffer.from(s, "utf8"));
}

function _bytesToUtf8(bytes) {
  if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(bytes);
  return Buffer.from(bytes).toString("utf8");
}

function _bytesToBase64Url(bytes) {
  let out = "";
  let i;
  for (i = 0; i + 3 <= bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += URL_BASE64[(n >> 18) & 63] + URL_BASE64[(n >> 12) & 63] + URL_BASE64[(n >> 6) & 63] + URL_BASE64[n & 63];
  }
  if (i < bytes.length) {
    const rem = bytes.length - i;
    const a = bytes[i];
    const b = rem > 1 ? bytes[i + 1] : 0;
    out += URL_BASE64[(a >> 2) & 63];
    out += URL_BASE64[((a & 3) << 4) | ((b >> 4) & 15)];
    if (rem > 1) out += URL_BASE64[((b & 15) << 2)];
  }
  return out;
}

function _base64UrlToBytes(s) {
  const lookup = new Int8Array(128).fill(-1);
  for (let i = 0; i < URL_BASE64.length; i++) lookup[URL_BASE64.charCodeAt(i)] = i;
  const len = s.length;
  // Whole 4-char groups + any leftover (2 or 3 chars)
  const fullGroups = Math.floor(len / 4);
  const rem = len % 4;
  const outLen = fullGroups * 3 + (rem === 2 ? 1 : rem === 3 ? 2 : 0);
  const out = new Uint8Array(outLen);
  let o = 0;
  let i = 0;
  for (let g = 0; g < fullGroups; g++, i += 4) {
    const a = lookup[s.charCodeAt(i)];
    const b = lookup[s.charCodeAt(i + 1)];
    const c = lookup[s.charCodeAt(i + 2)];
    const d = lookup[s.charCodeAt(i + 3)];
    if ((a | b | c | d) < 0) throw new Error("bad b64");
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    out[o++] = (n >> 16) & 0xff;
    out[o++] = (n >> 8) & 0xff;
    out[o++] = n & 0xff;
  }
  if (rem === 2) {
    const a = lookup[s.charCodeAt(i)];
    const b = lookup[s.charCodeAt(i + 1)];
    if ((a | b) < 0) throw new Error("bad b64");
    out[o++] = ((a << 2) | (b >> 4)) & 0xff;
  } else if (rem === 3) {
    const a = lookup[s.charCodeAt(i)];
    const b = lookup[s.charCodeAt(i + 1)];
    const c = lookup[s.charCodeAt(i + 2)];
    if ((a | b | c) < 0) throw new Error("bad b64");
    out[o++] = ((a << 2) | (b >> 4)) & 0xff;
    out[o++] = (((b & 15) << 4) | (c >> 2)) & 0xff;
  }
  return out;
}
