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
 * High-level: full Director flow. Builds the user prompt, calls
 * OpenRouter with JSON-mode where supported, parses scenes JSON.
 *
 * If the first attempt returns non-JSON (model emitted prose preamble
 * with no parseable object), retries ONCE with a forceful "OUTPUT ONLY
 * JSON, no preamble" addendum to the system prompt. Smaller / weaker
 * models often need the second nudge.
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

  // Attempt 1: with response_format json_object so JSON-capable models
  // emit valid JSON directly. Models that don't support the field
  // ignore it (per OpenRouter docs).
  let firstError = null;
  try {
    const { text } = await rawCallOpenRouter({
      apiKey, model, systemPrompt, userPrompt, maxTokens, timeoutMs, fetchImpl,
      responseFormat: { type: "json_object" },
    });
    if (text) return parseClaudeResponse(text, meta);
    firstError = withCode("parse", "OpenRouter returned no content");
  } catch (err) {
    // 4xx errors are not retry-able. Only "parse" / empty content is.
    if (err?.code && err.code !== "parse") throw err;
    firstError = err;
  }

  // Attempt 2: bolt a JSON-only addendum onto the system prompt. Drop
  // response_format because the model couldn't honor it (signal: it
  // emitted prose anyway), so making the request stricter via prose
  // gives it a different angle.
  const stricterSystem = `${systemPrompt}\n\nABSOLUTE OUTPUT RULE: Your reply MUST start with the character '{' and end with the character '}'. No preamble. No "Let me analyze". No markdown fences. No commentary after. The first character of your reply is '{'. If you cannot comply, return only: {"scenes":[]}`;
  try {
    const { text } = await rawCallOpenRouter({
      apiKey, model, systemPrompt: stricterSystem, userPrompt, maxTokens, timeoutMs, fetchImpl,
    });
    if (!text) throw withCode("parse", "OpenRouter returned no content (retry)");
    return parseClaudeResponse(text, meta);
  } catch (err) {
    // Both attempts failed. Surface the more informative error.
    throw err?.code === "parse" && firstError?.code === "parse" ? err : (firstError || err);
  }
}
