/**
 * Curated Google Cloud TTS voice options exposed in the Director wizard.
 *
 * Each language gets 2-4 voices: a "default" suited to the devotional
 * tone (palette pick), plus alternates (different gender, different
 * neural family). Names are real Google voice IDs — see
 * https://cloud.google.com/text-to-speech/docs/voices.
 *
 * Tempo / pitch stay on the palette. Only voice identity is swappable.
 */
export const VOICE_CATALOG = {
  en: [
    { id: "en-IN-Wavenet-A", label: "Indian English · Wavenet A (female, warm)" },
    { id: "en-IN-Wavenet-D", label: "Indian English · Wavenet D (female, bright)" },
    { id: "en-IN-Wavenet-B", label: "Indian English · Wavenet B (male, steady)" },
    { id: "en-IN-Wavenet-C", label: "Indian English · Wavenet C (male, deep)" },
  ],
  hi: [
    { id: "hi-IN-Wavenet-A", label: "हिन्दी · Wavenet A (female)" },
    { id: "hi-IN-Wavenet-D", label: "हिन्दी · Wavenet D (female)" },
    { id: "hi-IN-Wavenet-B", label: "हिन्दी · Wavenet B (male)" },
    { id: "hi-IN-Wavenet-C", label: "हिन्दी · Wavenet C (male)" },
  ],
  te: [
    // Google currently ships te-IN as Standard only (no Wavenet/Neural2 yet).
    { id: "te-IN-Standard-A", label: "తెలుగు · Standard A (female)" },
    { id: "te-IN-Standard-B", label: "తెలుగు · Standard B (male)" },
  ],
  ta: [
    { id: "ta-IN-Wavenet-A", label: "தமிழ் · Wavenet A (female)" },
    { id: "ta-IN-Wavenet-C", label: "தமிழ் · Wavenet C (female)" },
    { id: "ta-IN-Wavenet-B", label: "தமிழ் · Wavenet B (male)" },
    { id: "ta-IN-Wavenet-D", label: "தமிழ் · Wavenet D (male)" },
  ],
};

export function voicesForLanguage(lang) {
  return VOICE_CATALOG[lang] || [];
}
