/**
 * Tour-mode script request builder + tour-aware peakMoments.
 *
 * Pins the new Yatra v1.8 "tour" flow end-to-end at the data layer:
 *   resolveTourPois        — ids → ordered landmarks
 *   normalizeCoverage      — weights → normalized map
 *   buildTourPeakMoments   — POIs + weights + duration → chip array
 *   buildTourScriptRequest — config + selection → /v1/script body
 */

import { describe, it, expect } from "vitest";
import {
  resolveTourPois,
  normalizeCoverage,
  buildTourPeakMoments,
  buildTourScriptRequest,
} from "../src/services/tourScript.js";

const CONFIG = {
  id: "srirangam",
  title: "Srirangam",
  origin: { name: "Srirangam", lat: 10.86, lon: 78.69, elev: 78 },
  destination: { name: "Trichy", lat: 10.83, lon: 78.69, elev: 95 },
  routes: [{ id: "r1", name: "R", color: "#000", difficulty: "Easy", stats: {}, waypoints: [
    { lat: 10.86, lon: 78.69, elev: 78 },
    { lat: 10.83, lon: 78.69, elev: 95 },
  ]}],
  landmarks: [
    { id: "ranganatha", name: "Ranganathaswamy", lat: 10.86, lon: 78.69, elev: 78,
      blurb: "Largest functioning temple",
      subTemplate: { curatedFacts: ["156 acres", "21 gopurams"], narrationHint: "Open inside the prakarams." } },
    { id: "jambu",     name: "Jambukeshwarar",  lat: 10.85, lon: 78.71, elev: 80,
      blurb: "Water-element temple",
      subTemplate: { curatedFacts: ["Pancha Bhuta water temple", "spring under the lingam"] } },
    { id: "amma",      name: "Amma Mandapam",   lat: 10.86, lon: 78.69, elev: 77,
      blurb: "Bathing ghat" },
  ],
  tours: [
    { id: "two-temples",  name: "Two temples", pois: ["ranganatha", "jambu"] },
    { id: "all-three",    name: "All three",   pois: ["ranganatha", "amma", "jambu"] },
    { id: "with-missing", name: "Skips bad ids", pois: ["ranganatha", "does-not-exist", "jambu"] },
  ],
};

describe("resolveTourPois", () => {
  it("returns matching landmarks in tour order", () => {
    const out = resolveTourPois(CONFIG, "two-temples");
    expect(out.map((p) => p.id)).toEqual(["ranganatha", "jambu"]);
  });

  it("silently drops landmark ids that don't exist", () => {
    const out = resolveTourPois(CONFIG, "with-missing");
    expect(out.map((p) => p.id)).toEqual(["ranganatha", "jambu"]);
  });

  it("returns [] for unknown tour id", () => {
    expect(resolveTourPois(CONFIG, "nope")).toEqual([]);
  });

  it("returns [] when config has no tours", () => {
    expect(resolveTourPois({ ...CONFIG, tours: undefined }, "x")).toEqual([]);
    expect(resolveTourPois(null, "x")).toEqual([]);
  });
});

describe("normalizeCoverage", () => {
  const pois = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it('"equal" → even split', () => {
    const m = normalizeCoverage(pois, "equal");
    expect(m.get("a")).toBeCloseTo(1 / 3);
    expect(m.get("b")).toBeCloseTo(1 / 3);
    expect(m.get("c")).toBeCloseTo(1 / 3);
  });

  it("undefined → equal split", () => {
    const m = normalizeCoverage(pois);
    expect(m.get("a")).toBeCloseTo(1 / 3);
  });

  it('"single:b" → b gets 0.80, others share 0.20', () => {
    const m = normalizeCoverage(pois, "single:b");
    expect(m.get("b")).toBeCloseTo(0.80);
    expect(m.get("a")).toBeCloseTo(0.10);
    expect(m.get("c")).toBeCloseTo(0.10);
  });

  it('"single:" with unknown id falls back to equal', () => {
    const m = normalizeCoverage(pois, "single:nope");
    expect(m.get("a")).toBeCloseTo(1 / 3);
  });

  it("custom weights normalize to sum=1", () => {
    const m = normalizeCoverage(pois, { a: 7, b: 2, c: 1 });
    expect(m.get("a") + m.get("b") + m.get("c")).toBeCloseTo(1);
    expect(m.get("a")).toBeCloseTo(0.7);
  });

  it("all-zero custom weights fall back to equal", () => {
    const m = normalizeCoverage(pois, { a: 0, b: 0, c: 0 });
    expect(m.get("a")).toBeCloseTo(1 / 3);
  });

  it("empty POI list → empty map", () => {
    expect(normalizeCoverage([], "equal").size).toBe(0);
    expect(normalizeCoverage(null, "equal").size).toBe(0);
  });
});

describe("buildTourPeakMoments", () => {
  it("emits one chip per POI in order, with summed durations matching total", () => {
    const pois = resolveTourPois(CONFIG, "two-temples");
    const chips = buildTourPeakMoments({ pois, weights: "equal", totalDurationS: 30 });
    expect(chips).toHaveLength(2);
    expect(chips[0].kind).toBe("tour-stop");
    expect(chips[0].label).toBe("Ranganathaswamy");
    expect(chips[1].label).toBe("Jambukeshwarar");
    // ts are sorted-ish, monotonically non-decreasing
    expect(chips[1].t).toBeGreaterThanOrEqual(chips[0].t);
    // durations sum to total (within rounding)
    const sum = chips.reduce((a, c) => a + c.durationS, 0);
    expect(sum).toBeCloseTo(30, 0);
  });

  it("'single:' coverage gives focus POI 80% of duration", () => {
    const pois = resolveTourPois(CONFIG, "all-three");
    const chips = buildTourPeakMoments({ pois, weights: "single:jambu", totalDurationS: 30 });
    const jambu = chips.find((c) => c.poiId === "jambu");
    expect(jambu.durationS).toBeCloseTo(24, 0); // 0.8 * 30
  });

  it("returns [] when no pois", () => {
    expect(buildTourPeakMoments({ pois: [], totalDurationS: 30 })).toEqual([]);
  });

  it("durationS is at least 2s even for tiny slices", () => {
    const pois = resolveTourPois(CONFIG, "all-three");
    const chips = buildTourPeakMoments({ pois, weights: "single:ranganatha", totalDurationS: 30 });
    for (const c of chips) {
      expect(c.durationS).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("buildTourScriptRequest", () => {
  it("returns /v1/script body shape with mode='tour'", () => {
    const body = buildTourScriptRequest({
      config: CONFIG, tourId: "two-temples", tone: "devotional", language: "en",
      coverageWeights: "equal", totalDurationS: 30,
    });
    expect(body.mode).toBe("tour");
    expect(body.tourId).toBe("two-temples");
    expect(body.tourName).toBe("Two temples");
    expect(body.routeTitle).toBe("Srirangam — Two temples");
    expect(body.peakMoments).toHaveLength(2);
    expect(body.landmarks).toHaveLength(2);
    expect(body.totalDurationS).toBe(30);
    expect(body.waypointCount).toBe(0);
  });

  it("landmarks include curatedFacts when subTemplate provides them", () => {
    const body = buildTourScriptRequest({
      config: CONFIG, tourId: "two-temples", tone: "devotional", language: "en",
      coverageWeights: "equal", totalDurationS: 30,
    });
    const ranga = body.landmarks.find((l) => l.id === "ranganatha");
    expect(ranga.facts).toContain("156 acres");
    expect(ranga.narrationHint).toBe("Open inside the prakarams.");
  });

  it("landmarks fall back to blurb when no curatedFacts", () => {
    const body = buildTourScriptRequest({
      config: CONFIG, tourId: "all-three", tone: "devotional", language: "en",
      coverageWeights: "equal", totalDurationS: 30,
    });
    const amma = body.landmarks.find((l) => l.id === "amma");
    expect(amma.facts).toContain("Bathing ghat");
  });

  it("truncates personalContext to 500 chars", () => {
    const body = buildTourScriptRequest({
      config: CONFIG, tourId: "two-temples", tone: "devotional", language: "en",
      coverageWeights: "equal", totalDurationS: 30,
      personalContext: "x".repeat(900),
    });
    expect(body.personalContext.length).toBe(500);
  });

  it("respects the totalDurationS override", () => {
    const body = buildTourScriptRequest({
      config: CONFIG, tourId: "two-temples", tone: "devotional", language: "en",
      coverageWeights: "equal", totalDurationS: 90,
    });
    expect(body.totalDurationS).toBe(90);
    const sum = body.peakMoments.reduce((a, p) => a + p.durationS, 0);
    expect(sum).toBeCloseTo(90, 0);
  });
});
