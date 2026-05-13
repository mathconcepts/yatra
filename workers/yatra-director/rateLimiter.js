/**
 * Per-IP rate limiter — fixed-window counters across three timescales.
 *
 * Why three windows: a single bucket can either be too tight (a user
 * legitimately retries a failed request and gets blocked) or too loose
 * (a fast bot empties the budget before the day bucket notices).
 * 10/min + 60/hr + 200/day catches both abuse profiles without
 * frustrating an actual user.
 *
 * Why a Durable Object: KV is eventually consistent so two concurrent
 * requests can both pass a per-IP counter near the cap. A DO is
 * single-threaded per id, which is exactly the consistency the limiter
 * needs without the operational complexity of Redis.
 *
 * Pure split:
 *   - rolloverState: pure (state, now) → state-after-bucket-rollovers
 *   - checkAndConsume: pure (state, now, limits) → {state, allowed,
 *       limit, remaining, resetAtMs, retryAfterMs}. Testable with no DO.
 *   - RateLimiter class: thin DO wrapper around `checkAndConsume` that
 *     reads/writes storage. Production binds this; tests exercise the
 *     pure function directly.
 */

const DEFAULT_LIMITS = Object.freeze({
  perMinute: 10,
  perHour: 60,
  perDay: 200,
});

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Pure: compute the bucket id for a timestamp at a given window. */
export function bucketId(nowMs, windowMs) {
  return Math.floor(nowMs / windowMs);
}

/** Pure: start of the next bucket boundary (for Retry-After math). */
export function nextBucketStartMs(nowMs, windowMs) {
  return (bucketId(nowMs, windowMs) + 1) * windowMs;
}

/**
 * Pure: roll over bucket counters that span past their window. State
 * stays valid after this returns; counts are zeroed for any window
 * that's moved into a new bucket.
 */
export function rolloverState(state, nowMs) {
  const next = { ...state };
  const m = bucketId(nowMs, MINUTE_MS);
  const h = bucketId(nowMs, HOUR_MS);
  const d = bucketId(nowMs, DAY_MS);
  if (state.minuteBucket !== m) { next.minuteBucket = m; next.minuteCount = 0; }
  if (state.hourBucket !== h)   { next.hourBucket = h;   next.hourCount = 0; }
  if (state.dayBucket !== d)    { next.dayBucket = d;    next.dayCount = 0; }
  return next;
}

/**
 * Initial state for a fresh IP.
 */
export function emptyState() {
  return {
    minuteBucket: -1, minuteCount: 0,
    hourBucket: -1, hourCount: 0,
    dayBucket: -1, dayCount: 0,
  };
}

/**
 * Pure: check + consume one slot. Returns the updated state plus an
 * audit struct the caller can turn into headers / problem responses.
 *
 * Returns `{state, allowed, limit, remaining, resetAtMs, retryAfterMs}`.
 *
 * - When ALLOWED, all three counts have already been incremented in
 *   the returned state.
 * - When BLOCKED, counts are NOT incremented (don't penalize the
 *   blocked request itself). `limit` and `remaining` reflect the
 *   tightest binding limit. `retryAfterMs` points to when that
 *   limit's bucket rolls over.
 */
export function checkAndConsume(state, nowMs, limits = DEFAULT_LIMITS) {
  const rolled = rolloverState(state, nowMs);

  // Project what the counts would be after this request.
  const proj = {
    minute: rolled.minuteCount + 1,
    hour: rolled.hourCount + 1,
    day: rolled.dayCount + 1,
  };

  const overMinute = proj.minute > limits.perMinute;
  const overHour = proj.hour > limits.perHour;
  const overDay = proj.day > limits.perDay;

  if (overMinute || overHour || overDay) {
    // Block. Pick the tightest binding window for headers.
    let limit, remaining, resetAtMs, window;
    if (overMinute) {
      limit = limits.perMinute;
      remaining = Math.max(0, limit - rolled.minuteCount);
      resetAtMs = nextBucketStartMs(nowMs, MINUTE_MS);
      window = "minute";
    } else if (overHour) {
      limit = limits.perHour;
      remaining = Math.max(0, limit - rolled.hourCount);
      resetAtMs = nextBucketStartMs(nowMs, HOUR_MS);
      window = "hour";
    } else {
      limit = limits.perDay;
      remaining = Math.max(0, limit - rolled.dayCount);
      resetAtMs = nextBucketStartMs(nowMs, DAY_MS);
      window = "day";
    }
    return {
      state: rolled,
      allowed: false,
      limit,
      remaining,
      resetAtMs,
      retryAfterMs: resetAtMs - nowMs,
      window,
    };
  }

  // Allow. Increment all three.
  const next = {
    ...rolled,
    minuteCount: proj.minute,
    hourCount: proj.hour,
    dayCount: proj.day,
  };

  // Header math: report against the most restrictive remaining window.
  const minuteLeft = limits.perMinute - next.minuteCount;
  const hourLeft = limits.perHour - next.hourCount;
  const dayLeft = limits.perDay - next.dayCount;
  const tightest = Math.min(minuteLeft, hourLeft, dayLeft);
  let resetAtMs, limit, window;
  if (tightest === minuteLeft) {
    limit = limits.perMinute; resetAtMs = nextBucketStartMs(nowMs, MINUTE_MS); window = "minute";
  } else if (tightest === hourLeft) {
    limit = limits.perHour; resetAtMs = nextBucketStartMs(nowMs, HOUR_MS); window = "hour";
  } else {
    limit = limits.perDay; resetAtMs = nextBucketStartMs(nowMs, DAY_MS); window = "day";
  }

  return {
    state: next,
    allowed: true,
    limit,
    remaining: Math.max(0, tightest),
    resetAtMs,
    retryAfterMs: 0,
    window,
  };
}

/**
 * Durable Object class. Persists a single per-IP state document. The
 * Worker fetches the DO stub via env.RATE_LIMITER.idFromName(ip) and
 * POSTs to /consume.
 */
export class RateLimiter {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/consume") {
      return new Response("not found", { status: 404 });
    }
    let limits = DEFAULT_LIMITS;
    try {
      const body = await request.json();
      if (body && typeof body === "object" && body.limits) {
        limits = { ...DEFAULT_LIMITS, ...body.limits };
      }
    } catch { /* default limits */ }

    const stored = (await this.state.storage.get("state")) || emptyState();
    const result = checkAndConsume(stored, Date.now(), limits);
    await this.state.storage.put("state", result.state);
    return new Response(
      JSON.stringify({
        allowed: result.allowed,
        limit: result.limit,
        remaining: result.remaining,
        resetAtMs: result.resetAtMs,
        retryAfterMs: result.retryAfterMs,
        window: result.window,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
}

/**
 * Worker-side helper: call the rate-limiter DO for a given IP. Returns
 * the same shape as `checkAndConsume`'s return minus `state` (which the
 * DO keeps internal). On any error (DO down, malformed response), the
 * helper returns `{allowed: true, _degraded: true}` — fail-open is the
 * pragmatic side-project default. SECURITY.md notes this.
 */
export async function consumeForIp(env, ip, limits = DEFAULT_LIMITS) {
  if (!env?.RATE_LIMITER || !ip) return { allowed: true, _degraded: true };
  try {
    const id = env.RATE_LIMITER.idFromName(ip);
    const stub = env.RATE_LIMITER.get(id);
    const res = await stub.fetch("https://rl.internal/consume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limits }),
    });
    if (!res.ok) return { allowed: true, _degraded: true };
    return await res.json();
  } catch {
    return { allowed: true, _degraded: true };
  }
}

export const __defaults = { DEFAULT_LIMITS, MINUTE_MS, HOUR_MS, DAY_MS };
