/**
 * yatra-director Worker — entry point.
 *
 * STUB COMMIT. Implements /v1/script as a fixture-echoer so the client
 * can hit a real network path during dev. Auto-decided security controls
 * from the autoplan review are NOT yet enforced — they exist as TODO
 * markers below and as the contract in API.md and SECURITY.md.
 *
 * DO NOT DEPLOY THIS TO A PUBLIC URL YET. Even though it makes no
 * upstream API calls, deploying without Turnstile + rate limits + CORS
 * allowlist normalizes the wrong shape and invites a future "we'll add
 * auth later" mistake. See SECURITY.md for the enforcement checklist.
 */
import { validateScriptRequest, problem } from "../schemas.js";
import { callClaude } from "../claudeClient.js";
import { callGoogleTTS, LANGUAGE_TO_LOCALE } from "../googleTtsClient.js";
import { verifyTurnstileToken } from "../turnstile.js";
import {
  buildScriptCacheKey,
  buildTtsCacheKey,
  getCached,
  putCached,
} from "../idempotencyCache.js";
import { checkBudget, recordSpend } from "../budgetGuard.js";
import { consumeForIp, RateLimiter } from "../rateLimiter.js";
import { SYSTEM_PROMPTS } from "./prompts.js";

const TOTAL_DURATION_S = 30;

// Origin allowlist. Strings match exactly; RegExp values are tested.
// Pages preview deploys land on per-hash *.yatra.pages.dev subdomains,
// which is why the regex form is here.
const CORS_PATTERNS = [
  "http://localhost:5173",
  "http://localhost:8787",
  /^https:\/\/[a-z0-9-]+\.yatra\.pages\.dev$/,
  // Add production custom domain here once configured, e.g.:
  // "https://yatra.<your-domain>",
];

export function isOriginAllowed(origin, patterns = CORS_PATTERNS) {
  if (!origin) return false;
  for (const p of patterns) {
    if (typeof p === "string" && p === origin) return true;
    if (p instanceof RegExp && p.test(origin)) return true;
  }
  return false;
}

function corsHeaders(origin) {
  const allow = isOriginAllowed(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // X-Yatra-User-TTS-Key is the BYOK header for /v1/tts; absent → operator path.
    "Access-Control-Allow-Headers": "Content-Type, X-Yatra-Turnstile, X-Yatra-User-TTS-Key",
    "Vary": "Origin",
  };
}

function jsonResponse(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

function reqId() {
  return crypto.randomUUID();
}

/**
 * Pre-flight: kill switch, Turnstile, budget. Returns either a Response
 * (caller should return it directly) or null (proceed). Same set of
 * checks for /v1/script and /v1/tts so the gate behavior stays uniform.
 *
 * Kill switch is checked first because it's the cheapest exit.
 */
async function preflight({ request, env, origin, id, route, body, cost = null, bypassTurnstile = false, bypassBudget = false }) {
  // 1. Kill switch — operator can flip this to halt all paid work.
  if (env?.DIRECTOR_KILLSWITCH === "1") {
    return jsonResponse(
      503,
      problem({
        slug: "killswitch",
        title: "Director is paused",
        status: 503,
        detail: "Operator has flipped DIRECTOR_KILLSWITCH. All paid routes are returning 503.",
        fix: "Set DIRECTOR_KILLSWITCH=0 in Worker vars and redeploy to resume.",
        requestId: id,
      }),
      origin,
    );
  }

  // 2. Turnstile — required when TURNSTILE_SECRET_KEY is provisioned.
  // For dev environments without the secret, the gate is bypassed so
  // local iteration stays fast. SECURITY.md gates production deploy on
  // the secret being set. BYOK calls also bypass (user pays their own
  // quota; rate-limit DO still gates abuse).
  if (env?.TURNSTILE_SECRET_KEY && !bypassTurnstile) {
    const token = request.headers.get("X-Yatra-Turnstile") || "";
    if (!token) {
      return jsonResponse(
        401,
        problem({
          slug: "turnstile-missing",
          title: "Turnstile token required",
          status: 401,
          detail: "Mutating routes require an X-Yatra-Turnstile header.",
          fix: "Render the Turnstile widget on the page and forward its token with each request.",
          requestId: id,
        }),
        origin,
      );
    }
    try {
      const result = await verifyTurnstileToken({
        token,
        secret: env.TURNSTILE_SECRET_KEY,
        remoteIp: request.headers.get("CF-Connecting-IP") || null,
      });
      if (!result.ok) {
        return jsonResponse(
          403,
          problem({
            slug: "turnstile-failed",
            title: "Turnstile rejected the token",
            status: 403,
            detail: `Cloudflare rejected the challenge: ${result.errorCodes.join(", ") || "no detail"}`,
            fix: "Re-render the Turnstile widget; tokens are single-use.",
            requestId: id,
          }),
          origin,
        );
      }
    } catch (err) {
      const code = err?.code || "network";
      const status = code === "timeout" ? 504 : 502;
      return jsonResponse(
        status,
        problem({
          slug: "turnstile-failed",
          title: "Turnstile verification failed",
          status,
          detail: err?.message || String(err),
          cause: `turnstile code=${code}`,
          fix: "Transient — retry. If repeated, check Cloudflare status.",
          requestId: id,
        }),
        origin,
      );
    }
  }

  // 2.5. Per-IP rate limit — bypassed when RATE_LIMITER DO binding
  // absent. Fail-open on DO errors (see rateLimiter.consumeForIp).
  if (env?.RATE_LIMITER) {
    const ip = request.headers.get("CF-Connecting-IP") || "anon";
    const rl = await consumeForIp(env, ip);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify(
          problem({
            slug: "rate-limited",
            title: "Too many requests",
            status: 429,
            detail: `Per-IP ${rl.window} limit reached. Wait ${Math.ceil((rl.retryAfterMs || 0) / 1000)}s.`,
            fix: "Slow down and retry after the window resets.",
            requestId: id,
          }),
        ),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil((rl.retryAfterMs || 60_000) / 1000)),
            "X-RateLimit-Limit": String(rl.limit ?? ""),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.floor((rl.resetAtMs || Date.now()) / 1000)),
            "X-RateLimit-Window": rl.window || "",
            ...corsHeaders(origin),
          },
        },
      );
    }
  }

  // 3. Daily budget — bypassed when BUDGET_KV is not bound or when this
  // is a BYOK request (user pays their own provider quota, not ours).
  // The cap is set via env.DIRECTOR_DAILY_CAP_MILLICENTS (defaults to
  // 500_000 = $5).
  if (env?.BUDGET_KV && !bypassBudget) {
    const cap = Number(env.DIRECTOR_DAILY_CAP_MILLICENTS);
    const check = await checkBudget({
      kv: env.BUDGET_KV,
      route,
      body,
      cap: Number.isFinite(cap) && cap > 0 ? cap : undefined,
    });
    if (!check.allowed) {
      return jsonResponse(
        503,
        problem({
          slug: "daily-cap",
          title: "Daily budget exhausted",
          status: 503,
          detail: `Projected spend ${check.projected} millicents would exceed cap ${check.cap}. Counter resets at UTC midnight.`,
          fix: "Wait until tomorrow, raise DIRECTOR_DAILY_CAP_MILLICENTS in Worker vars, or set DIRECTOR_KILLSWITCH=0 once you've confirmed traffic is legitimate.",
          requestId: id,
        }),
        origin,
      );
    }
  }

  return null;
}

async function handleScript(request, env, origin) {
  const id = reqId();

  // TODO(security/rate-limit): bind a Durable Object and bump per-IP counters.
  // Per-IP rate-limit is the only auto-decided control still TODO at v1.6.10;
  // it needs an actual DO binding and is the next commit.

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      400,
      problem({
        slug: "invalid-request",
        title: "Malformed JSON",
        status: 400,
        detail: "Request body is not valid JSON.",
        fix: "Send a JSON body matching API.md /v1/script.",
        requestId: id,
      }),
      origin,
    );
  }
  const errs = validateScriptRequest(body);
  if (errs.length) {
    return jsonResponse(
      400,
      problem({
        slug: "invalid-request",
        title: "Request validation failed",
        status: 400,
        detail: errs.join("; "),
        fix: "See API.md /v1/script for the request schema.",
        requestId: id,
      }),
      origin,
    );
  }

  // TODO(idempotency): compute cacheKey = sha256(routeId + tone + language)
  // and look up R2 before calling Claude. On hit, set X-Yatra-Cache: hit.

  const systemPrompt = SYSTEM_PROMPTS[body.tone];
  if (!systemPrompt) {
    return jsonResponse(
      400,
      problem({
        slug: "invalid-request",
        title: "Tone has no prompt yet",
        status: 400,
        detail: `Tone "${body.tone}" is valid but no prompt template exists yet. Devotional is currently the only wired tone.`,
        fix: "Pick devotional, or land a prompt template in workers/yatra-director/src/prompts.js.",
        requestId: id,
      }),
      origin,
    );
  }

  // Pre-flight: kill switch + Turnstile + budget. Returns a Response on
  // failure (we forward it) or null to proceed.
  const blocked = await preflight({ request, env, origin, id, route: "/v1/script", body });
  if (blocked) return blocked;

  // Idempotency cache lookup. A hot share URL serves from KV after the
  // first request — same content, zero upstream cost. Free tier covers
  // 100k reads/day which is generous for a side project.
  const cacheKey = await buildScriptCacheKey({
    routeId: body.routeId,
    tone: body.tone,
    language: body.language,
    durationS: TOTAL_DURATION_S,
  });
  const cached = await getCached(env?.SCRIPT_CACHE, cacheKey, { as: "json" });
  if (cached) {
    return new Response(JSON.stringify(cached), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Yatra-Cache": "hit",
        ...corsHeaders(origin),
      },
    });
  }

  // If the API key is not provisioned (dev environments, first-deploy
  // verification), fall back to a stub echo so the network path still
  // works end-to-end. SECURITY.md requires the key be present before
  // any public deploy.
  if (!env?.ANTHROPIC_API_KEY) {
    const response = {
      routeId: body.routeId,
      tone: body.tone,
      language: body.language,
      scenes: [
        {
          id: "origin",
          tStart: 0,
          tEnd: TOTAL_DURATION_S,
          narration: `[worker-stub] ${body.routeTitle} (${body.tone}, ${body.language})`,
          captionText: body.routeTitle,
          captionStyle: "headline",
        },
      ],
      meta: {
        scriptModel: "stub-no-key",
        totalDurationS: TOTAL_DURATION_S,
        wordCount: 0,
        generatedAt: new Date().toISOString(),
        note: "ANTHROPIC_API_KEY not set. wrangler secret put ANTHROPIC_API_KEY to enable real generation.",
      },
    };
    return jsonResponse(200, response, origin);
  }

  try {
    const result = await callClaude({
      apiKey: env.ANTHROPIC_API_KEY,
      systemPrompt,
      body,
      totalDurationS: TOTAL_DURATION_S,
    });
    // Record spend + cache the result. Both swallow errors so they
    // can't take down a successful response.
    if (env?.BUDGET_KV) {
      const c = await checkBudget({ kv: env.BUDGET_KV, route: "/v1/script", body });
      await recordSpend(env.BUDGET_KV, c.key, c.cost);
    }
    await putCached(env?.SCRIPT_CACHE, cacheKey, result, { as: "json" });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Yatra-Cache": "miss",
        ...corsHeaders(origin),
      },
    });
  } catch (err) {
    const code = err?.code || "parse";
    const statusByCode = { auth: 502, timeout: 504, rate: 503, parse: 502 };
    const status = statusByCode[code] || 502;
    return jsonResponse(
      status,
      problem({
        slug: "upstream-claude",
        title: "Upstream Claude error",
        status,
        detail: err?.message || String(err),
        cause: `claudeClient code=${code}`,
        fix: "Check Worker logs for requestId. If repeated, rotate ANTHROPIC_API_KEY and check Anthropic status.",
        requestId: id,
      }),
      origin,
    );
  }
}

/**
 * /v1/tts — synthesize one scene's narration audio.
 *
 * Backend: Google Cloud Text-to-Speech (free tier 1M chars/month per
 * voice family). Returns MP3 bytes; the client decodes via
 * AudioContext.decodeAudioData into a Float32Array aligned to the scene
 * slot by directorTTS.alignToSceneDuration.
 *
 * Request shape (see API.md):
 *   { tone, language, voiceId, text, tempo }
 *
 * Response: audio/mpeg bytes (Content-Type: audio/mpeg), so the client
 * can pipe straight into decodeAudioData without unwrapping JSON.
 */
async function handleTts(request, env, origin) {
  const id = reqId();

  // TODO(security/rate-limit): per-IP Durable Object counters — the last
  // auto-decided control still TODO at v1.6.10. Lands in the next commit.

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      400,
      problem({
        slug: "invalid-request",
        title: "Malformed JSON",
        status: 400,
        detail: "Request body is not valid JSON.",
        fix: "Send {tone, language, voiceId, text, tempo} per API.md.",
        requestId: id,
      }),
      origin,
    );
  }
  const { tone, language, voiceId, text, tempo } = body || {};
  if (!tone || !language || !voiceId || !text) {
    return jsonResponse(
      400,
      problem({
        slug: "invalid-request",
        title: "Missing required field",
        status: 400,
        detail: "tone, language, voiceId, text are all required.",
        fix: "See API.md /v1/tts for the schema.",
        requestId: id,
      }),
      origin,
    );
  }
  if (!LANGUAGE_TO_LOCALE[language]) {
    return jsonResponse(
      400,
      problem({
        slug: "invalid-request",
        title: "Unsupported language",
        status: 400,
        detail: `language must be one of: ${Object.keys(LANGUAGE_TO_LOCALE).join(", ")}.`,
        fix: "Pick a supported language code.",
        requestId: id,
      }),
      origin,
    );
  }

  // BYOK: if the client supplied their own Google TTS key, use it and
  // skip Turnstile + budget + cache. Per-IP rate limit still applies as
  // abuse defense (Worker CPU is not free even when upstream is on the
  // user's quota). The header is never logged — see SECURITY.md.
  const userTtsKey = request.headers.get("X-Yatra-User-TTS-Key") || "";
  const isBYOK = userTtsKey.length > 0;
  const effectiveTtsKey = isBYOK ? userTtsKey : env?.GOOGLE_TTS_API_KEY;

  if (!effectiveTtsKey) {
    return jsonResponse(
      503,
      problem({
        slug: "tts-not-configured",
        title: "Google TTS API key not set",
        status: 503,
        detail: "GOOGLE_TTS_API_KEY has not been provisioned on the Worker and no BYOK key was supplied.",
        fix: "Either: (operator) wrangler secret put GOOGLE_TTS_API_KEY; (user) paste your key in Settings.",
        requestId: id,
      }),
      origin,
    );
  }

  // Pre-flight: kill switch + Turnstile + budget. BYOK bypasses Turnstile
  // and budget; the rate-limit DO still runs to protect Worker CPU.
  const blocked = await preflight({
    request, env, origin, id,
    route: "/v1/tts", body,
    bypassTurnstile: isBYOK,
    bypassBudget: isBYOK,
  });
  if (blocked) return blocked;

  // Idempotency cache — operator path only. BYOK calls neither read nor
  // write the cache: muddles operator's accounting and risks cross-user
  // payload reuse. User pays each call.
  let cacheKey = null;
  if (!isBYOK) {
    cacheKey = await buildTtsCacheKey({ voiceId, tempo, text, language });
    const cachedAudio = await getCached(env?.TTS_CACHE, cacheKey, { as: "arrayBuffer" });
    if (cachedAudio) {
      return new Response(cachedAudio, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "X-Yatra-Provider": "google-tts",
          "X-Yatra-Cache": "hit",
          ...corsHeaders(origin),
        },
      });
    }
  }

  try {
    const audio = await callGoogleTTS({
      apiKey: effectiveTtsKey,
      text,
      voiceId,
      language,
      tempo,
    });
    // Operator path only: record spend + cache. BYOK skips both.
    if (!isBYOK) {
      if (env?.BUDGET_KV) {
        const c = await checkBudget({ kv: env.BUDGET_KV, route: "/v1/tts", body });
        await recordSpend(env.BUDGET_KV, c.key, c.cost);
      }
      await putCached(env?.TTS_CACHE, cacheKey, audio, { as: "arrayBuffer" });
    }
    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "X-Yatra-Provider": "google-tts",
        "X-Yatra-Cache": isBYOK ? "byok-bypass" : "miss",
        ...corsHeaders(origin),
      },
    });
  } catch (err) {
    const code = err?.code || "parse";
    const statusByCode = { auth: 502, timeout: 504, rate: 503, parse: 502 };
    const status = statusByCode[code] || 502;
    return jsonResponse(
      status,
      problem({
        slug: "upstream-tts",
        title: "Upstream Google TTS error",
        status,
        detail: err?.message || String(err),
        cause: `googleTtsClient code=${code}`,
        fix: "Check Worker logs. If 401/403, rotate GOOGLE_TTS_API_KEY and verify Text-to-Speech API is enabled on the project.",
        requestId: id,
      }),
      origin,
    );
  }
}

// Re-export the Durable Object class so Wrangler can register it via
// the [[durable_objects.bindings]] entry in wrangler.toml.
export { RateLimiter };

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    // CORS allowlist gate (pattern-matched; supports *.yatra.pages.dev preview deploys)
    if (origin && !isOriginAllowed(origin)) {
      return jsonResponse(
        403,
        problem({
          slug: "origin-denied",
          title: "Origin not allowed",
          status: 403,
          detail: `Origin ${origin} is not on the Worker allowlist.`,
          fix: "Add the origin to CORS_ALLOWLIST in workers/yatra-director/src/index.js.",
          requestId: reqId(),
        }),
        origin,
      );
    }

    if (request.method === "POST" && url.pathname === "/v1/script") {
      return handleScript(request, env, origin);
    }
    if (request.method === "POST" && url.pathname === "/v1/tts") {
      return handleTts(request, env, origin);
    }
    if (request.method === "GET" && url.pathname === "/healthz") {
      return new Response("ok", { status: 200, headers: corsHeaders(origin) });
    }

    return jsonResponse(
      404,
      problem({
        slug: "not-found",
        title: "Unknown route",
        status: 404,
        detail: `No handler for ${request.method} ${url.pathname}`,
        fix: "See API.md for supported routes.",
        requestId: reqId(),
      }),
      origin,
    );
  },
};
