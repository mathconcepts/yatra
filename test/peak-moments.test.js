import { describe, it, expect } from "vitest";
import {
  landmarkToT,
  steepestClimbIndex,
  longestStretchIndex,
  detectPeakMoments,
} from "../src/services/peakMoments";

const wps = [
  { lat: 0, lon: 0, elev: 100 },
  { lat: 1, lon: 0, elev: 150 },
  { lat: 2, lon: 0, elev: 800 }, // steep gain
  { lat: 3, lon: 0, elev: 850 },
  { lat: 5, lon: 0, elev: 870 }, // longest stretch (2 deg)
];

describe("landmarkToT", () => {
  it("returns null for invalid input", () => {
    expect(landmarkToT(null, wps)).toBe(null);
    expect(landmarkToT({ lat: 1, lon: 0 }, [])).toBe(null);
  });
  it("maps a landmark near a waypoint to its t", () => {
    const t = landmarkToT({ lat: 2, lon: 0 }, wps);
    expect(t).toBeCloseTo(0.5, 1);
  });
  it("maps the start landmark to t=0", () => {
    expect(landmarkToT({ lat: 0, lon: 0 }, wps)).toBe(0);
  });
});

describe("steepestClimbIndex", () => {
  it("returns -1 for short routes", () => {
    expect(steepestClimbIndex([])).toBe(-1);
    expect(steepestClimbIndex([{ lat: 0, lon: 0, elev: 0 }])).toBe(-1);
  });
  it("finds the steepest 100m+ segment", () => {
    expect(steepestClimbIndex(wps)).toBe(2); // 150 → 800
  });
  it("returns -1 when no segment qualifies", () => {
    const flat = [
      { lat: 0, lon: 0, elev: 100 },
      { lat: 1, lon: 0, elev: 110 },
      { lat: 2, lon: 0, elev: 120 },
    ];
    expect(steepestClimbIndex(flat)).toBe(-1);
  });
});

describe("longestStretchIndex", () => {
  it("returns -1 for empty input", () => {
    expect(longestStretchIndex([])).toBe(-1);
  });
  it("finds the longest segment", () => {
    expect(longestStretchIndex(wps)).toBe(4); // 3 → 5 lat = 2 degrees
  });
});

describe("detectPeakMoments", () => {
  const config = {
    origin: { name: "Start", lat: 0, lon: 0 },
    destination: { name: "End", lat: 5, lon: 0 },
    landmarks: [{ id: "x", name: "Mid", lat: 2, lon: 0, type: "milestone" }],
    routes: [{ waypoints: wps }],
  };

  it("returns [] for missing config", () => {
    expect(detectPeakMoments(null)).toEqual([]);
    expect(detectPeakMoments({})).toEqual([]);
  });

  it("returns [] for routes with < 2 waypoints", () => {
    expect(detectPeakMoments({ routes: [{ waypoints: [{ lat: 0, lon: 0 }] }] })).toEqual([]);
  });

  it("emits origin, landmarks, peaks, and destination, sorted by t", () => {
    const out = detectPeakMoments(config);
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out[0].kind).toBe("origin");
    expect(out[out.length - 1].kind).toBe("destination");
    const ts = out.map((c) => c.t);
    for (let i = 1; i < ts.length; i++) expect(ts[i]).toBeGreaterThanOrEqual(ts[i - 1]);
  });

  it("dedupes near-coincident chips (±2% t)", () => {
    const cfg = {
      ...config,
      landmarks: [
        { id: "a", name: "A", lat: 0, lon: 0 },
        { id: "b", name: "B", lat: 0, lon: 0 },
      ],
    };
    const out = detectPeakMoments(cfg);
    // Origin + 2 landmarks at the same place should not produce 3 adjacent chips
    const headCount = out.filter((c) => c.t < 0.05).length;
    expect(headCount).toBeLessThanOrEqual(1);
  });
});
