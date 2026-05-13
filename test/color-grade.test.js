import { describe, it, expect } from "vitest";
import { applyLutToPixels, validateLut, isIdentity, IDENTITY_LUT, gradeCanvas } from "../src/services/colorGrade.js";

const identity = IDENTITY_LUT;
const warm = [
  [1.2, 0, 0, 0],
  [0, 1.0, 0, 0],
  [0, 0, 0.8, 0],
  [0, 0, 0, 1],
];
const desaturate = [
  [0.5, 0.5, 0.0, 0],
  [0.5, 0.5, 0.0, 0],
  [0.0, 0.0, 1.0, 0],
  [0.0, 0.0, 0.0, 1],
];

function rgba(r, g, b, a = 255) {
  return new Uint8ClampedArray([r, g, b, a]);
}

describe("colorGrade", () => {
  describe("validateLut", () => {
    it("accepts a valid 4x4 numeric matrix", () => {
      expect(validateLut(identity)).toBeNull();
      expect(validateLut(warm)).toBeNull();
    });
    it("rejects wrong shape", () => {
      expect(validateLut([])).toMatch(/4x4/);
      expect(validateLut([[1, 0, 0, 0]])).toMatch(/4x4/);
      expect(validateLut([[1, 0, 0]])).toMatch(/4x4/);
    });
    it("rejects non-numeric entries", () => {
      const bad = JSON.parse(JSON.stringify(identity));
      bad[1][2] = "x";
      expect(validateLut(bad)).toMatch(/finite/);
    });
  });

  describe("isIdentity", () => {
    it("returns true for the canonical identity", () => {
      expect(isIdentity(identity)).toBe(true);
    });
    it("returns false for a tinted matrix", () => {
      expect(isIdentity(warm)).toBe(false);
    });
  });

  describe("applyLutToPixels", () => {
    it("identity LUT leaves pixels untouched", () => {
      const px = rgba(50, 100, 150);
      const orig = new Uint8ClampedArray(px);
      applyLutToPixels(px, identity);
      expect(Array.from(px)).toEqual(Array.from(orig));
    });

    it("warm LUT boosts red and dampens blue", () => {
      const px = rgba(100, 100, 100);
      applyLutToPixels(px, warm);
      expect(px[0]).toBe(120); // 1.2 * 100
      expect(px[1]).toBe(100);
      expect(px[2]).toBe(80); // 0.8 * 100
      expect(px[3]).toBe(255);
    });

    it("clamps overflow to 255 and underflow to 0", () => {
      const overshoot = [
        [3, 0, 0, 0],
        [0, 3, 0, 0],
        [0, 0, 3, 0],
        [0, 0, 0, 1],
      ];
      const px = rgba(200, 200, 200);
      applyLutToPixels(px, overshoot);
      expect(px[0]).toBe(255);
      expect(px[1]).toBe(255);
      expect(px[2]).toBe(255);
    });

    it("desaturate LUT collapses R/G to their average", () => {
      const px = rgba(200, 0, 50);
      applyLutToPixels(px, desaturate);
      expect(px[0]).toBe(100); // 0.5 * 200 + 0.5 * 0
      expect(px[1]).toBe(100);
      expect(px[2]).toBe(50);
    });

    it("processes multiple pixels in one call", () => {
      const buf = new Uint8ClampedArray([100, 100, 100, 255, 50, 50, 50, 255]);
      applyLutToPixels(buf, warm);
      expect(buf[0]).toBe(120);
      expect(buf[2]).toBe(80);
      expect(buf[4]).toBe(60); // 1.2 * 50
      expect(buf[6]).toBe(40); // 0.8 * 50
    });

    it("throws on invalid LUT", () => {
      expect(() => applyLutToPixels(rgba(0, 0, 0), [])).toThrow();
    });
  });

  describe("gradeCanvas", () => {
    function fakeCtx(initialData) {
      const data = new Uint8ClampedArray(initialData);
      return {
        canvas: { width: 1, height: data.length / 4 },
        getImageData: (_x, _y, w, h) => ({ data, width: w, height: h }),
        putImageData: (img) => {
          // copy back so the test can inspect the mutation
          for (let i = 0; i < img.data.length; i++) data[i] = img.data[i];
        },
        __peek: () => data,
      };
    }

    it("identity fast-path is a no-op", () => {
      const ctx = fakeCtx([100, 100, 100, 255]);
      gradeCanvas(ctx, identity);
      expect(Array.from(ctx.__peek())).toEqual([100, 100, 100, 255]);
    });

    it("applies a real LUT through the canvas API", () => {
      const ctx = fakeCtx([100, 100, 100, 255]);
      gradeCanvas(ctx, warm);
      expect(ctx.__peek()[0]).toBe(120);
      expect(ctx.__peek()[2]).toBe(80);
    });

    it("missing/zero size canvas is a no-op (no throw)", () => {
      const ctx = {
        canvas: { width: 0, height: 0 },
        getImageData: () => { throw new Error("should not be called"); },
        putImageData: () => {},
      };
      expect(() => gradeCanvas(ctx, warm)).not.toThrow();
    });

    it("throws when ctx is wrong shape", () => {
      expect(() => gradeCanvas(null, identity)).toThrow();
      expect(() => gradeCanvas({}, identity)).toThrow();
    });

    it("falls back to identity LUT when none provided", () => {
      const ctx = {
        canvas: { width: 1, height: 1 },
        getImageData: () => { throw new Error("should not be called"); },
        putImageData: () => {},
      };
      expect(() => gradeCanvas(ctx, null)).not.toThrow();
      expect(() => gradeCanvas(ctx, undefined)).not.toThrow();
    });
  });
});
