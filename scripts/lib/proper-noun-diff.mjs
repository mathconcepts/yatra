// Pure: extract capitalised tokens from prose, ignoring sentence-initial caps
// and a small stop-list of common capitalised function words. Used by the
// postcard-polish eval to assert the LLM did not invent new proper nouns.
//
// Conservative by design: false-positives are OK (cost: skip a real polish),
// false-negatives (the LLM invents a place and we miss it) are not.

const STOP = new Set([
  "A", "An", "The", "And", "Or", "But", "For", "Nor", "Yet", "So",
  "If", "As", "To", "Of", "In", "On", "At", "By", "Up", "Is", "Was",
  "Are", "Were", "Be", "Been", "Being", "Have", "Has", "Had", "Do",
  "Does", "Did", "Will", "Would", "Should", "Can", "Could", "May",
  "Might", "Must", "Their", "Its", "Our", "His", "Her", "Your", "My",
  "This", "That", "These", "Those", "Here", "There", "Now", "Then",
  "From", "With", "Without", "About", "Into", "Over", "Under",
  "After", "Before", "When", "Where", "Why", "How", "What", "Who",
  "Some", "Many", "Most", "Few", "All", "Every", "Each", "Both",
  "I", "We", "You", "He", "She", "It", "They", "Me", "Us", "Him",
]);

const SENTENCE_BOUNDARY = /(?<=[.!?])\s+/;

/**
 * Return the set of capitalised tokens that look like proper nouns:
 *   - start with [A-Z]
 *   - not at the very start of a sentence
 *   - not in the STOP list
 *   - punctuation stripped from the edges
 */
export function extractProperNouns(text) {
  if (!text) return new Set();
  const set = new Set();
  const sentences = text.split(SENTENCE_BOUNDARY);
  for (const s of sentences) {
    const trimmed = s.trim();
    if (!trimmed) continue;
    const words = trimmed.split(/\s+/);
    words.forEach((raw, idx) => {
      const clean = raw.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "");
      if (!clean) return;
      if (idx === 0) return; // sentence-start; ambiguous, skip
      if (!/^[A-Z][a-zA-Z]+$/.test(clean)) return;
      if (STOP.has(clean)) return;
      set.add(clean);
    });
  }
  return set;
}

/**
 * Tokens present in `polished` but not in `draft`. Non-empty = REJECT.
 */
export function diffNewProperNouns(draft, polished) {
  const a = extractProperNouns(draft);
  const b = extractProperNouns(polished);
  return [...b].filter((tok) => !a.has(tok));
}

/**
 * Word count (whitespace-split). Used by the ≤60-word polish target.
 */
export function wordCount(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}
