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
import { SYSTEM_PROMPTS } from "./prompts.js";

const TOTAL_DURATION_S = 30;

const CORS_ALLOWLIST = [
  "http://localhost:5173",
  "http://localhost:8787",
  // Add prod origins here once we have them.
];

function corsHeaders(origin) {
  const allow = CORS_ALLOWLIST.includes(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Yatra-Turnstile",
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

async function handleScript(request, env, origin) {
  const id = reqId();

  // TODO(security/auth): verify X-Yatra-Turnstile via Turnstile siteverify
  // (env.TURNSTILE_SECRET_KEY). Reject with 401 turnstile-missing /
  // 403 turnstile-failed per API.md.

  // TODO(security/rate-limit): bind a Durable Object and bump per-IP counters.
  // Soft headers (X-RateLimit-Remaining) on the response.

  // TODO(security/killswitch): if env.DIRECTOR_KILLSWITCH === "1" OR
  // daily-spend KV is exhausted, return 503 killswitch.

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
    return jsonResponse(200, result, origin);
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

  // TODO(security/auth): verify X-Yatra-Turnstile.
  // TODO(security/rate-limit): per-IP Durable Object counters.
  // TODO(security/killswitch): env.DIRECTOR_KILLSWITCH || daily budget exhausted.

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

  if (!env?.GOOGLE_TTS_API_KEY) {
    return jsonResponse(
      503,
      problem({
        slug: "tts-not-configured",
        title: "Google TTS API key not set",
        status: 503,
        detail: "GOOGLE_TTS_API_KEY has not been provisioned on the Worker.",
        fix: "wrangler secret put GOOGLE_TTS_API_KEY (free tier: enable Cloud Text-to-Speech API on a GCP project, create an API key restricted to that API).",
        requestId: id,
      }),
      origin,
    );
  }

  try {
    const audio = await callGoogleTTS({
      apiKey: env.GOOGLE_TTS_API_KEY,
      text,
      voiceId,
      language,
      tempo,
    });
    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "X-Yatra-Provider": "google-tts",
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

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    // CORS allowlist gate
    if (origin && !CORS_ALLOWLIST.includes(origin)) {
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
