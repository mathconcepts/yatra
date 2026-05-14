/**
 * Shared HTTP client for Director Worker calls.
 *
 * Why this exists: directorScript and directorTTS both build the same
 * request shape (base URL + headers + BYOK + Turnstile + RFC-7807 error
 * mapping). Three call sites would diverge as features land; one place
 * keeps it honest. Extracted in the deploy + BYOK plan as the DRY
 * refactor (eng-review Finding 4).
 *
 * Pure split:
 *   - buildHeaders: pure (settings, keyType, turnstileToken) → Headers obj
 *   - buildUrl:     pure (path, envUrl, settings) → string
 *   - mapErrorBody: pure (status, json) → Error with `code` + `slug`
 *   - request:      the only function that touches fetch; tests inject fetchImpl
 *
 * BYOK header naming convention is exposed for the Worker tests:
 *   X-Yatra-User-TTS-Key  — when set, Worker uses this for /v1/tts
 *                          (Anthropic BYOK does NOT route through Worker;
 *                           see anthropicDirectClient.js)
 *   X-Yatra-Turnstile     — always present when widget produced a token
 */

import { readUserSettings, getEffectiveWorkerUrl } from "./userSettings.js";

export const HEADER_TTS_KEY = "X-Yatra-User-TTS-Key";
export const HEADER_TURNSTILE = "X-Yatra-Turnstile";

/**
 * Pure: assemble request headers for a Director Worker call.
 *
 * @param {object}  args
 * @param {object?} args.settings        — pre-read user settings (testing convenience)
 * @param {"tts"|"script"} args.keyType  — which BYOK key (if any) to attach
 * @param {string?} args.turnstileToken  — Turnstile token; omitted when absent
 */
export function buildHeaders({ settings, keyType, turnstileToken } = {}) {
  const s = settings || readUserSettings();
  const headers = { "Content-Type": "application/json" };
  if (turnstileToken) headers[HEADER_TURNSTILE] = turnstileToken;
  if (keyType === "tts" && s.googleTtsKey) headers[HEADER_TTS_KEY] = s.googleTtsKey;
  // Anthropic BYOK is NOT attached here — that path bypasses the Worker.
  return headers;
}

/**
 * Pure: resolve the absolute URL for a Worker path. User override wins,
 * env fallback next, throws if neither is set (so we never silently fetch
 * a relative path that 404s on the static host).
 */
export function buildUrl(path, envUrl) {
  const base = getEffectiveWorkerUrl(envUrl || "");
  if (!base) {
    throw withCode("config", "Worker URL is not configured. Set VITE_DIRECTOR_WORKER_URL or override it in Settings.");
  }
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : "/" + path}`;
}

/**
 * Pure: turn a Worker RFC-7807 problem document into a JS Error with
 * `code` (the slug) and `status` (HTTP). Falls back gracefully when the
 * body isn't a problem document.
 */
export function mapErrorBody(status, body) {
  let slug = "unknown";
  let detail = "";
  let title = "Director request failed";
  if (body && typeof body === "object") {
    if (typeof body.type === "string") {
      const m = body.type.match(/\/errors\/([^/?#]+)$/);
      if (m) slug = m[1];
    }
    if (typeof body.title === "string") title = body.title;
    if (typeof body.detail === "string") detail = body.detail;
  }
  const e = new Error(`${title}${detail ? `: ${detail}` : ""}`);
  e.code = slug;
  e.status = status;
  return e;
}

function withCode(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/**
 * Thin fetch wrapper. Production passes the global fetch; tests inject
 * a stub. Returns parsed JSON on 2xx; throws mapErrorBody Error on
 * non-2xx; throws with code "network" on transport failure.
 */
export async function request({
  path,
  method = "POST",
  body,
  envUrl,
  keyType = null,
  turnstileToken = null,
  signal,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== "function") throw withCode("network", "fetch not available");
  const url = buildUrl(path, envUrl);
  const headers = buildHeaders({ keyType, turnstileToken });

  let res;
  try {
    res = await fetchImpl(url, {
      method,
      headers,
      body: body == null ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw withCode("abort", "Request aborted");
    throw withCode("network", `fetch failed: ${err?.message || err}`);
  }

  let parsed = null;
  const contentType = res.headers?.get?.("content-type") || "";
  if (contentType.includes("application/json")) {
    try { parsed = await res.json(); } catch { /* leave null */ }
  }

  if (!res.ok) throw mapErrorBody(res.status, parsed);

  // Some Worker routes (e.g. /v1/tts) return binary audio, not JSON.
  if (parsed == null) {
    const ab = await res.arrayBuffer();
    return { _binary: true, buffer: ab, contentType };
  }
  return parsed;
}

export const __test = { HEADER_TTS_KEY, HEADER_TURNSTILE };
