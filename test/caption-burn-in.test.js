import { describe, it, expect } from "vitest";
import {
  fontForLanguage,
  layoutCaption,
  wrapWords,
  captionOpacity,
  drawCaption,
  DEFAULT_INSETS_9x16,
} from "../src/services/captionBurnIn.js";
import devotional from "../src/services/tonePalettes/devotional.js";

describe("captionBurnIn", () => {
  describe("fontForLanguage", () => {
    it("picks Indic fonts for Indic languages, not Latin", () => {
      expect(fontForLanguage(devotional.typography, "te")).toBe(devotional.typography.telugu);
      expect(fontForLanguage(devotional.typography, "hi")).toBe(devotional.typography.devanagari);
      expect(fontForLanguage(devotional.typography, "ta")).toBe(devotional.typography.tamil);
    });
    it("falls back to Latin for English and unknown", () => {
      expect(fontForLanguage(devotional.typography, "en")).toBe(devotional.typography.latin);
      expect(fontForLanguage(devotional.typography, "??")).toBe(devotional.typography.latin);
    });
    it("returns a safe default when typography is missing", () => {
      expect(fontForLanguage(null, "te")).toMatch(/system|sans/);
    });
  });

  describe("wrapWords", () => {
    // Fake measurer: each char is 10px wide.
    const measure10 = (s) => s.length * 10;

    it("returns a single line when text fits", () => {
      expect(wrapWords("hello", 100, measure10)).toEqual(["hello"]);
    });
    it("wraps on whitespace when over width", () => {
      // "hello " = 60, "world" = 50, total 110 > 100, so wrap.
      const out = wrapWords("hello world", 100, measure10);
      expect(out).toEqual(["hello", "world"]);
    });
    it("returns [] for empty text", () => {
      expect(wrapWords("", 100, measure10)).toEqual([]);
    });
    it("does not infinite-loop on a single word wider than maxWidth", () => {
      const out = wrapWords("supercalifragilistic", 50, measure10);
      expect(out.length).toBeGreaterThan(0); // accepts overflow rather than dropping
    });
  });

  describe("layoutCaption", () => {
    const measureFactor = (s, size) => s.length * size * 0.6; // rough proxy

    it("returns base size when text fits in one line", () => {
      const { lines, fontSizePx } = layoutCaption({
        text: "శిఖరం",
        baseSizePx: 56,
        maxWidth: 1000,
        measure: measureFactor,
      });
      expect(lines).toEqual(["శిఖరం"]);
      expect(fontSizePx).toBe(56);
    });

    it("shrinks the font when the text needs more lines than allowed", () => {
      const long = "ఆరంభం యాదాద్రి కొండ దిగువన మెల్లగా";
      const { fontSizePx } = layoutCaption({
        text: long,
        baseSizePx: 56,
        minSizePx: 24,
        maxWidth: 200,
        maxLines: 2,
        measure: measureFactor,
      });
      expect(fontSizePx).toBeLessThan(56);
      expect(fontSizePx).toBeGreaterThanOrEqual(24);
    });

    it("never drops below minSizePx", () => {
      const { fontSizePx } = layoutCaption({
        text: "a b c d e f g h i j k l m n o p q r s t u v w x y z",
        baseSizePx: 56,
        minSizePx: 22,
        maxWidth: 50,
        maxLines: 2,
        measure: measureFactor,
      });
      expect(fontSizePx).toBeGreaterThanOrEqual(22);
    });

    it("throws without a measurer", () => {
      expect(() => layoutCaption({ text: "x", baseSizePx: 28, maxWidth: 100 })).toThrow();
    });
  });

  describe("captionOpacity", () => {
    it("returns 1 when well inside the scene", () => {
      expect(captionOpacity({ tInScene: 0.5, fadeInMs: 200, fadeOutMs: 200, sceneDurationMs: 3000 })).toBe(1);
    });
    it("ramps up during fade-in", () => {
      const a = captionOpacity({ tInScene: 0.02, fadeInMs: 800, fadeOutMs: 800, sceneDurationMs: 3000 });
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThan(1);
    });
    it("ramps down during fade-out", () => {
      const a = captionOpacity({ tInScene: 0.98, fadeInMs: 800, fadeOutMs: 800, sceneDurationMs: 3000 });
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThan(1);
    });
    it("returns 0 when scene has zero duration", () => {
      expect(captionOpacity({ tInScene: 0.5, fadeInMs: 200, fadeOutMs: 200, sceneDurationMs: 0 })).toBe(0);
    });
  });

  describe("drawCaption", () => {
    function fakeCtx({ width = 720, height = 1280 } = {}) {
      const calls = { fillText: [], fillRect: [], roundRect: 0, fillStyles: [], fonts: [] };
      const ctx = {
        canvas: { width, height },
        font: "",
        fillStyle: "",
        textBaseline: "",
        textAlign: "",
        globalAlpha: 1,
        save() {},
        restore() {},
        beginPath() {},
        fill() {},
        roundRect() { calls.roundRect++; },
        fillRect(...args) { calls.fillRect.push(args); },
        fillText(text, x, y) { calls.fillText.push({ text, x, y, font: this.font, alpha: this.globalAlpha }); },
        measureText(s) { return { width: s.length * 14 }; },
      };
      return { ctx, calls };
    }

    it("draws each layout line at the lower-third of the canvas", () => {
      const { ctx, calls } = fakeCtx();
      const scene = { tStart: 0, tEnd: 4, captionText: "శిఖరం", captionStyle: "headline" };
      drawCaption(ctx, { scene, palette: devotional, language: "te" });
      expect(calls.fillText.length).toBeGreaterThan(0);
      // Lines should be in the lower half of the frame.
      for (const c of calls.fillText) {
        expect(c.y).toBeGreaterThan(640);
        expect(c.y).toBeLessThan(1280 - DEFAULT_INSETS_9x16.bottom + 100);
      }
    });

    it("uses the Telugu typeface for te language", () => {
      const { ctx, calls } = fakeCtx();
      const scene = { tStart: 0, tEnd: 4, captionText: "శిఖరం", captionStyle: "subtitle" };
      drawCaption(ctx, { scene, palette: devotional, language: "te" });
      expect(calls.fillText[0].font).toMatch(/Mandali|Hind Guntur/);
    });

    it("noop when scene has no captionText", () => {
      const { ctx, calls } = fakeCtx();
      drawCaption(ctx, {
        scene: { tStart: 0, tEnd: 4, captionText: "", captionStyle: "subtitle" },
        palette: devotional,
        language: "en",
      });
      expect(calls.fillText.length).toBe(0);
    });

    it("rejects unsupported languages", () => {
      const { ctx } = fakeCtx();
      const scene = { tStart: 0, tEnd: 4, captionText: "x", captionStyle: "subtitle" };
      expect(() =>
        drawCaption(ctx, { scene, palette: devotional, language: "??" }),
      ).toThrow(/unsupported/);
    });

    it("rejects non-2d-canvas context", () => {
      expect(() =>
        drawCaption({}, {
          scene: { tStart: 0, tEnd: 4, captionText: "x" },
          palette: devotional,
          language: "en",
        }),
      ).toThrow();
    });
  });
});
