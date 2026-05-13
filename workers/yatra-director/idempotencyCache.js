/**
 * Idempotency cache for Worker routes.
 *
 * Goal: a viral share URL that gets hit 10k times by a scraper must NOT
 * generate 10k Claude calls and 40k Google TTS calls. The cache keys
 * each request by content fingerprint and returns the prior response
 * when one exists.
 *
 * Backend: Cloudflare KV. Free tier: 100k reads/day, 1k writes/day,
 * 25MB max value. For our values (script JSON ~2KB, TTS MP3 ~50KB per
 * scene) we stay well under.
 *
 * Key scheme:
 *   /v1/script: sha256("script:" + routeId + ":" + tone + ":" + language + ":" + durationS)
 *   /v1/tts:    sha256("tts:" + voiceId + ":" + tempo + ":" + sha256(text))
 *
 * (Nested sha256 on text means we never store the raw text in the key,
 * which is a small privacy hedge.)
 *
 * Pure split:
 *   - sha256Hex: thin Web Crypto wrapper; testable via injected crypto.subtle
 *   - buildScriptCacheKey, buildTtsCacheKey: pure key builders
 *   - getCached, putCached: thin KV wrappers; tests inject a Map-backed fake
 */

const SCRIPT_TTL_S = 60 * 60 * 24 * 30; // 30 days
const TTS_TTL_S = 60 * 60 * 24 * 30; // 30 days

/**
 * Pure-ish: hex sha256 of a UTF-8 string. Uses `subtle.digest`; works in
 * both Workers and modern node (vitest). For node < 19 / weird envs
 * this throws — that's fine, every supported runtime has it now.
 */
export async function sha256Hex(s, { subtle = globalThis.crypto?.subtle } = {}) {
  if (!subtle?.digest) throw new Error("sha256Hex: crypto.subtle not available");
  const data = new TextEncoder().encode(String(s));
  const hashBuf = await subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hashBuf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    const h = bytes[i].toString(16);
    hex += h.length === 1 ? "0" + h : h;
  }
  return hex;
}

/** Pure helper: build the /v1/script cache key. */
export async function buildScriptCacheKey({ routeId, tone, language, durationS }) {
  if (!routeId || !tone || !language) {
    throw new Error("buildScriptCacheKey: routeId, tone, language required");
  }
  return "script:" + (await sha256Hex(`${routeId}:${tone}:${language}:${durationS ?? 30}`));
}

/**
 * Build the /v1/tts cache key. Text is hashed before being included in
 * the key — never store raw user text in the cache key namespace.
 */
export async function buildTtsCacheKey({ voiceId, tempo, text, language }) {
  if (!voiceId || !text || !language) {
    throw new Error("buildTtsCacheKey: voiceId, text, language required");
  }
  const textHash = await sha256Hex(text);
  return "tts:" + (await sha256Hex(`${voiceId}:${language}:${tempo ?? 1.0}:${textHash}`));
}

/**
 * KV-backed cache read. `kv` is the Cloudflare KV namespace binding
 * (production), or a fake `{ get: (k, type) => value }` (tests).
 * `as` is "json" | "arrayBuffer" | "text".
 *
 * Returns null on miss. Errors are swallowed silently — a cache miss is
 * never worse than calling the upstream.
 */
export async function getCached(kv, key, { as = "json" } = {}) {
  if (!kv || typeof kv.get !== "function") return null;
  try {
    const v = await kv.get(key, as === "arrayBuffer" ? "arrayBuffer" : as);
    return v ?? null;
  } catch {
    return null;
  }
}

/**
 * KV-backed cache write. Silently swallows errors — a failed write
 * means the next request pays for regeneration, not a user error.
 *
 * `value` should match `as` ("json" → serialized via JSON.stringify;
 * "arrayBuffer" → raw bytes; "text" → string).
 */
export async function putCached(kv, key, value, { as = "json", ttlS } = {}) {
  if (!kv || typeof kv.put !== "function") return false;
  const ttl = Number.isFinite(ttlS) ? ttlS : (key.startsWith("tts:") ? TTS_TTL_S : SCRIPT_TTL_S);
  try {
    const body = as === "json" ? JSON.stringify(value) : value;
    await kv.put(key, body, { expirationTtl: ttl });
    return true;
  } catch {
    return false;
  }
}

export const __ttls = { SCRIPT_TTL_S, TTS_TTL_S };
