import { describe, it, expect } from "vitest";
import { LOCATIONS } from "../src/config";
import { RAIL_FEATURE_TYPES } from "../src/services/moodCamera";

const EXPECTED_IDS = [
  "tirupati-tirumala",
  "srirangam-trichy",
  "yadagirigutta",
  "konkan-railway",
];

describe("LOCATIONS registry", () => {
  it("registers all 4 v3.0 journeys", () => {
    expect(Object.keys(LOCATIONS)).toHaveLength(4);
    for (const id of EXPECTED_IDS) {
      expect(LOCATIONS[id]).toBeDefined();
    }
  });
});

describe.each(EXPECTED_IDS)("config: %s", (id) => {
  const cfg = LOCATIONS[id];

  it("has the required v1 fields", () => {
    expect(cfg.title).toBeTruthy();
    expect(cfg.bounds).toBeDefined();
    expect(cfg.bounds.latMin).toBeLessThan(cfg.bounds.latMax);
    expect(cfg.bounds.lonMin).toBeLessThan(cfg.bounds.lonMax);
    expect(cfg.origin).toBeDefined();
    expect(cfg.destination).toBeDefined();
  });

  it("has at least one route with at least 2 waypoints", () => {
    expect(Array.isArray(cfg.routes)).toBe(true);
    expect(cfg.routes.length).toBeGreaterThanOrEqual(1);
    for (const r of cfg.routes) {
      expect(r.id).toBeTruthy();
      expect(r.name).toBeTruthy();
      expect(Array.isArray(r.waypoints)).toBe(true);
      expect(r.waypoints.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("waypoints stay inside the declared bounds", () => {
    for (const r of cfg.routes) {
      for (const wp of r.waypoints) {
        expect(wp.lat).toBeGreaterThanOrEqual(cfg.bounds.latMin);
        expect(wp.lat).toBeLessThanOrEqual(cfg.bounds.latMax);
        expect(wp.lon).toBeGreaterThanOrEqual(cfg.bounds.lonMin);
        expect(wp.lon).toBeLessThanOrEqual(cfg.bounds.lonMax);
      }
    }
  });

  it("has region + culture metadata", () => {
    expect(cfg.region?.country).toBe("India");
    expect(cfg.region?.state).toBeTruthy();
    expect(cfg.culture?.accentColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(cfg.culture?.summary).toBeTruthy();
  });

  it("has at least one landmark", () => {
    expect(Array.isArray(cfg.landmarks)).toBe(true);
    expect(cfg.landmarks.length).toBeGreaterThanOrEqual(1);
    for (const lm of cfg.landmarks) {
      expect(lm.id).toBeTruthy();
      expect(lm.name).toBeTruthy();
      expect(typeof lm.blurb).toBe("string");
      expect(lm.blurb.length).toBeGreaterThan(20);
    }
  });
});

describe("rail-specific config: konkan-railway", () => {
  const cfg = LOCATIONS["konkan-railway"];

  it("declares rail mode", () => {
    expect(cfg.mode).toBe("rail");
  });

  it("opts in to the rail camera strategy", () => {
    expect(cfg.cameraStrategy).toBe("rail");
  });

  it("includes rail-feature landmark types for the camera heuristic", () => {
    const types = cfg.landmarks.map((l) => l.type);
    // At least one of the rail-feature types must appear so railHeuristic
    // sees density signal at Konkan's iconic crossings.
    const hasRailFeature = types.some((t) => RAIL_FEATURE_TYPES.includes(t));
    expect(hasRailFeature).toBe(true);
  });

  it("waypoints span Mumbai to Mangaluru", () => {
    const wps = cfg.routes[0].waypoints;
    expect(wps[0].lat).toBeGreaterThan(18.5);                // Mumbai-ish
    expect(wps[wps.length - 1].lat).toBeLessThan(13.5);      // Mangaluru-ish
  });
});

describe("hill-temple configs", () => {
  it("Srirangam stays at low elevation (river island)", () => {
    const wps = LOCATIONS["srirangam-trichy"].routes[0].waypoints;
    for (const wp of wps) expect(wp.elev).toBeLessThan(120);
  });

  it("Yadagirigutta gains elevation from base to summit", () => {
    const wps = LOCATIONS["yadagirigutta"].routes[0].waypoints;
    expect(wps[0].elev).toBeLessThan(wps[wps.length - 1].elev);
    expect(wps[wps.length - 1].elev - wps[0].elev).toBeGreaterThan(80);
  });
});
