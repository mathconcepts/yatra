import { describe, it, expect } from "vitest";
import { applyCameraMode, CAMERA_MODES, isValidMode } from "../src/services/cameraModes";

const baseCam = { center: [0, 0], zoom: 12, pitch: 45, bearing: -20 };

describe("CAMERA_MODES + isValidMode", () => {
  it("exposes the four modes", () => {
    expect(CAMERA_MODES).toEqual(["default", "birdseye", "chase", "orbit"]);
  });
  it("rejects unknown modes", () => {
    expect(isValidMode("default")).toBe(true);
    expect(isValidMode("orbit")).toBe(true);
    expect(isValidMode("dollyzoom")).toBe(false);
  });
});

describe("applyCameraMode", () => {
  it("passes through null/undefined", () => {
    expect(applyCameraMode(null)).toBe(null);
  });

  it("default mode is passthrough", () => {
    const out = applyCameraMode(baseCam, { mode: "default" });
    expect(out).toEqual(baseCam);
  });

  it("unknown mode falls back to passthrough", () => {
    const out = applyCameraMode(baseCam, { mode: "wat" });
    expect(out).toEqual(baseCam);
  });

  it("birdseye flattens pitch and widens zoom", () => {
    const out = applyCameraMode(baseCam, { mode: "birdseye", baseZoom: 12 });
    expect(out.pitch).toBe(0);
    expect(out.zoom).toBeLessThan(12);
    expect(out.bearing).toBe(0);
  });

  it("chase steepens pitch and tightens zoom", () => {
    const out = applyCameraMode(baseCam, { mode: "chase", baseZoom: 12 });
    expect(out.pitch).toBeGreaterThan(60);
    expect(out.zoom).toBeGreaterThan(12);
  });

  it("orbit rotates bearing with t", () => {
    const a = applyCameraMode(baseCam, { mode: "orbit", t: 0 });
    const b = applyCameraMode(baseCam, { mode: "orbit", t: 0.5 });
    expect(a.bearing).not.toBe(b.bearing);
  });

  it("orbit clamps t to [0,1]", () => {
    const a = applyCameraMode(baseCam, { mode: "orbit", t: 2 });
    const b = applyCameraMode(baseCam, { mode: "orbit", t: 1 });
    expect(a.bearing).toBe(b.bearing);
  });

  it("birdseye clamps zoom floor", () => {
    const out = applyCameraMode(baseCam, { mode: "birdseye", baseZoom: 5 });
    expect(out.zoom).toBeGreaterThanOrEqual(4);
  });
});
