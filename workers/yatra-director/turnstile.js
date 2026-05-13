/**
 * Cloudflare Turnstile token verifier.
 *
 * Turnstile is Cloudflare's CAPTCHA alternative: the client renders an
 * invisible challenge widget, gets a token, sends it with each
 * mutating request. The Worker verifies the token against
 * `challenges.cloudflare.com/turnstile/v0/siteverify` before doing any
 * paid work. Tokens are single-use and tied to a site key + secret pair.
 *
 * Free, no per-call cost, no CAPTCHA UX for legit users on most pages.
 * For a side-project public Worker, it's the smallest auth gate that
 * still keeps bots out.
 *
 * Pure split:
 *   - parseTurnstileResponse: pure JSON validator
 *   - verifyTurnstileToken: thin fetch wrapper; tests inject fetchImpl
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Pure: validate the shape of Cloudflare's siteverify response.
 * Cloudflare returns:
 *   { success: true|false, "error-codes": [], action, cdata, hostname, challenge_ts }
 * Returns { ok, errorCodes, hostname, action, ts } for callers.
 */
export function parseTurnstileResponse(json) {
  if (!json || typeof json !== "object") {
    return { ok: false, errorCodes: ["malformed-response"] };
  }
  return {
    ok: json.success === true,
    errorCodes: Array.isArray(json["error-codes"]) ? json["error-codes"] : [],
    hostname: typeof json.hostname === "string" ? json.hostname : null,
    action: typeof json.action === "string" ? json.action : null,
    ts: typeof json.challenge_ts === "string" ? json.challenge_ts : null,
  };
}

/**
 * Verify a Turnstile token. Returns the parsed response.
 *
 * Errors carry `code` so the Worker can map onto problem responses:
 *   - "missing-token"   → 401 turnstile-missing
 *   - "missing-secret"  → 500 internal (operator error)
 *   - "timeout"         → 504
 *   - "network"         → 502
 *
 * On success, `result.ok === true`. On a verified-but-rejected token,
 * `result.ok === false` and `errorCodes` lists Cloudflare's reasons.
 */
export async function verifyTurnstileToken({
  token,
  secret,
  remoteIp = null,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!token) throw withCode("missing-token", "Turnstile token absent from request");
  if (!secret) throw withCode("missing-secret", "TURNSTILE_SECRET_KEY not provisioned");
  if (typeof fetchImpl !== "function") throw withCode("network", "fetch not available");

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (remoteIp) form.set("remoteip", remoteIp);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw withCode("timeout", `siteverify exceeded ${timeoutMs}ms`);
    throw withCode("network", `siteverify fetch failed: ${err?.message || err}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw withCode("network", `siteverify HTTP ${res.status}`);
  }
  const json = await res.json();
  return parseTurnstileResponse(json);
}

function withCode(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}
