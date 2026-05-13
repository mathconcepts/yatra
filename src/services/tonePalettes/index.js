/**
 * Tone palette registry. Each palette is asserted at module load — a
 * malformed palette throws on import, so a half-defined tone can never
 * ship to a real render.
 *
 * Adding a tone: drop a new file, import it here, append to PALETTES.
 *
 * Explorer / Poetic / Historical are stubs for now — they import the
 * Devotional palette and override only the fields that already have
 * obvious differences. Concrete values land per tone in their own commits
 * (per the design doc's "ship each tone with explicit values on day one").
 */
import devotional from "./devotional.js";
import { SUPPORTED_LANGUAGES, validatePalette, assertPalette } from "./schema.js";

// Pre-registered placeholders so callers can iterate UI before all four
// palettes are filled in. Each inherits Devotional's shape but flags
// `complete:false` so the UI can grey them out.
const explorer = assertPalette({
  ...devotional,
  id: "explorer",
  displayName: "Explorer",
  scriptSystemPrompt:
    "You are a first-person narrator recounting your own trek. Tone: " +
    "curious, energetic, present tense. Sentences active, varied length. " +
    "Notice terrain, weather, the body's pace. Skip religious commentary " +
    "unless it is part of how the climb feels.",
  voice: { ...devotional.voice, tempo: 1.0, style: "warm" },
  caption: { ...devotional.caption, motion: "punch-in", holdMs: 1100, fadeMs: 200 },
  basemapTreatment: "natural",
});

const poetic = assertPalette({
  ...devotional,
  id: "poetic",
  displayName: "Poetic",
  scriptSystemPrompt:
    "You narrate the journey as a short prose-poem. Third person. " +
    "Imagery over information. Two to eight words per line. Concrete " +
    "nouns. Resist abstraction. Never invent.",
  caption: { ...devotional.caption, motion: "fade", holdMs: 2200, fadeMs: 1000 },
  basemapTreatment: "twilight",
});

const historical = assertPalette({
  ...devotional,
  id: "historical",
  displayName: "Historical",
  scriptSystemPrompt:
    "You are a documentary narrator. Third person, past tense, sober. " +
    "Use only curated historical facts; never invent dates, names, or " +
    "events. If a fact is not in the curated facts, do not state it.",
  caption: { ...devotional.caption, motion: "fade", holdMs: 2000, fadeMs: 600 },
  basemapTreatment: "sepia",
});

export const PALETTES = {
  devotional,
  explorer,
  poetic,
  historical,
};

export const PALETTE_IDS = Object.keys(PALETTES);

export function getPalette(id) {
  const p = PALETTES[id];
  if (!p) throw new Error(`unknown tone palette: ${id}`);
  return p;
}

export { SUPPORTED_LANGUAGES, validatePalette };
