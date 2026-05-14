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
} = {}) {
  if (!apiKey) throw withCode("auth", "OpenRouter BYOK key is not set");
  if (typeof fetchImpl !== "function") throw withCode("parse", "fetch not available");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

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
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt },
        ],
      }),
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
 * OpenRouter, parses scenes JSON. Used by directorScript.generateScript.
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
  const { text } = await rawCallOpenRouter({
    apiKey, model, systemPrompt, userPrompt, maxTokens, timeoutMs, fetchImpl,
  });
  if (!text) throw withCode("parse", "OpenRouter returned no content");
  return parseClaudeResponse(text, {
    routeId: body.routeId,
    tone: body.tone,
    language: body.language,
    totalDurationS,
  });
}
