/**
 * Daily-budget guard.
 *
 * Tracks per-day cumulative cost in tenths of a cent (millis of dollars).
 * Each successful upstream call increments the counter for `today` (UTC).
 * Before any paid call, the Worker checks whether the projected cost
 * would tip over `DAILY_CAP_MILLICENTS`. If so, returns a kill response
 * without making the upstream call.
 *
 * Cost model (v1.6.10):
 *   - Claude Haiku 4.5 (script):  ~0.6 cents per request (rough avg)
 *   - Google TTS Wavenet (tts):   1.6 cents per 1k chars (free tier
 *                                  covers 1M chars/month per family, so
 *                                  the realistic charged cost is $0
 *                                  until quota exhausted)
 *
 * We track BUDGETS conservatively: treat every call as paid, ignore
 * free-tier credits. The daily cap is then a hard ceiling on absolute
 * spend regardless of whether free-tier applies.
 *
 * Backend: Cloudflare KV. Key shape: `budget:YYYY-MM-DD`. Per-day key
 * naturally TTLs out after 36h (no manual cleanup needed).
 *
 * Pure split:
 *   - dayKey: pure date → key string
 *   - estimateCost: pure (route, request) → millicents
 *   - checkBudget, recordSpend: thin KV wrappers; tests inject a fake
 */

const DEFAULT_DAILY_CAP_MILLICENTS = 500 * 1000; // $5.00 / day default
const DAY_TTL_S = 60 * 60 * 36; // 36 hours

/** Pure: UTC YYYY-MM-DD for a Date (or now). */
export function dayKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `budget:${y}-${m}-${day}`;
}

/**
 * Pure: estimate the cost of a single request in millicents (tenths of
 * a cent). Conservative — overestimates rather than under.
 *
 * Claude Haiku pricing (~Jan 2026 levels): $1 / 1M input, $5 / 1M output.
 * A /v1/script call uses ~1500 input + 800 output tokens ≈ $0.005 per
 * request ≈ 50 millicents. Round up to 100 to keep a margin.
 *
 * Google Wavenet TTS: $16 / 1M chars (paid tier). A /v1/tts call with
 * ~120 chars per scene ≈ $0.002 ≈ 20 millicents. Round up to 40.
 */
export function estimateCost(route, body) {
  if (route === "/v1/script") return 100; // 1¢
  if (route === "/v1/tts") {
    const text = body?.text || "";
    const chars = text.length;
    // 16 millicents per 1000 chars, round up + 10 millicents overhead.
    return Math.ceil((chars * 16) / 1000) + 10;
  }
  return 0;
}

/**
 * Read the day's running total. Returns 0 on miss or read failure.
 */
export async function readSpend(kv, key) {
  if (!kv || typeof kv.get !== "function") return 0;
  try {
    const raw = await kv.get(key);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Add `costMillicents` to the day's running total. Cloudflare KV is
 * eventually-consistent, so two concurrent requests CAN both succeed
 * over the cap; that's an acceptable side-project tradeoff vs spinning
 * a Durable Object just for the counter. The cap is a coarse ceiling,
 * not a contractual guarantee.
 */
export async function recordSpend(kv, key, costMillicents) {
  if (!kv || typeof kv.put !== "function") return false;
  const prior = await readSpend(kv, key);
  try {
    await kv.put(key, String(prior + costMillicents), { expirationTtl: DAY_TTL_S });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns { allowed, projected, cap }. The Worker checks `allowed`
 * before calling the upstream; on `false`, it returns a 503
 * killswitch-style response.
 *
 * `projected = priorSpend + cost`.
 */
export async function checkBudget({
  kv,
  route,
  body,
  cap = DEFAULT_DAILY_CAP_MILLICENTS,
  now = new Date(),
}) {
  const key = dayKey(now);
  const prior = await readSpend(kv, key);
  const cost = estimateCost(route, body);
  const projected = prior + cost;
  return {
    allowed: projected <= cap,
    projected,
    cost,
    prior,
    cap,
    key,
  };
}

export const __defaults = { DEFAULT_DAILY_CAP_MILLICENTS, DAY_TTL_S };
