/**
 * Browser-direct OpenRouter client.
 *
 * OpenRouter (https://openrouter.ai) is a unified gateway in front of
 * dozens of LLMs — Anthropic, OpenAI, Google, Meta, DeepSeek, Mistral,
 * Qwen, etc. One key, one URL, one OpenAI-compatible request shape.
 *
 * Trust model: the BYOK OpenRouter key is sent FROM THE BROWSER
 * directly to api.openrouter.ai. Our Worker never sees it. Same
 * pattern as anthropicDirectClient.js. OpenRouter advertises CORS
 * support for browser-direct calls; no proxy is required.
 *
 * Output shape matches the rest of the Director pipeline:
 *   { routeId, tone, language, scenes: [...], meta: {...} }
 *
 * The model is responsible for returning the same JSON shape the
 * Worker prompt asks for. parseClaudeResponse handles ```json fences
 * + missing-scenes errors, so we reuse it here.
 */

import { buildUserPrompt, parseClaudeResponse } from "./anthropicDirectClient.js";
import { OPENROUTER_DEFAULT_MODEL } from "./openRouterCatalog.js";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = OPENROUTER_DEFAULT_MODEL;
// Bumped from 1024 → 4096. Reasoning models (DeepSeek R1, Qwen QwQ,
// inclusionai/ring) burn output tokens on internal reasoning before
// producing the scenes JSON. 1024 was leaving them with nothing left
// to emit, surfacing as "OpenRouter returned no content".
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 20000;

function withCode(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

async function safeText(res) { try { return await res.text(); } catch { return ""; } }

/**
 * Call OpenRouter from the browser.
 *
 * @param {object} args
 * @param {string} args.apiKey       — BYOK OpenRouter key (sk-or-...)
 * @param {string} args.model        — OpenRouter model id (e.g. "anthropic/claude-3.5-sonnet")
 * @param {string} args.systemPrompt — same prompt that goes to /v1/script
 * @param {object} args.body         — request body from buildScriptRequest / buildTourScriptRequest
 * @param {number} [args.totalDurationS]
 * @param {number} [args.maxTokens]
 * @param {number} [args.timeoutMs]
 * @param {Function} [args.fetchImpl]
 *
 * Throws Error with `code` for UI mapping:
 *   - "auth"    → 401/403 (key invalid)
 *   - "rate"    → 429
 *   - "credits" → 402 (out of OpenRouter credits)
 *   - "timeout" → exceeded timeoutMs
 *   - "cors"    → browser blocked the request
 *   - "parse"   → upstream returned an unexpected shape
 */
/**
 * Low-level: POST to OpenRouter and return the raw assistant text.
 * Throws Error with `code` on any non-2xx. Does NOT parse the body
 * into our scenes shape — useful for the Settings Test probe which
 * just wants to know "did the key + model work."
 *
 * Returns { text, raw } — text is the best-effort string content,
 * raw is the full response object (caller can inspect debug fields).
 */
export async function rawCallOpenRouter({
  apiKey,
  model = DEFAULT_MODEL,
  systemPrompt,
  userPrompt,
  maxTokens = DEFAULT_MAX_TOKENS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  responseFormat = null,  // {type: "json_object"} forces JSON-only output where supported
} = {}) {
  if (!apiKey) throw withCode("auth", "OpenRouter BYOK key is not set");
  if (typeof fetchImpl !== "function") throw withCode("parse", "fetch not available");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const requestBody = {
    model,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ],
  };
  if (responseFormat) requestBody.response_format = responseFormat;

  let res;
  try {
    res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": typeof location !== "undefined" ? location.origin : "https://yatra.local",
        "X-Title": "Yatra Director",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw withCode("timeout", `OpenRouter exceeded ${timeoutMs}ms`);
    if (err?.message && /CORS|Failed to fetch|NetworkError/i.test(err.message)) {
      throw withCode("cors", "Browser-direct OpenRouter blocked by CORS. Check your network / a browser extension.");
    }
    throw withCode("parse", `OpenRouter fetch failed: ${err?.message || err}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw withCode("auth", "OpenRouter rejected the key (revoked or wrong format)");
  }
  if (res.status === 402) {
    throw withCode("credits", "OpenRouter says you're out of credits — top up at openrouter.ai or pick a :free model");
  }
  if (res.status === 404) {
    const detail = await safeText(res);
    const isModelMiss = /No endpoints found|model/i.test(detail);
    throw withCode(
      isModelMiss ? "model-not-found" : "parse",
      isModelMiss
        ? `OpenRouter doesn't have model "${model}". Pick one of the chips or paste a current slug from openrouter.ai/models.`
        : `OpenRouter 404: ${detail.slice(0, 240)}`,
    );
  }
  if (res.status === 429) throw withCode("rate", "OpenRouter rate-limited the request");
  if (!res.ok) {
    const detail = await safeText(res);
    throw withCode("parse", `OpenRouter ${res.status}: ${detail.slice(0, 240)}`);
  }

  const json = await res.json();
  // OpenAI-compatible shape primary path: choices[0].message.content
  // Fallbacks:
  //   - message.reasoning   — reasoning models (e.g. inclusionai/ring)
  //   - message.tool_calls  — some models return JSON in tool calls
  //   - choices[0].text     — older completions-style models
  const msg = json?.choices?.[0]?.message;
  const text =
    (typeof msg?.content === "string" && msg.content) ||
    (typeof msg?.reasoning === "string" && msg.reasoning) ||
    (Array.isArray(msg?.tool_calls) && msg.tool_calls[0]?.function?.arguments) ||
    (typeof json?.choices?.[0]?.text === "string" && json.choices[0].text) ||
    "";
  return { text, raw: json };
}

/**
 * A model id that's known to honor JSON-only output. Used as the
 * automatic last-ditch retry when the user's chosen model emits
 * markdown analysis no matter what we ask. Re-exported here (not
 * imported from the catalog) so this file has no circular dep risk.
 */
const FALLBACK_JSON_RELIABLE_MODEL = "deepseek/deepseek-chat-v3-0324:free";

/**
 * High-level: full Director flow. Builds the user prompt, calls
 * OpenRouter with JSON-mode where supported, parses scenes JSON.
 *
 * Three attempts in order:
 *   1. User's chosen model + response_format: json_object
 *   2. Same model + stricter prose system prompt (no response_format)
 *   3. Fallback to a JSON-reliable model (deepseek-chat-v3) — only when
 *      the user-chosen model is something else AND attempts 1+2 both
 *      returned non-JSON content. Triggers a one-time inline notice
 *      via the meta.usedFallbackModel flag the caller can surface.
 *
 * Auth / credits / rate / timeout / cors / model-not-found errors are
 * NOT retried — those don't get better with another try.
 */
export async function callOpenRouterDirect({
  apiKey,
  model = DEFAULT_MODEL,
  systemPrompt,
  body,
  totalDurationS = 30,
  maxTokens = DEFAULT_MAX_TOKENS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  const userPrompt = buildUserPrompt(body, { totalDurationS });
  const meta = {
    routeId: body.routeId,
    tone: body.tone,
    language: body.language,
    totalDurationS,
  };

  // Attempt 1: requested model + response_format json_object.
  let firstError = null;
  try {
    const { text } = await rawCallOpenRouter({
      apiKey, model, systemPrompt, userPrompt, maxTokens, timeoutMs, fetchImpl,
      responseFormat: { type: "json_object" },
    });
    if (text) return parseClaudeResponse(text, meta);
    firstError = withCode("parse", "OpenRouter returned no content");
  } catch (err) {
    if (err?.code && err.code !== "parse") throw err;
    firstError = err;
  }

  // Attempt 2: same model + stricter prose prompt, no response_format.
  const stricterSystem = `${systemPrompt}\n\nABSOLUTE OUTPUT RULE: Your reply MUST start with the character '{' and end with the character '}'. No preamble. No "Let me analyze". No markdown fences. No commentary after. The first character of your reply is '{'. If you cannot comply, return only: {"scenes":[]}`;
  let secondError = null;
  try {
    const { text } = await rawCallOpenRouter({
      apiKey, model, systemPrompt: stricterSystem, userPrompt, maxTokens, timeoutMs, fetchImpl,
    });
    if (text) return parseClaudeResponse(text, meta);
    secondError = withCode("parse", "OpenRouter returned no content (retry)");
  } catch (err) {
    if (err?.code && err.code !== "parse") throw err;
    secondError = err;
  }

  // Attempt 3: cascade to a known JSON-reliable model. Only useful when
  // the user picked something else; otherwise it's the same model again.
  if (model !== FALLBACK_JSON_RELIABLE_MODEL) {
    try {
      const { text } = await rawCallOpenRouter({
        apiKey, model: FALLBACK_JSON_RELIABLE_MODEL, systemPrompt, userPrompt,
        maxTokens, timeoutMs, fetchImpl,
        responseFormat: { type: "json_object" },
      });
      if (text) {
        const result = parseClaudeResponse(text, meta);
        // Tag the meta so the caller can show a one-line notice
        // "Used DeepSeek V3 fallback because your chosen model emitted
        // prose instead of JSON."
        result.meta = {
          ...(result.meta || {}),
          usedFallbackModel: FALLBACK_JSON_RELIABLE_MODEL,
          requestedModel: model,
        };
        return result;
      }
    } catch { /* fall through to the original error below */ }
  }

  // All attempts failed. Surface the most informative error — usually
  // the second one (which has the strict-prompt context) but the first
  // if its message is richer.
  const e = secondError || firstError;
  if (e) throw e;
  throw withCode("parse", "OpenRouter returned no content after 3 attempts");
}
