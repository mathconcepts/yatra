import { describe, it, expect, vi } from "vitest";
import { composeFrame, findActiveScene, progressInScene } from "../src/services/sceneComposer.js";
import devotional from "../src/services/tonePalettes/devotional.js";

const scenes = [
  { id: "origin", tStart: 0, tEnd: 4.5, captionText: "ఆరంభం", captionStyle: "headline" },
  { id: "approach", tStart: 4.5, tEnd: 11, captionText: "మెల్లగా", captionStyle: "subtitle" },
  { id: "summit", tStart: 11, tEnd: 18, captionText: "శిఖరం", captionStyle: "headline" },
];

function fakeCtx({ width = 720, height = 1280 } = {}) {
  const calls = { drawImage: 0, getImageData: 0, putImageData: 0, fillText: 0 };
  return {
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
    drawImage() { calls.drawImage++; },
    getImageData(_x, _y, w, h) {
      calls.getImageData++;
      return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
    },
    putImageData() { calls.putImageData++; },
    fillRect() {},
    roundRect() {},
    fillText() { calls.fillText++; },
    measureText(s) { return { width: s.length * 14 }; },
    __calls: calls,
  };
}

describe("sceneComposer", () => {
  describe("findActiveScene", () => {
    it("picks the scene containing t", () => {
      expect(findActiveScene(scenes, 0)?.id).toBe("origin");
      expect(findActiveScene(scenes, 4.4)?.id).toBe("origin");
      expect(findActiveScene(scenes, 4.5)?.id).toBe("approach");
      expect(findActiveScene(scenes, 10.99)?.id).toBe("approach");
      expect(findActiveScene(scenes, 15)?.id).toBe("summit");
    });
    it("holds the last scene past its tEnd", () => {
      expect(findActiveScene(scenes, 999)?.id).toBe("summit");
    });
    it("returns null for empty list", () => {
      expect(findActiveScene([], 0)).toBeNull();
      expect(findActiveScene(undefined, 0)).toBeNull();
    });
  });

  describe("progressInScene", () => {
    it("clamps below 0 to 0 and above 1 to 1", () => {
      expect(progressInScene(scenes[0], -10)).toBe(0);
      expect(progressInScene(scenes[0], 999)).toBe(1);
    });
    it("interpolates linearly inside the scene", () => {
      expect(progressInScene(scenes[0], 2.25)).toBeCloseTo(0.5);
    });
    it("returns 0 for null scene or zero duration", () => {
      expect(progressInScene(null, 1)).toBe(0);
      expect(progressInScene({ tStart: 1, tEnd: 1 }, 1)).toBe(0);
    });
  });

  describe("composeFrame", () => {
    it("draws the source frame, grades, and burns a caption", () => {
      const ctx = fakeCtx();
      const scene = composeFrame(ctx, {
        sourceFrame: { width: 720, height: 1280 },
        scenes,
        tSeconds: 2,
        palette: devotional,
        language: "te",
      });
      expect(scene?.id).toBe("origin");
      expect(ctx.__calls.drawImage).toBe(1);
      // Grade pass: getImageData + putImageData
      expect(ctx.__calls.getImageData).toBe(1);
      expect(ctx.__calls.putImageData).toBe(1);
      // Caption: at least one fillText
      expect(ctx.__calls.fillText).toBeGreaterThan(0);
    });

    it("skipGrade option bypasses the color pass", () => {
      const ctx = fakeCtx();
      composeFrame(ctx, {
        sourceFrame: { width: 720, height: 1280 },
        scenes,
        tSeconds: 2,
        palette: devotional,
        language: "te",
        options: { skipGrade: true },
      });
      expect(ctx.__calls.getImageData).toBe(0);
      expect(ctx.__calls.putImageData).toBe(0);
    });

    it("skipCaption option bypasses the caption pass", () => {
      const ctx = fakeCtx();
      composeFrame(ctx, {
        sourceFrame: { width: 720, height: 1280 },
        scenes,
        tSeconds: 2,
        palette: devotional,
        language: "te",
        options: { skipCaption: true },
      });
      expect(ctx.__calls.fillText).toBe(0);
    });

    it("works without a source frame (caption-only postcard mode)", () => {
      const ctx = fakeCtx();
      const scene = composeFrame(ctx, {
        sourceFrame: null,
        scenes,
        tSeconds: 0.5,
        palette: devotional,
        language: "te",
        options: { skipGrade: true },
      });
      expect(scene?.id).toBe("origin");
      expect(ctx.__calls.drawImage).toBe(0);
      expect(ctx.__calls.fillText).toBeGreaterThan(0);
    });

    it("returns null scene when scenes list is empty", () => {
      const ctx = fakeCtx();
      const out = composeFrame(ctx, {
        sourceFrame: { width: 720, height: 1280 },
        scenes: [],
        tSeconds: 0,
        palette: devotional,
        language: "en",
      });
      expect(out).toBeNull();
    });

    it("rejects missing palette or language", () => {
      const ctx = fakeCtx();
      expect(() =>
        composeFrame(ctx, { sourceFrame: null, scenes, tSeconds: 0, language: "en" }),
      ).toThrow(/palette/);
      expect(() =>
        composeFrame(ctx, { sourceFrame: null, scenes, tSeconds: 0, palette: devotional }),
      ).toThrow(/language/);
    });

    it("rejects non-2d-canvas context", () => {
      expect(() =>
        composeFrame({}, { sourceFrame: null, scenes, tSeconds: 0, palette: devotional, language: "en" }),
      ).toThrow();
    });
  });
});
