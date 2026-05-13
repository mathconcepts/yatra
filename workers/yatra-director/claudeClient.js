/**
 * Claude API client for the yatra-director Worker.
 *
 * Pure split:
 *   - extractSystemPrompt: pure markdown stripper (everything after `---`)
 *   - buildUserPrompt: pure assembler from the /v1/script request body
 *   - parseClaudeResponse: pure JSON extractor with sanity checks
 *   - callClaude: the only function that touches fetch; thin
 *
 * Pure parts are unit-tested. The fetch path is exercised via integration
 * with a mocked fetch in worker tests.
 */

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 1024;

/**
 * Strip the documentation preamble from a prompt markdown file.
 * Returns everything after the first standalone `---` line, trimmed.
 * If no `---` is found, returns the whole content trimmed.
 */
export function extractSystemPrompt(markdown) {
  if (typeof markdown !== "string") return "";
  const lines = markdown.split("\n");
  const sepIdx = lines.findIndex((l) => l.trim() === "---");
  if (sepIdx === -1) return markdown.trim();
  return lines.slice(sepIdx + 1).join("\n").trim();
}

/**
 * Assemble the user-turn prompt from a validated /v1/script request.
 * Mirrors the structure the system prompt expects (Curated facts +
 * peak moments + duration target).
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
  lines.push("Produce the JSON described in the system prompt. Cover [0, " + totalDurationS + "] seconds end-to-end. One scene per peak moment unless adjacent peaks are within 2s of each other (merge those).");
  return lines.join("\n");
}

/**
 * Parse Claude's response into the /v1/script scenes payload.
 * Tolerates surrounding whitespace and accidental ```json fences.
 * Throws with a clear message on schema failure.
 */
export function parseClaudeResponse(rawText, { routeId, tone, language, totalDurationS }) {
  if (typeof rawText !== "string" || rawText.trim().length === 0) {
    throw new Error("Claude returned empty body");
  }
  // Strip optional ```json fences
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/```$/, "").trim();
  }
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Claude returned non-JSON: ${err.message}; head=${cleaned.slice(0, 120)}`);
  }
  if (!parsed || !Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error("Claude response is missing scenes array");
  }
  // Light schema clean: coerce numbers, defaults for captionStyle.
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
    },
  };
}

/**
 * Call Claude. Production passes the global fetch; tests inject a stub.
 * Returns the parsed /v1/script payload, ready to JSON.stringify.
 *
 * Errors surface with `code` so the Worker can map them onto RFC-7807 slugs:
 *   - "auth"      → 502 upstream-claude (revealed only as upstream failure)
 *   - "timeout"   → 504 upstream-claude
 *   - "rate"      → 503 upstream-claude
 *   - "parse"     → 502 upstream-claude
 */
export async function callClaude({
  apiKey,
  systemPrompt,
  body,
  totalDurationS = 30,
  fetchImpl = globalThis.fetch,
  model = DEFAULT_MODEL,
  maxTokens = DEFAULT_MAX_TOKENS,
  timeoutMs = 15000,
} = {}) {
  if (!apiKey) throw withCode("auth", "ANTHROPIC_API_KEY not provisioned");
  if (typeof fetchImpl !== "function") throw withCode("parse", "fetch not available");

  const userPrompt = buildUserPrompt(body, { totalDurationS });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
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
    if (err?.name === "AbortError") throw withCode("timeout", `Claude request exceeded ${timeoutMs}ms`);
    throw withCode("parse", `fetch failed: ${err?.message || err}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) throw withCode("auth", "Anthropic rejected the key");
  if (res.status === 429) throw withCode("rate", "Anthropic rate-limited the request");
  if (!res.ok) {
    const detail = await safeText(res);
    throw withCode("parse", `Claude ${res.status}: ${detail.slice(0, 240)}`);
  }
  const json = await res.json();
  // Claude responses: { content: [{ type: "text", text: "..." }] }
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

function withCode(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

async function safeText(res) {
  try { return await res.text(); } catch { return ""; }
}
