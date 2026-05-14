/**
 * Curated OpenRouter models for the Director wizard.
 *
 * OpenRouter lists 200+ models. We surface ~10 that work well for
 * script generation (good at JSON-formatted output, reasonable cost,
 * supports system role). Users who want something else can type any
 * `provider/model` slug — the free-text override flows through.
 *
 * Free models are marked with `:free` per OpenRouter's convention.
 * They're rate-limited but cost nothing.
 */

/**
 * NOTE on model slugs: OpenRouter retires and renames models often.
 * If a slug here ever 404s, check https://openrouter.ai/models for
 * the current id and PR a replacement. The wizard's free-text input
 * still accepts any slug, so users can paste fresh ones at runtime.
 *
 * The DEFAULT is intentionally a free model so a fresh BYOK key with
 * zero credits still works on the first Test click.
 */
export const OPENROUTER_DEFAULT_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

export const OPENROUTER_MODELS = [
  // Free models — listed first because they work without credits and
  // the default is one of these.
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B", note: "Free, rate-limited, very capable",  tier: "free" },
  { id: "deepseek/deepseek-chat-v3-0324:free",    label: "DeepSeek V3",   note: "Free, excellent JSON output",       tier: "free" },
  { id: "qwen/qwen-2.5-72b-instruct:free",        label: "Qwen 2.5 72B",  note: "Free, strong multilingual",          tier: "free" },
  { id: "mistralai/mistral-small-3.1-24b-instruct:free", label: "Mistral Small 3.1", note: "Free, fast",          tier: "free" },
  { id: "google/gemini-2.0-flash-exp:free",       label: "Gemini 2.0 Flash", note: "Free experimental tier",         tier: "free" },

  // Paid — best quality. Slugs valid as of OpenRouter mid-2025; verify
  // at openrouter.ai/models if Test returns 404.
  { id: "anthropic/claude-3.5-sonnet",  label: "Claude 3.5 Sonnet", note: "Best for structured JSON output", tier: "paid" },
  { id: "anthropic/claude-3.5-haiku",   label: "Claude 3.5 Haiku",  note: "Fast and cheap, good quality",    tier: "paid" },
  { id: "openai/gpt-4o",                label: "GPT-4o",            note: "OpenAI's flagship",               tier: "paid" },
  { id: "openai/gpt-4o-mini",           label: "GPT-4o Mini",       note: "Cheaper, capable",                tier: "paid" },
  { id: "google/gemini-2.0-flash-001",  label: "Gemini 2.0 Flash",  note: "Google's fast tier",              tier: "paid" },
];

export function isOpenRouterModelId(s) {
  // OpenRouter slugs look like "provider/model[:variant]". Accept any
  // slash-separated identifier; lets users paste new releases without
  // waiting for us to update this catalog.
  return typeof s === "string" && /^[a-z0-9._-]+\/[a-z0-9._:-]+$/i.test(s.trim());
}

export function findOpenRouterModel(id) {
  if (!id) return null;
  return OPENROUTER_MODELS.find((m) => m.id === id) || null;
}
