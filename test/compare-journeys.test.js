import { describe, it, expect } from "vitest";
import { summarizeJourney, unionBounds, compareStats } from "../src/services/compareJourneys";

const cfgA = {
  title: "A",
  bounds: { latMin: 0, latMax: 1, lonMin: 0, lonMax: 1 },
  mode: "road",
  routes: [{
    color: "#f00",
    waypoints: [
      { lat: 0, lon: 0, elev: 0 },
      { lat: 0.5, lon: 0.5, elev: 100 },
      { lat: 1, lon: 1, elev: 50 },
    ],
  }],
  landmarks: [{ id: "l1" }, { id: "l2" }],
};

const cfgB = {
  title: "B",
  bounds: { latMin: 2, latMax: 3, lonMin: 2, lonMax: 3 },
  mode: "rail",
  routes: [{
    color: "#0f0",
    waypoints: [
      { lat: 2, lon: 2, elev: 100 },
      { lat: 3, lon: 3, elev: 500 },
    ],
  }],
  landmarks: [{ id: "x" }],
};

describe("summarizeJourney", () => {
  it("returns null for null input", () => {
    expect(summarizeJourney(null)).toBe(null);
  });
  it("computes distance, gain, counts", () => {
    const s = summarizeJourney(cfgA);
    expect(s.title).toBe("A");
    expect(s.distanceKm).toBeGreaterThan(0);
    expect(s.elevationGainM).toBe(100);
    expect(s.waypoints).toBe(3);
    expect(s.landmarks).toBe(2);
    expect(s.mode).toBe("road");
  });
});

describe("unionBounds", () => {
  it("returns null for empty input", () => {
    expect(unionBounds([])).toBe(null);
    expect(unionBounds([null])).toBe(null);
  });
  it("unions two bounds", () => {
    const u = unionBounds([cfgA, cfgB]);
    expect(u.latMin).toBe(0);
    expect(u.latMax).toBe(3);
    expect(u.lonMin).toBe(0);
    expect(u.lonMax).toBe(3);
  });
});

describe("compareStats", () => {
  it("returns null when either side missing", () => {
    expect(compareStats(null, cfgB)).toBe(null);
    expect(compareStats(cfgA, null)).toBe(null);
  });
  it("computes deltas B minus A", () => {
    const c = compareStats(cfgA, cfgB);
    expect(c.deltas.elevationGainM).toBeGreaterThan(0); // B has 400m gain, A has 100m
    expect(c.deltas.waypoints).toBe(-1);
    expect(c.deltas.landmarks).toBe(-1);
  });
});
