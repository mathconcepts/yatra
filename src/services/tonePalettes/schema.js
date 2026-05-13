/**
 * Tone palette schema. A palette is the complete "taste" bundle for one
 * directed reel: how it sounds, what it says, how it reads on screen, and
 * how the map is graded. Adding a new tone = drop a new file in this
 * directory and register it in `index.js`. The validator below loud-fails
 * on missing fields so a half-defined palette never ships.
 *
 * Per the design doc: "The moat is taste, not tech."
 */

const REQUIRED_FIELDS = [
  "id",
  "displayName",
  "scriptSystemPrompt",
  "voice",
  "music",
  "ambient",
  "color",
  "typography",
  "caption",
  "basemapTreatment",
];

const REQUIRED_VOICE_FIELDS = ["provider", "voiceIdByLang", "tempo", "style"];
const REQUIRED_COLOR_FIELDS = ["primary", "ink", "parchment", "lut"];
const REQUIRED_TYPOGRAPHY_FIELDS = ["latin", "devanagari", "telugu", "tamil", "baseSize"];
const REQUIRED_CAPTION_FIELDS = ["motion", "holdMs", "easing"];

export const SUPPORTED_LANGUAGES = ["en", "hi", "te", "ta"];

export function validatePalette(palette) {
  const errors = [];
  if (!palette || typeof palette !== "object") {
    return ["palette must be an object"];
  }
  for (const f of REQUIRED_FIELDS) {
    if (palette[f] === undefined || palette[f] === null) {
      errors.push(`missing field: ${f}`);
    }
  }
  if (palette.voice) {
    for (const f of REQUIRED_VOICE_FIELDS) {
      if (palette.voice[f] === undefined) errors.push(`missing voice.${f}`);
    }
    if (palette.voice.voiceIdByLang) {
      for (const lang of SUPPORTED_LANGUAGES) {
        if (!palette.voice.voiceIdByLang[lang]) {
          errors.push(`missing voice.voiceIdByLang.${lang}`);
        }
      }
    }
  }
  if (palette.color) {
    for (const f of REQUIRED_COLOR_FIELDS) {
      if (palette.color[f] === undefined) errors.push(`missing color.${f}`);
    }
    if (palette.color.lut && !Array.isArray(palette.color.lut)) {
      errors.push("color.lut must be a 3x3 or 4x4 numeric matrix");
    }
  }
  if (palette.typography) {
    for (const f of REQUIRED_TYPOGRAPHY_FIELDS) {
      if (palette.typography[f] === undefined) errors.push(`missing typography.${f}`);
    }
  }
  if (palette.caption) {
    for (const f of REQUIRED_CAPTION_FIELDS) {
      if (palette.caption[f] === undefined) errors.push(`missing caption.${f}`);
    }
  }
  if (palette.ambient && !Array.isArray(palette.ambient.rules)) {
    errors.push("ambient.rules must be an array");
  }
  return errors;
}

export function assertPalette(palette) {
  const errs = validatePalette(palette);
  if (errs.length) {
    throw new Error(`invalid tone palette ${palette?.id || "?"}: ${errs.join("; ")}`);
  }
  return palette;
}
