/**
 * Browser-direct Anthropic client for BYOK Anthropic key path.
 *
 * Why this exists: the user's Anthropic key is a long-lived bearer
 * with full account access. Routing it through OUR Worker means any
 * misconfigured log line or compromised Worker leaks the user's full
 * account. The cleaner trust model is: browser talks to api.anthropic.com
 * directly, our infrastructure never sees the key. Anthropic added
 * browser-direct support in 2024 behind the `anthropic-dangerous-direct-
 * browser-access: true` header.
 *
 * This client mirrors the shape of workers/yatra-director/claudeClient.js
 * (same buildUserPrompt, same parseClaudeResponse). The Worker file is
 * the source of truth for the prompt-building logic; this file imports
 * the prompts.js bundle directly.
 *
 * IMPORTANT: only call this when readUserSettings().anthropicKey is set.
 * The caller (directorScript) decides which path to take based on BYOK
 * presence.
 *
 * Test note: api.anthropic.com browser-direct CORS must be verified
 * before this code path can ship to production. The plan's CORS
 * verification gate (Step 7b in the plan doc) runs that check.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Pure: assemble the user-turn prompt. Mirrors workers/.../claudeClient.js
 * buildUserPrompt — kept inline rather than imported because workers/
 * isn't part of the Vite bundle graph.
 */
export function buildUserPrompt(body, { totalDurationS = 30 } = {}) {
  const lines = [];
  lines.push(`Route: ${body.routeTitle} (${body.routeId})`);
  lines.push(`Tone: ${body.tone}`);
  lines.push(`Language: ${body.language}`);
  lines.push(`Total duration: ${totalDurationS} seconds`);
  if (typeof body.distanceKm === "number") lines.push(`Distance: ${body.distanceKm.toFixed(2)} km`);
  if (typeof body.elevationGainM === "number") lines.push(`Elevation gain: ${Math.round(body.elevationGainM)} m`);
  lines.push("");
  lines.push("Peak moments (normalized progress 0..1):");
  for (const p of body.peakMoments) {
    lines.push(`- t=${p.t.toFixed(3)}  kind=${p.kind}  label="${p.label}"`);
  }
  lines.push("");
  if (Array.isArray(body.landmarks) && body.landmarks.length) {
    lines.push("Curated facts (USE ONLY THESE for religious or historical claims):");
    for (const lm of body.landmarks) {
      const facts = Array.isArray(lm.facts) && lm.facts.length ? lm.facts : ["(no curated facts — describe only what is seen, heard, or felt)"];
      lines.push(`- ${lm.name}:`);
      for (const f of facts) lines.push(`    • ${f}`);
    }
    lines.push("");
  }
  if (typeof body.personalContext === "string" && body.personalContext.trim().length > 0) {
    lines.push("Pilgrim's note (weave this into the narration as their lived experience; do NOT invent facts beyond what is stated here):");
    lines.push(`"""${body.personalContext.trim().slice(0, 500)}"""`);
    lines.push("");
  }
  lines.push(`Produce the JSON described in the system prompt. Cover [0, ${totalDurationS}] seconds end-to-end. One scene per peak moment unless adjacent peaks are within 2s of each other (merge those).`);
  return lines.join("\n");
}

/**
 * Pure: parse Claude's response. Same logic as the Worker's claudeClient
 * parseClaudeResponse; kept inline for the same bundle-graph reason.
 */
export function parseClaudeResponse(rawText, { routeId, tone, language, totalDurationS }) {
  if (typeof rawText !== "string" || rawText.trim().length === 0) {
    throw new Error("Claude returned empty body");
  }
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/```$/, "").trim();
  }
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch (err) {
    throw new Error(`Claude returned non-JSON: ${err.message}; head=${cleaned.slice(0, 120)}`);
  }
  if (!parsed || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error("Claude response is missing scenes array");
  }
  const scenes = parsed.scenes.map((s, i) => {
    const tStart = Number(s.tStart);
    const tEnd = Number(s.tEnd);
    if (!Number.isFinite(tStart) || !Number.isFinite(tEnd) || tEnd <= tStart) {
      throw new Error(`scenes[${i}]: invalid tStart/tEnd (${s.tStart}, ${s.tEnd})`);
    }
    if (typeof s.narration !== "string" || s.narration.length === 0) {
      throw new Error(`scenes[${i}]: narration missing`);
    }
    if (typeof s.captionText !== "string") {
      throw new Error(`scenes[${i}]: captionText missing`);
    }
    return {
      id: typeof s.id === "string" ? s.id : `scene-${i}`,
      tStart,
      tEnd,
      narration: s.narration,
      captionText: s.captionText,
      captionStyle: s.captionStyle === "headline" ? "headline" : "subtitle",
    };
  });
  return {
    routeId,
    tone,
    language,
    scenes,
    meta: {
      scriptModel: DEFAULT_MODEL,
      totalDurationS,
      wordCount: scenes.reduce((acc, s) => acc + s.narration.split(/\s+/).length, 0),
      generatedAt: new Date().toISOString(),
      via: "browser-direct",
    },
  };
}

function withCode(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

async function safeText(res) { try { return await res.text(); } catch { return ""; } }

/**
 * Call Anthropic from the browser. Caller must supply the user's
 * BYOK key and a complete prompt body. Throws Error with `code` so
 * the caller can map to UI states:
 *   - "auth"    → key invalid (401/403)
 *   - "rate"    → 429
 *   - "timeout" → no response within timeoutMs
 *   - "cors"    → preflight or CORS rejection
 *   - "parse"   → response shape unexpected
 */
export async function callAnthropicDirect({
  apiKey,
  systemPrompt,
  body,
  totalDurationS = 30,
  fetchImpl = globalThis.fetch,
  model = DEFAULT_MODEL,
  maxTokens = DEFAULT_MAX_TOKENS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!apiKey) throw withCode("auth", "Anthropic BYOK key is not set");
  if (typeof fetchImpl !== "function") throw withCode("parse", "fetch not available");

  const userPrompt = buildUserPrompt(body, { totalDurationS });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetchImpl(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw withCode("timeout", `Anthropic exceeded ${timeoutMs}ms`);
    // TypeError with "Failed to fetch" is browser-CORS speak.
    if (err?.message && /CORS|Failed to fetch|NetworkError/i.test(err.message)) {
      throw withCode("cors", "Browser-direct Anthropic blocked by CORS. Anthropic must allow this origin OR the BYOK key must route through the Worker.");
    }
    throw withCode("parse", `Anthropic fetch failed: ${err?.message || err}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) throw withCode("auth", "Anthropic rejected the key (revoked or wrong format)");
  if (res.status === 429) throw withCode("rate", "Anthropic rate-limited the request");
  if (!res.ok) {
    const detail = await safeText(res);
    throw withCode("parse", `Anthropic ${res.status}: ${detail.slice(0, 240)}`);
  }
  const json = await res.json();
  const text = Array.isArray(json?.content)
    ? json.content.filter((c) => c?.type === "text").map((c) => c.text).join("")
    : "";
  return parseClaudeResponse(text, {
    routeId: body.routeId,
    tone: body.tone,
    language: body.language,
    totalDurationS,
  });
}
