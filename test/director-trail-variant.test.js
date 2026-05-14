/**
 * Regression: Director used to hard-code config.routes[0] in two
 * places (directorScript.buildScriptRequest and peakMoments.detectPeakMoments),
 * making Srivari Mettu unreachable. This file pins the new
 * routeVariantId-aware behavior.
 */

import { describe, it, expect } from "vitest";
import { buildScriptRequest } from "../src/services/directorScript.js";
import {
  detectPeakMoments,
  selectRouteVariant,
} from "../src/services/peakMoments.js";

// Realistic-shape config with two route variants. Waypoints kept short
// so we test routing, not geometry.
const TWO_TRAIL_CONFIG = {
  id: "tt",
  title: "Tirupati → Tirumala",
  origin: { name: "Tirupati", lat: 13.6288, lon: 79.4192, elev: 182 },
  destination: { name: "Tirumala", lat: 13.6833, lon: 79.3474, elev: 853 },
  routes: [
    {
      id: "alipiri",
      name: "Alipiri Mettu",
      stats: { distanceKm: 11, steps: 3550, durationHr: 4 },
      waypoints: [
        { lat: 13.6288, lon: 79.4192, elev: 182 },
        { lat: 13.6500, lon: 79.3900, elev: 500 },
        { lat: 13.6833, lon: 79.3474, elev: 853 },
      ],
    },
    {
      id: "srivari",
      name: "Srivari Mettu",
      stats: { distanceKm: 2.1, steps: 2388, durationHr: 1.8 },
      waypoints: [
        { lat: 13.6555, lon: 79.3380, elev: 500 },
        { lat: 13.6700, lon: 79.3420, elev: 720 },
        { lat: 13.6833, lon: 79.3474, elev: 853 },
      ],
    },
  ],
  landmarks: [
    // On Alipiri path
    { id: "alipiri-gate",   name: "Alipiri Gate",   lat: 13.6295, lon: 79.4180 },
    // On Srivari path
    { id: "srivari-trail",  name: "Srivari Trailhead", lat: 13.6560, lon: 79.3385 },
    // Far from both (should NOT appear)
    { id: "off-route",      name: "Off Route Hill", lat: 14.5,    lon: 80.0 },
  ],
};

describe("selectRouteVariant", () => {
  it("returns the matching variant by id", () => {
    expect(selectRouteVariant(TWO_TRAIL_CONFIG, "srivari").id).toBe("srivari");
  });

  it("falls back to routes[0] for unknown ids", () => {
    expect(selectRouteVariant(TWO_TRAIL_CONFIG, "nonexistent").id).toBe("alipiri");
  });

  it("returns routes[0] when no id is passed (back-compat)", () => {
    expect(selectRouteVariant(TWO_TRAIL_CONFIG).id).toBe("alipiri");
  });

  it("returns null when no routes exist", () => {
    expect(selectRouteVariant({ routes: [] })).toBe(null);
    expect(selectRouteVariant({})).toBe(null);
    expect(selectRouteVariant(null)).toBe(null);
  });
});

describe("detectPeakMoments respects routeVariantId", () => {
  it("uses the requested variant's waypoints", () => {
    const alipiri = detectPeakMoments(TWO_TRAIL_CONFIG, "alipiri");
    const srivari = detectPeakMoments(TWO_TRAIL_CONFIG, "srivari");
    expect(alipiri.length).toBeGreaterThan(0);
    expect(srivari.length).toBeGreaterThan(0);
    // Both routes share origin + destination chips.
    expect(alipiri.find((c) => c.kind === "origin")?.label).toBe("Tirupati");
    expect(srivari.find((c) => c.kind === "destination")?.label).toBe("Tirumala");
  });

  it("includes only nearby landmarks (no off-route ones)", () => {
    const all = detectPeakMoments(TWO_TRAIL_CONFIG, "alipiri");
    const names = all.map((c) => c.label);
    // Off-route landmark is geographically remote so it shouldn't snap to t∈(0,1)
    expect(names).not.toContain("Off Route Hill");
  });
});

describe("buildScriptRequest", () => {
  it("uses the selected trail's waypoint count, not the first route's", () => {
    const alipiri = buildScriptRequest({
      config: TWO_TRAIL_CONFIG, tone: "devotional", language: "en", routeVariantId: "alipiri",
    });
    const srivari = buildScriptRequest({
      config: TWO_TRAIL_CONFIG, tone: "devotional", language: "en", routeVariantId: "srivari",
    });
    expect(alipiri.waypointCount).toBe(3);
    expect(srivari.waypointCount).toBe(3);
    // Both have 3 in this fixture, but distanceKm differs.
    expect(alipiri.distanceKm).toBe(11);
    expect(srivari.distanceKm).toBe(2.1);
  });

  it("annotates the routeTitle with trail name", () => {
    const req = buildScriptRequest({
      config: TWO_TRAIL_CONFIG, tone: "devotional", language: "en", routeVariantId: "srivari",
    });
    expect(req.routeTitle).toBe("Tirupati → Tirumala — Srivari Mettu");
    expect(req.routeVariantId).toBe("srivari");
  });

  it("filters landmarks to those geographically near the chosen trail", () => {
    const alipiri = buildScriptRequest({
      config: TWO_TRAIL_CONFIG, tone: "devotional", language: "en", routeVariantId: "alipiri",
    });
    const srivari = buildScriptRequest({
      config: TWO_TRAIL_CONFIG, tone: "devotional", language: "en", routeVariantId: "srivari",
    });
    expect(alipiri.landmarks.map((l) => l.name)).toContain("Alipiri Gate");
    expect(alipiri.landmarks.map((l) => l.name)).not.toContain("Srivari Trailhead");
    expect(srivari.landmarks.map((l) => l.name)).toContain("Srivari Trailhead");
    expect(srivari.landmarks.map((l) => l.name)).not.toContain("Alipiri Gate");
    // Off-route landmark filtered out from both
    expect([...alipiri.landmarks, ...srivari.landmarks].map((l) => l.name))
      .not.toContain("Off Route Hill");
  });

  it("back-compat: omitting routeVariantId still works (uses first route)", () => {
    const req = buildScriptRequest({
      config: TWO_TRAIL_CONFIG, tone: "devotional", language: "en",
    });
    expect(req.routeVariantId).toBe("alipiri");
    expect(req.distanceKm).toBe(11);
  });
});
