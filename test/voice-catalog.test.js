import { describe, it, expect } from "vitest";
import { VOICE_CATALOG, voicesForLanguage } from "../src/services/voiceCatalog.js";
import { buildTtsRequest } from "../src/services/directorTTS.js";
import { getPalette } from "../src/services/tonePalettes/index.js";

describe("voiceCatalog", () => {
  it("provides at least one voice for each supported language", () => {
    for (const lang of ["en", "hi", "te", "ta"]) {
      const voices = voicesForLanguage(lang);
      expect(voices.length).toBeGreaterThan(0);
      voices.forEach((v) => {
        expect(typeof v.id).toBe("string");
        expect(typeof v.label).toBe("string");
        expect(v.id.startsWith(`${lang}-IN-`)).toBe(true);
      });
    }
  });

  it("returns empty array for unknown languages", () => {
    expect(voicesForLanguage("xx")).toEqual([]);
    expect(voicesForLanguage(null)).toEqual([]);
  });
});

describe("buildTtsRequest voiceOverride", () => {
  const palette = getPalette("devotional");
  const scene = { tStart: 0, tEnd: 4, narration: "hi", captionText: "hi" };

  it("uses the palette default when no override is supplied", () => {
    const req = buildTtsRequest({ scene, palette, language: "en" });
    expect(req.voiceId).toBe(palette.voice.voiceIdByLang.en);
  });

  it("user-picked voiceOverride wins over the palette default", () => {
    const req = buildTtsRequest({ scene, palette, language: "en", voiceOverride: "en-IN-Wavenet-C" });
    expect(req.voiceId).toBe("en-IN-Wavenet-C");
  });
});
