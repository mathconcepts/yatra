import { describe, it, expect } from "vitest";
import { PALETTES, PALETTE_IDS, getPalette, validatePalette, SUPPORTED_LANGUAGES } from "../src/services/tonePalettes/index.js";

describe("tone palettes", () => {
  it("exports the four canonical tones", () => {
    expect(PALETTE_IDS).toEqual(["devotional", "explorer", "poetic", "historical"]);
  });

  it("every palette passes its own validator", () => {
    for (const id of PALETTE_IDS) {
      const errs = validatePalette(PALETTES[id]);
      expect(errs, `palette ${id} should validate cleanly: ${errs.join(", ")}`).toEqual([]);
    }
  });

  it("every palette declares a voice id for every supported language", () => {
    for (const id of PALETTE_IDS) {
      const p = PALETTES[id];
      for (const lang of SUPPORTED_LANGUAGES) {
        expect(p.voice.voiceIdByLang[lang], `${id}.voice.voiceIdByLang.${lang}`).toBeTruthy();
      }
    }
  });

  it("getPalette returns by id and throws on unknown", () => {
    expect(getPalette("devotional").id).toBe("devotional");
    expect(() => getPalette("nonexistent")).toThrow();
  });

  it("validator catches missing fields", () => {
    const broken = { id: "broken" };
    const errs = validatePalette(broken);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.some(e => e.includes("scriptSystemPrompt"))).toBe(true);
  });

  it("devotional palette uses Indic-capable fonts (not Cormorant alone)", () => {
    const d = getPalette("devotional");
    // Cormorant Garamond has no Indic glyph coverage; Indic fields must
    // not fall back to it.
    expect(d.typography.devanagari).not.toMatch(/^Cormorant/);
    expect(d.typography.telugu).not.toMatch(/^Cormorant/);
    expect(d.typography.tamil).not.toMatch(/^Cormorant/);
  });

  it("devotional color LUT is a 4x4 matrix", () => {
    const lut = getPalette("devotional").color.lut;
    expect(lut).toHaveLength(4);
    for (const row of lut) expect(row).toHaveLength(4);
  });

  it("captions are configured per-line for sound-off Instagram playback", () => {
    for (const id of PALETTE_IDS) {
      expect(getPalette(id).caption.perLine, `${id}.caption.perLine`).toBe(true);
    }
  });
});
