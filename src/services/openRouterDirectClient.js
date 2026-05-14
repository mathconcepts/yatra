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

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-3.5-sonnet";
const DEFAULT_MAX_TOKENS = 1024;
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
  if (!apiKey) throw withCode("auth", "OpenRouter BYOK key is not set");
  if (typeof fetchImpl !== "function") throw withCode("parse", "fetch not available");

  const userPrompt = buildUserPrompt(body, { totalDurationS });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        // OpenRouter uses these to identify the calling app for
        // its dashboards. Both are optional but recommended.
        "HTTP-Referer": typeof location !== "undefined" ? location.origin : "https://yatra.local",
        "X-Title": "Yatra Director",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        // OpenRouter accepts OpenAI-style messages. system role works
        // across every routed provider (Anthropic/OpenAI/Gemini/Llama).
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
  if (res.status === 429) throw withCode("rate", "OpenRouter rate-limited the request");
  if (!res.ok) {
    const detail = await safeText(res);
    throw withCode("parse", `OpenRouter ${res.status}: ${detail.slice(0, 240)}`);
  }

  const json = await res.json();
  // OpenAI-compatible shape: { choices: [ { message: { content: "..." } } ] }
  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || text.length === 0) {
    throw withCode("parse", "OpenRouter returned no content");
  }
  return parseClaudeResponse(text, {
    routeId: body.routeId,
    tone: body.tone,
    language: body.language,
    totalDurationS,
  });
}
