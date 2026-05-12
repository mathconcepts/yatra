import { describe, it, expect } from "vitest";
import { cameraForT } from "../src/services/reelRenderer";

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
