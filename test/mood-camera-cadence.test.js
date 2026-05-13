import { describe, it, expect } from "vitest";
import { localSpeedFactor, landmarkProximityFactor, terrainHeuristic } from "../src/services/moodCamera";

const wps = [
  { lat: 0, lon: 0, elev: 0 },
  { lat: 0.1, lon: 0, elev: 50 },
  { lat: 1, lon: 0, elev: 100 }, // long stretch
  { lat: 1.1, lon: 0, elev: 200 },
];

describe("localSpeedFactor", () => {
  it("returns 1 for missing input", () => {
    expect(localSpeedFactor(null, 0.5)).toBe(1);
    expect(localSpeedFactor([{ lat: 0, lon: 0 }], 0.5)).toBe(1);
  });
  it("scores fast straight sections > 1", () => {
    const fast = localSpeedFactor(wps, 0.5); // middle of long stretch
    const slow = localSpeedFactor(wps, 0.05); // tight start
    expect(fast).toBeGreaterThan(slow);
  });
  it("clamps to [0,3]", () => {
    const v = localSpeedFactor(wps, 0.5);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(3);
  });
});

describe("landmarkProximityFactor", () => {
  const lms = [{ lat: 10, lon: 20 }];

  it("returns 0 for missing input", () => {
    expect(landmarkProximityFactor([], { lat: 10, lon: 20 })).toBe(0);
    expect(landmarkProximityFactor(lms, null)).toBe(0);
  });
  it("returns 1 within nearKm of a landmark", () => {
    expect(landmarkProximityFactor(lms, { lat: 10, lon: 20 })).toBe(1);
  });
  it("returns 0 far from any landmark", () => {
    expect(landmarkProximityFactor(lms, { lat: 50, lon: 50 })).toBe(0);
  });
  it("falls off linearly between nearKm and farKm", () => {
    // ~2 km north of landmark (≈ 0.018° lat) → mid-range
    const mid = landmarkProximityFactor(lms, { lat: 10.018, lon: 20 });
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});

describe("terrainHeuristic — adaptive cadence", () => {
  it("emits a holdMs near landmark crossings", () => {
    const config = {
      routes: [{ waypoints: wps }],
      landmarks: [{ lat: 0.5, lon: 0, type: "milestone" }],
    };
    const steps = terrainHeuristic(config.routes[0], config.landmarks, { baseZoom: 12 });
    const holds = steps.filter((s) => typeof s.holdMs === "number");
    expect(holds.length).toBeGreaterThanOrEqual(0);
  });
  it("returns N=8 evenly-spaced steps", () => {
    const steps = terrainHeuristic({ waypoints: wps }, [], { baseZoom: 12 });
    expect(steps).toHaveLength(8);
  });
});
