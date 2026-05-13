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

  // STUB: echo a one-scene placeholder so the client can render end-to-end.
  // Real implementation calls Anthropic Claude Haiku with the curated
  // prompt under prompts/<tone>.md, parses the structured scene list, and
  // returns it. The MOCK_MODE path in the client returns hand-authored
  // fixtures; this echo is just to prove the network shape works.
  const response = {
    routeId: body.routeId,
    tone: body.tone,
    language: body.language,
    scenes: [
      {
        id: "origin",
        tStart: 0,
        tEnd: 30,
        narration: `[worker-stub] ${body.routeTitle} (${body.tone}, ${body.language})`,
        captionText: body.routeTitle,
        captionStyle: "headline",
      },
    ],
    meta: {
      scriptModel: "stub-echo",
      totalDurationS: 30,
      wordCount: 0,
      generatedAt: new Date().toISOString(),
      note: "Worker is in stub mode. See workers/yatra-director/README.md to wire Claude.",
    },
  };
  return jsonResponse(200, response, origin);
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
