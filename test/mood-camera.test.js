import { describe, it, expect } from "vitest";
import {
  clamp,
  profileStats,
  localSlope,
  terrainHeuristic,
  railHeuristic,
  planCamera,
  sampleCameraPlan,
  RAIL_FEATURE_TYPES,
} from "../src/services/moodCamera";

// Four golden elevation profiles
const FLAT = [
  { lat: 13.0, lon: 79.0, elev: 100 },
  { lat: 13.05, lon: 79.05, elev: 105 },
  { lat: 13.1, lon: 79.1, elev: 100 },
];

const STEEP = [
  { lat: 13.0, lon: 79.0, elev: 100 },
  { lat: 13.02, lon: 79.02, elev: 700 },
  { lat: 13.04, lon: 79.04, elev: 1500 },
];

const ROLLING = [
  { lat: 13.0, lon: 79.0, elev: 200 },
  { lat: 13.05, lon: 79.05, elev: 350 },
  { lat: 13.10, lon: 79.10, elev: 220 },
  { lat: 13.15, lon: 79.15, elev: 400 },
];

const DEGENERATE = [{ lat: 13.0, lon: 79.0, elev: 100 }]; // only 1 waypoint

describe("clamp", () => {
  it("clamps within range", () => { expect(clamp(5, 0, 10)).toBe(5); });
  it("clamps below", () => { expect(clamp(-5, 0, 10)).toBe(0); });
  it("clamps above", () => { expect(clamp(50, 0, 10)).toBe(10); });
});

describe("profileStats", () => {
  it("sums positive elevation gain only", () => {
    const { gain } = profileStats(FLAT);
    expect(gain).toBeCloseTo(5, 0);
  });
  it("reports steep gain", () => {
    const { gain } = profileStats(STEEP);
    expect(gain).toBe(1400);
  });
  it("reports kilometres travelled", () => {
    const { totalKm } = profileStats(FLAT);
    expect(totalKm).toBeGreaterThan(0);
    expect(totalKm).toBeLessThan(30);
  });
});

describe("localSlope", () => {
  it("is small on the flat profile", () => {
    expect(localSlope(FLAT, 0.5)).toBeLessThan(0.05);
  });
  it("is large on the steep profile mid-route", () => {
    expect(localSlope(STEEP, 0.5)).toBeGreaterThan(0.05);
  });
});

describe("terrainHeuristic", () => {
  it("returns 8 steps for any valid route", () => {
    expect(terrainHeuristic({ waypoints: FLAT })).toHaveLength(8);
    expect(terrainHeuristic({ waypoints: STEEP })).toHaveLength(8);
    expect(terrainHeuristic({ waypoints: ROLLING })).toHaveLength(8);
  });
  it("returns empty for degenerate route", () => {
    expect(terrainHeuristic({ waypoints: DEGENERATE })).toEqual([]);
  });
  it("flat profile produces low-pitch steps", () => {
    const plan = terrainHeuristic({ waypoints: FLAT });
    for (const s of plan) {
      expect(s.pitch).toBeGreaterThanOrEqual(25);
      expect(s.pitch).toBeLessThanOrEqual(60);
    }
    // No step on a flat profile should hit the max pitch
    const max = Math.max(...plan.map(s => s.pitch));
    expect(max).toBeLessThan(50);
  });
  it("steep profile produces higher-pitch steps somewhere", () => {
    const flatPlan = terrainHeuristic({ waypoints: FLAT });
    const steepPlan = terrainHeuristic({ waypoints: STEEP });
    const flatMaxPitch = Math.max(...flatPlan.map(s => s.pitch));
    const steepMaxPitch = Math.max(...steepPlan.map(s => s.pitch));
    expect(steepMaxPitch).toBeGreaterThan(flatMaxPitch);
  });
  it("every step has t, zoom, pitch, bearing", () => {
    const plan = terrainHeuristic({ waypoints: ROLLING });
    for (const s of plan) {
      expect(typeof s.t).toBe("number");
      expect(typeof s.zoom).toBe("number");
      expect(typeof s.pitch).toBe("number");
      expect(typeof s.bearing).toBe("number");
      expect(s.t).toBeGreaterThanOrEqual(0);
      expect(s.t).toBeLessThanOrEqual(1);
    }
  });
});

describe("railHeuristic", () => {
  const RAIL_ROUTE = {
    waypoints: [
      { lat: 19.0, lon: 72.9, elev: 14 },
      { lat: 15.5, lon: 73.5, elev: 50 },
      { lat: 12.9, lon: 74.8, elev: 22 },
    ],
  };

  it("returns 10 steps for any valid route", () => {
    expect(railHeuristic(RAIL_ROUTE, [])).toHaveLength(10);
  });
  it("uses lower-pitch baseline than terrain", () => {
    const noLandmarks = railHeuristic(RAIL_ROUTE, []);
    expect(Math.max(...noLandmarks.map(s => s.pitch))).toBeLessThanOrEqual(50);
  });
  it("dense rail-features increase pitch + add holds", () => {
    // Park six rail features tightly around the route's midpoint so the
    // 10 km proximity check actually hits at high t-density.
    const dense = Array.from({ length: 6 }, (_, i) => ({
      id: `b${i}`, name: `Bridge ${i}`, type: "bridge",
      lat: 15.5 + (i - 3) * 0.02, lon: 73.5 + (i - 3) * 0.02, elev: 30, blurb: "",
    }));
    const planDense = railHeuristic(RAIL_ROUTE, dense);
    const planEmpty = railHeuristic(RAIL_ROUTE, []);
    const denseMax = Math.max(...planDense.map(s => s.pitch));
    const emptyMax = Math.max(...planEmpty.map(s => s.pitch));
    expect(denseMax).toBeGreaterThan(emptyMax);
    expect(planDense.some(s => s.holdMs && s.holdMs > 0)).toBe(true);
  });
  it("ignores non-rail landmark types for density", () => {
    const irrelevant = [{ id: "g", name: "Gate", type: "gateway", lat: 19.0, lon: 72.9, elev: 14, blurb: "" }];
    expect(RAIL_FEATURE_TYPES).not.toContain("gateway");
    const planA = railHeuristic(RAIL_ROUTE, irrelevant);
    const planB = railHeuristic(RAIL_ROUTE, []);
    expect(planA[0].pitch).toBeCloseTo(planB[0].pitch, 5);
  });
});

describe("planCamera (strategy router)", () => {
  const FOOT_CONFIG = { routes: [{ waypoints: FLAT }], landmarks: [] };
  const RAIL_CONFIG = { mode: "rail", routes: [{ waypoints: FLAT }], landmarks: [] };
  const EXPLICIT_CONFIG = { cameraStrategy: "rail", routes: [{ waypoints: FLAT }], landmarks: [] };
  const BAKED = [{ t: 0, zoom: 12, pitch: 40, bearing: 0 }];

  it("returns baked cameraPlan verbatim if present", () => {
    expect(planCamera({ cameraPlan: BAKED })).toBe(BAKED);
  });
  it("picks terrain for foot/road config", () => {
    const plan = planCamera(FOOT_CONFIG);
    expect(plan.length).toBe(8);
  });
  it("picks rail for mode=rail config", () => {
    const plan = planCamera(RAIL_CONFIG);
    expect(plan.length).toBe(10);
  });
  it("explicit cameraStrategy overrides mode", () => {
    const plan = planCamera(EXPLICIT_CONFIG);
    expect(plan.length).toBe(10);
  });
  it("returns empty for config with no routes", () => {
    expect(planCamera({})).toEqual([]);
  });
});

describe("sampleCameraPlan", () => {
  const PLAN = [
    { t: 0,   zoom: 10, pitch: 30, bearing:   0 },
    { t: 0.5, zoom: 12, pitch: 50, bearing:  90 },
    { t: 1,   zoom: 14, pitch: 60, bearing: 180 },
  ];

  it("returns first step at t=0", () => {
    expect(sampleCameraPlan(PLAN, 0)).toEqual(PLAN[0]);
  });
  it("returns last step at t=1", () => {
    expect(sampleCameraPlan(PLAN, 1)).toEqual(PLAN[2]);
  });
  it("interpolates linearly mid-segment", () => {
    const s = sampleCameraPlan(PLAN, 0.25);
    expect(s.zoom).toBeCloseTo(11, 5);
    expect(s.pitch).toBeCloseTo(40, 5);
    expect(s.bearing).toBeCloseTo(45, 5);
  });
  it("clamps below first step", () => {
    expect(sampleCameraPlan(PLAN, -1)).toEqual(PLAN[0]);
  });
  it("clamps above last step", () => {
    expect(sampleCameraPlan(PLAN, 2)).toEqual(PLAN[2]);
  });
  it("returns null for empty plan", () => {
    expect(sampleCameraPlan([], 0.5)).toBe(null);
  });
});
