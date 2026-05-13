/**
 * Devotional tone — reverent, third-person, slow.
 *
 * Baseline pulled from existing styles.css: saffron #8a4528, parchment
 * #f4ede1. Indic font stack chosen for actual glyph coverage (Cormorant
 * Garamond, the existing Latin face, covers zero Devanagari/Telugu/Tamil).
 * Caption motion is slow fade per the reviewer's "Devotional = slow fade
 * 800ms ease-out" note.
 *
 * Ambient rules use the existing landmarkProximityFactor from moodCamera
 * (0..1, 1 = at landmark). Bell rings start blending in inside 200m and
 * peak at touch. Wind is the bed under everything.
 */
import { assertPalette } from "./schema.js";

const devotional = {
  id: "devotional",
  displayName: "Devotional",
  scriptSystemPrompt:
    "You are an unobtrusive narrator of an Indian pilgrimage journey. " +
    "Tone: reverent, third-person, present tense, hushed. Sentences short, " +
    "two to twelve words. Never invent religious history, deity attribution, " +
    "or temple lore beyond the curated facts provided in the user prompt. " +
    "If a fact is not in the curated facts, do not state it. Use the " +
    "pilgrim's path itself as the protagonist. No exclamations, no marketing " +
    "language, no superlatives. Avoid Sanskrit terms the listener may not " +
    "know without an English gloss the first time. Produce one line per " +
    "scene; each line is the narration text only, no stage directions.",
  voice: {
    provider: "google-tts",
    // Google Cloud TTS voice names. Free tier covers ~1M chars/month per
    // voice family — effectively unmetered for a side project. Devotional
    // tone leans on Wavenet voices for warmth where available; Indic
    // voices use the highest-tier neural option Google publishes for
    // each locale. en-IN gives Indian-English accent (Wavenet-A is a
    // calm female voice that suits devotional narration).
    voiceIdByLang: {
      en: "en-IN-Wavenet-A",
      hi: "hi-IN-Wavenet-A",
      te: "te-IN-Standard-A",
      ta: "ta-IN-Wavenet-A",
    },
    tempo: 0.92, // slightly slower than neutral (maps to Google speakingRate)
    style: "calm",
  },
  music: {
    // Static asset paths; ship beds under public/audio/devotional/.
    bedUrl: "/audio/devotional/bed-tanpura-c.opus",
    bedDbfs: -22, // bed sits under narration
    bedBpmRange: [40, 60],
  },
  ambient: {
    // Each rule fires when landmarkProximityFactor crosses `from`->`to`.
    rules: [
      { id: "temple-bell", asset: "/audio/devotional/bell-mandir.opus", gateAt: 0.55, peakAt: 0.95, dbfs: -14 },
      { id: "wind-bed", asset: "/audio/devotional/wind-hills.opus", gateAt: 0.0, peakAt: 0.3, dbfs: -28 },
    ],
  },
  color: {
    primary: "#8a4528",
    ink: "#2a1a12",
    parchment: "#f4ede1",
    // 4x4 color-matrix warm-shift LUT, applied per-frame in colorGrade.js.
    // (R,G,B,A) -> (R',G',B',A'). Saturation slight bump on warm channels.
    lut: [
      [1.06, 0.04, 0.0, 0.0],
      [0.02, 1.0, 0.0, 0.0],
      [0.0, 0.02, 0.92, 0.0],
      [0.0, 0.0, 0.0, 1.0],
    ],
  },
  typography: {
    latin: "Fraunces, 'Cormorant Garamond', Georgia, serif",
    devanagari: "'Tiro Devanagari Hindi', 'Mukta', serif",
    telugu: "'Mandali', 'Hind Guntur', sans-serif",
    tamil: "'Catamaran', 'Mukta Malar', sans-serif",
    baseSize: 28, // px at 9:16 1080x1920 export
    lineHeight: 1.42, // tall enough for Devanagari headmarks
    titleSize: 56,
  },
  caption: {
    motion: "fade",
    holdMs: 1800, // long enough to read in a quiet temple
    easing: "cubic-bezier(0.22, 1, 0.36, 1)", // ease-out
    fadeMs: 800,
    perLine: true, // burn one caption per narration line; sound-off Instagram reality
  },
  basemapTreatment: "warm-parchment",
  ornament: {
    // 9:16 cover frame ornament — a thin saffron mandala stroke at the
    // bottom of the postcard. SVG path lives next to this file.
    asset: "/ornament/devotional-mandala.svg",
    accentColor: "#8a4528",
  },
};

export default assertPalette(devotional);
