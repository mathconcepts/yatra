/**
 * Client-side system prompt loader.
 *
 * Reads the markdown source-of-truth at
 * `workers/yatra-director/prompts/<tone>.md` via Vite's `?raw` query
 * suffix, strips the documentation preamble (everything up to the first
 * standalone `---` line), and exposes the result as a string the
 * BYOK-Anthropic-direct path can pass to Anthropic as the system prompt.
 *
 * The Worker has its own copy of this logic in
 * `workers/yatra-director/claudeClient.js#extractSystemPrompt`. The two
 * MUST stay in sync; the markdown file is the human-editable source.
 *
 * If Vite changes its `?raw` semantics or we move to SSR, this loader
 * is the only file that needs to change — callers see a sync getter.
 */

import devotionalMd  from "../../workers/yatra-director/prompts/devotional.md?raw";
import explorerMd    from "../../workers/yatra-director/prompts/explorer.md?raw";
import poeticMd      from "../../workers/yatra-director/prompts/poetic.md?raw";
import historicalMd  from "../../workers/yatra-director/prompts/historical.md?raw";

const SOURCES = {
  devotional: devotionalMd,
  explorer:   explorerMd,
  poetic:     poeticMd,
  historical: historicalMd,
};

/**
 * Pure: strip everything up to and including the first standalone `---`
 * line. Returns the remainder trimmed. Mirrors the Worker's
 * extractSystemPrompt.
 */
export function extractSystemPrompt(markdown) {
  if (typeof markdown !== "string") return "";
  const lines = markdown.split("\n");
  const sepIdx = lines.findIndex((l) => l.trim() === "---");
  if (sepIdx === -1) return markdown.trim();
  return lines.slice(sepIdx + 1).join("\n").trim();
}

/**
 * Get the compiled system prompt for a tone. Throws on unknown tone so
 * misconfigured palettes fail loudly rather than silently passing an
 * empty prompt to Claude.
 */
export function getSystemPrompt(tone) {
  const raw = SOURCES[tone];
  if (typeof raw === "string") return extractSystemPrompt(raw);
  // Unknown tone (e.g. a future palette that doesn't have a prompt yet):
  // fall back to devotional + a one-line tone hint rather than throwing.
  // The film still renders; the AI gets a clear instruction to use the
  // requested tone label as its register.
  const fallback = SOURCES.devotional;
  if (typeof fallback === "string") {
    return `Tone register: "${tone}". Adapt the narration voice accordingly.\n\n` +
      extractSystemPrompt(fallback);
  }
  throw new Error(`directorPrompts: no markdown source for tone "${tone}"`);
}
