import { describe, it, expect, vi } from "vitest";
import { cameraForT, wrapCaptureWithDirector } from "../src/services/reelRenderer";
import devotional from "../src/services/tonePalettes/devotional.js";

const fixtureConfig = {
  id: "test",
  bounds: { latMin: 0, latMax: 1, lonMin: 0, lonMax: 1 },
  topography: { zoom: 12, pitch: 50, bearing: 0, terrainExaggeration: 1.3 },
  routes: [{
    id: "r1",
    waypoints: [
      { lat: 0, lon: 0, elev: 0 },
      { lat: 0.5, lon: 0.5, elev: 100 },
      { lat: 1, lon: 1, elev: 0 },
    ],
  }],
  landmarks: [],
};

describe("cameraForT", () => {
  it("returns null for missing config", () => {
    expect(cameraForT(null, 0.5)).toBe(null);
  });
  it("returns null when route is missing", () => {
    expect(cameraForT({ routes: [] }, 0.5)).toBe(null);
  });
  it("returns null when waypoints are insufficient", () => {
    const cfg = { ...fixtureConfig, routes: [{ id: "x", waypoints: [{ lat: 0, lon: 0 }] }] };
    expect(cameraForT(cfg, 0.5)).toBe(null);
  });
  it("returns a sane camera at t=0", () => {
    const cam = cameraForT(fixtureConfig, 0);
    expect(cam).not.toBe(null);
    expect(cam.center[0]).toBeCloseTo(0, 5);
    expect(cam.center[1]).toBeCloseTo(0, 5);
    expect(cam.zoom).toBeGreaterThan(0);
    expect(typeof cam.pitch).toBe("number");
    expect(typeof cam.bearing).toBe("number");
  });
  it("returns a different camera at t=1 (end of route)", () => {
    const cam = cameraForT(fixtureConfig, 1);
    expect(cam).not.toBe(null);
    expect(cam.center[0]).toBeCloseTo(1, 5);
    expect(cam.center[1]).toBeCloseTo(1, 5);
  });
  it("interpolates center between waypoints at t=0.5", () => {
    const cam = cameraForT(fixtureConfig, 0.5);
    expect(cam.center[0]).toBeCloseTo(0.5, 2);
    expect(cam.center[1]).toBeCloseTo(0.5, 2);
  });
});

describe("wrapCaptureWithDirector", () => {
  const scenes = [
    { id: "a", tStart: 0, tEnd: 5, captionText: "ఆరంభం", captionStyle: "headline" },
    { id: "b", tStart: 5, tEnd: 10, captionText: "శిఖరం", captionStyle: "subtitle" },
  ];

  function makeDeps({ width = 720, height = 1280 } = {}) {
    const calls = { ctxFactory: 0, getContext: 0, drawImage: 0, fillText: 0, getImageData: 0, putImageData: 0, bitmaps: [] };
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
    };
    const createCanvas = vi.fn((w, h) => ({
      width: w,
      height: h,
      getContext: vi.fn(() => { calls.getContext++; return ctx; }),
    }));
    const createBitmap = vi.fn(async (src) => {
      const bm = { __fakeBitmap: true, src };
      calls.bitmaps.push(bm);
      return bm;
    });
    return { createCanvas, createBitmap, calls };
  }

  it("returns a wrapped function that drives the composer per frame", async () => {
    const { createCanvas, createBitmap, calls } = makeDeps();
    const rawCapture = vi.fn(async (t) => ({ __fakeSourceBitmap: true, t }));
    const wrapped = wrapCaptureWithDirector(rawCapture, {
      scenes,
      palette: devotional,
      language: "te",
      durationS: 10,
      createCanvas,
      createBitmap,
    });
    const out = await wrapped(0.2); // t=0.2 → tSeconds=2 → scene "a"
    expect(rawCapture).toHaveBeenCalledWith(0.2);
    expect(calls.drawImage).toBe(1);
    expect(calls.getImageData).toBe(1); // color grade ran (warm LUT is not identity)
    expect(calls.fillText).toBeGreaterThan(0); // caption burned
    expect(createBitmap).toHaveBeenCalledTimes(1);
    expect(out.__fakeBitmap).toBe(true);
  });

  it("reuses the same working canvas across captures", async () => {
    const { createCanvas, createBitmap } = makeDeps();
    const rawCapture = vi.fn(async () => ({}));
    const wrapped = wrapCaptureWithDirector(rawCapture, {
      scenes,
      palette: devotional,
      language: "te",
      durationS: 10,
      createCanvas,
      createBitmap,
    });
    await wrapped(0.1);
    await wrapped(0.5);
    await wrapped(0.9);
    expect(createCanvas).toHaveBeenCalledTimes(1); // canvas is shared
    expect(createBitmap).toHaveBeenCalledTimes(3);
  });

  it("maps t -> tSeconds using durationS and clamps to [0,1]", async () => {
    const { createCanvas, createBitmap } = makeDeps();
    const composeFn = vi.fn();
    const rawCapture = vi.fn(async () => ({}));
    const wrapped = wrapCaptureWithDirector(rawCapture, {
      scenes,
      palette: devotional,
      language: "te",
      durationS: 30,
      createCanvas,
      createBitmap,
      composeFn,
    });
    await wrapped(0);
    expect(composeFn.mock.calls[0][1].tSeconds).toBe(0);
    await wrapped(0.5);
    expect(composeFn.mock.calls[1][1].tSeconds).toBe(15);
    await wrapped(-0.1);
    expect(composeFn.mock.calls[2][1].tSeconds).toBe(0); // clamped
    await wrapped(1.5);
    expect(composeFn.mock.calls[3][1].tSeconds).toBe(30); // clamped
  });

  it("propagates raw capture errors", async () => {
    const { createCanvas, createBitmap } = makeDeps();
    const rawCapture = vi.fn(async () => { throw new Error("map idle timeout"); });
    const wrapped = wrapCaptureWithDirector(rawCapture, {
      scenes,
      palette: devotional,
      language: "te",
      durationS: 10,
      createCanvas,
      createBitmap,
    });
    await expect(wrapped(0.5)).rejects.toThrow(/idle timeout/);
  });

  it("rejects missing or malformed inputs", () => {
    const { createCanvas, createBitmap } = makeDeps();
    const rawCapture = async () => ({});
    expect(() => wrapCaptureWithDirector(null, { scenes, palette: devotional, language: "en", durationS: 10, createCanvas, createBitmap })).toThrow();
    expect(() => wrapCaptureWithDirector(rawCapture, { scenes, language: "en", durationS: 10, createCanvas, createBitmap })).toThrow(/palette/);
    expect(() => wrapCaptureWithDirector(rawCapture, { scenes, palette: devotional, durationS: 10, createCanvas, createBitmap })).toThrow(/language/);
    expect(() => wrapCaptureWithDirector(rawCapture, { scenes: null, palette: devotional, language: "en", durationS: 10, createCanvas, createBitmap })).toThrow(/scenes/);
    expect(() => wrapCaptureWithDirector(rawCapture, { scenes, palette: devotional, language: "en", durationS: 0, createCanvas, createBitmap })).toThrow(/durationS/);
    expect(() => wrapCaptureWithDirector(rawCapture, { scenes, palette: devotional, language: "en", durationS: 10, createBitmap })).toThrow(/createCanvas/);
    expect(() => wrapCaptureWithDirector(rawCapture, { scenes, palette: devotional, language: "en", durationS: 10, createCanvas })).toThrow(/createBitmap/);
  });
});
