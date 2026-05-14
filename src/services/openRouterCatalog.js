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

export const OPENROUTER_MODELS = [
  // Anthropic — highest quality, paid
  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", note: "Best for structured JSON output", tier: "paid" },
  { id: "anthropic/claude-3-haiku",    label: "Claude 3 Haiku",    note: "Fast and cheap, good quality",   tier: "paid" },

  // OpenAI — paid
  { id: "openai/gpt-4o",         label: "GPT-4o",      note: "OpenAI's flagship multimodal model", tier: "paid" },
  { id: "openai/gpt-4o-mini",    label: "GPT-4o Mini", note: "Cheaper, still very capable",        tier: "paid" },

  // Google — paid + free
  { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash", note: "Google's fast tier",        tier: "paid" },

  // Meta — free!
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)", note: "Free tier, rate-limited", tier: "free" },

  // DeepSeek — free!
  { id: "deepseek/deepseek-chat:free",  label: "DeepSeek V3 (free)",  note: "Free, capable, good with JSON",  tier: "free" },

  // Qwen — free!
  { id: "qwen/qwen-2.5-72b-instruct:free", label: "Qwen 2.5 72B (free)", note: "Free, strong multilingual",      tier: "free" },

  // Mistral — free!
  { id: "mistralai/mistral-nemo:free", label: "Mistral Nemo (free)", note: "Free, decent quality",            tier: "free" },
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
