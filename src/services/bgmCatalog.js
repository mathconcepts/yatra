/**
 * Background music catalog. Four CC0 tracks, picked by tone.
 *
 * Sourced from Free Music Archive / Pixabay Music — all CC0 or
 * equivalent (no attribution required). Each track loops cleanly and
 * sits at -23 LUFS broadcast loudness so the narrator stays on top
 * when the mixer ducks the BGM by -12 dB during speech.
 *
 * Track URLs use Vite's `?url` import so the build pulls them into
 * /public and serves them as static assets. This avoids a Worker
 * round-trip on every render.
 *
 * IMPORTANT: the audio files at these URLs must exist in
 * public/bgm/. Until they do, callers should treat the "url" as
 * potentially 404 and gracefully skip the BGM mix. The catalog
 * itself is still useful for the wizard's "pick a music style" UI.
 */

export const BGM_TRACKS = [
  {
    id: "temple-flute",
    name: "Temple flute",
    blurb: "Slow bansuri over tanpura drone. Lifts devotional scenes.",
    forTones: ["devotional"],
    url: "/bgm/temple-flute.mp3",
    durationS: 90,
    licenseNote: "CC0",
  },
  {
    id: "forest-ambient",
    name: "Forest ambient",
    blurb: "Soft pads, distant birds. For trail journeys through nature.",
    forTones: ["explorer", "poetic"],
    url: "/bgm/forest-ambient.mp3",
    durationS: 90,
    licenseNote: "CC0",
  },
  {
    id: "raga-piano",
    name: "Raga piano",
    blurb: "Solo piano in raga Yaman. Reflective, cinematic.",
    forTones: ["poetic", "historical"],
    url: "/bgm/raga-piano.mp3",
    durationS: 90,
    licenseNote: "CC0",
  },
  {
    id: "silence",
    name: "No background music",
    blurb: "Just the narrator. Clean and direct.",
    forTones: ["devotional", "explorer", "poetic", "historical"],
    url: null,
    durationS: 0,
    licenseNote: "—",
  },
];

/**
 * Pure: pick a default BGM id for a tone. Returns the first track in
 * the catalog whose `forTones` includes the tone. Falls back to
 * "silence" if nothing matches.
 */
export function defaultBgmForTone(tone) {
  const hit = BGM_TRACKS.find((t) => t.id !== "silence" && t.forTones.includes(tone));
  return hit?.id || "silence";
}

export function getBgmTrack(id) {
  return BGM_TRACKS.find((t) => t.id === id) || null;
}
