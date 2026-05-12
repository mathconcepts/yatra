/**
 * AI scaffold — turn a free-text memory description into a verified
 * sequence of place waypoints.
 *
 * Pipeline (v3.1 initial release — no LLM call in-browser yet):
 *   1. Extract candidate place names from the text (heuristic — capitalized
 *      phrases) — pure, exported as extractCandidates().
 *   2. Geocode each candidate via Nominatim — defensive, retains only
 *      results above an importance floor.
 *   3. Sort the verified places by their position in the original text
 *      so the route reads in narrative order.
 *
 * Why no LLM call yet: an in-browser LLM call needs a user-supplied API
 * key (or a backend proxy). The verification + ordering layer is what
 * makes the scaffold safe to ship without one. Slice G+ will plug in a
 * proper LLM extractor that catches multi-word + lowercase places.
 *
 * Returns { waypoints: [{name, lat, lon}], skipped: string[] }.
 */

import { geocode } from "./geocoder";

const STOP = new Set([
  "I", "We", "You", "He", "She", "It", "They", "The", "A", "An",
  "And", "Or", "But", "If", "Then", "Of", "In", "On", "At", "To",
  "From", "By", "With", "For", "About", "After", "Before", "Through",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December",
  // Sentence-start verbs commonly used in trip descriptions — they
  // capitalize because of position, not because they're proper nouns.
  "Visited", "Went", "Drove", "Started", "Took", "Got", "Reached",
  "Arrived", "Stayed", "Spent", "Saw", "Came", "Did", "Flew", "Hiked",
  "Walked", "Rode", "Crossed", "Climbed", "Stopped", "Camped",
]);

function isSentenceStart(text, index) {
  if (index === 0) return true;
  // Look backward through whitespace to find the preceding non-space char.
  for (let i = index - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === " " || ch === "\n" || ch === "\t") continue;
    return ch === "." || ch === "!" || ch === "?";
  }
  return true;
}

/**
 * Pure: extract capitalized multi-word phrases as candidate place names.
 *
 * Examples: "We went to Manali for a week, then drove up to Rohtang Pass."
 *   → ["Manali", "Rohtang Pass"]
 *
 * Heuristic limits: requires capital letter start, drops STOP words,
 * preserves intra-phrase tokens ("Rohtang Pass" stays one phrase).
 */
export function extractCandidates(text) {
  if (typeof text !== "string" || text.trim().length === 0) return [];
  const phraseRegex = /\b([A-Z][\p{L}']+(?:\s+[A-Z][\p{L}']+)*)\b/gu;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = phraseRegex.exec(text)) !== null) {
    let phrase = m[1];
    const startIdx = m.index;
    // If the first token is a sentence-start stop-verb, drop just that
    // token from the phrase. "Visited Manali" → "Manali"; "Drove up to
    // Rohtang Pass" doesn't matter since "up" + "to" are lowercase.
    if (isSentenceStart(text, startIdx)) {
      const tokens = phrase.split(/\s+/);
      if (tokens.length > 0 && STOP.has(tokens[0])) {
        tokens.shift();
        phrase = tokens.join(" ");
      }
    }
    if (!phrase) continue;
    if (STOP.has(phrase)) continue;
    if (seen.has(phrase.toLowerCase())) continue;
    seen.add(phrase.toLowerCase());
    out.push(phrase);
  }
  return out;
}

const MIN_IMPORTANCE = 0.35;

/**
 * Run the full scaffold pipeline. `fetcher` is injectable for tests.
 */
export async function scaffoldFromText(text, { fetcher } = {}) {
  const candidates = extractCandidates(text);
  const waypoints = [];
  const skipped = [];
  for (const c of candidates) {
    const results = await geocode(c, { fetcher });
    const best = results.find((r) => (r.importance ?? 0) >= MIN_IMPORTANCE) || results[0];
    if (!best) { skipped.push(c); continue; }
    waypoints.push({ name: best.name, lat: best.lat, lon: best.lon, query: c });
  }
  return { waypoints, skipped };
}
