// Pure: build the strict polish prompt for a postcard.
//
// Locked spec from the v3.0 plan (reviewer correction #6, postcard polish
// manifest): temp=0 + model pin + prompt hash committed alongside the
// polished text. The prompt itself is versioned via PROMPT_VERSION; bumping
// the version invalidates the manifest hash for every polished entry, so
// reviewers can see at a glance which entries pre-date a prompt change.

export const PROMPT_VERSION = "v1";

export const SYSTEM_PROMPT = `You are polishing a hand-written postcard for a travel-storytelling app focused on India.

The human author wrote the draft. Your job is to tighten the prose to ≤60 words while preserving:

1. Every place name verbatim. Do not change spelling. Do not add new place names.
2. Every numeric fact verbatim. Distances, dates, years, dimensions, step counts.
3. The author's voice: editorial, atlas-like, present-tense, concrete nouns over abstractions.

Hard rules:
- Do NOT add facts that are not in the draft.
- Do NOT add new proper nouns of any kind (people, places, organisations, deities, festivals).
- Do NOT add adjectives that change the religious or political framing.
- If the draft is already ≤60 words and reads well, return it unchanged.

Reply with ONLY the polished postcard text. No preamble, no explanation, no quotation marks.`;

export function userPrompt(draft) {
  return `Draft postcard:\n\n${draft}\n\nReturn the polished postcard.`;
}

/**
 * Stable string used for the prompt hash in the manifest. Includes the
 * version + system prompt + draft so any change to any of them produces a
 * fresh hash.
 */
export function promptHashInput(draft) {
  return `${PROMPT_VERSION}\n---\n${SYSTEM_PROMPT}\n---\n${draft}`;
}
