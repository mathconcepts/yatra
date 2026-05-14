/**
 * Pin the mock fallback so it emits a real multi-scene script (not the
 * v1.6 single-scene placeholder). The user-visible symptom of the bug
 * we fixed: MP4 had no landmarks, no captions, no per-place storytelling.
 */

import { describe, it, expect } from "vitest";
import { buildMockScenesFromBody } from "../src/services/directorScript.js";

describe("buildMockScenesFromBody — point-to-point", () => {
  const body = {
    routeId: "tt",
    routeTitle: "Tirupati → Tirumala",
    mode: undefined, // point-to-point
    tone: "explorer",
    language: "en",
    peakMoments: [
      { t: 0,    kind: "origin",       label: "Tirupati" },
      { t: 0.2,  kind: "landmark",     label: "Alipiri Gate" },
      { t: 0.5,  kind: "peak-climb",   label: "Steepest climb" },
      { t: 0.8,  kind: "landmark",     label: "Narasimha Swamy Shrine" },
      { t: 1,    kind: "destination",  label: "Tirumala" },
    ],
    landmarks: [
      { name: "Alipiri Gate", facts: ["The base gate, where the climb begins."] },
      { name: "Narasimha Swamy Shrine", facts: ["A small shrine on the path."] },
    ],
  };

  it("emits one scene per peak moment, not a single placeholder", () => {
    const script = buildMockScenesFromBody(body, 30);
    expect(script.scenes).toHaveLength(5);
  });

  it("scenes are timed across the full duration with no gaps", () => {
    const script = buildMockScenesFromBody(body, 30);
    expect(script.scenes[0].tStart).toBe(0);
    expect(script.scenes[script.scenes.length - 1].tEnd).toBeCloseTo(30, 0);
    for (let i = 1; i < script.scenes.length; i++) {
      expect(script.scenes[i].tStart).toBeCloseTo(script.scenes[i - 1].tEnd, 1);
    }
  });

  it("origin + destination scenes use headline caption style", () => {
    const script = buildMockScenesFromBody(body, 30);
    expect(script.scenes[0].captionStyle).toBe("headline");
    expect(script.scenes[script.scenes.length - 1].captionStyle).toBe("headline");
    expect(script.scenes[1].captionStyle).toBe("subtitle");
  });

  it("landmark narration weaves in the first curated fact", () => {
    const script = buildMockScenesFromBody(body, 30);
    const gate = script.scenes.find((s) => s.captionText === "Alipiri Gate");
    expect(gate.narration).toContain("Alipiri Gate");
    expect(gate.narration).toContain("base gate");
  });

  it("captionText is the landmark name (visible on the burned-in MP4)", () => {
    const script = buildMockScenesFromBody(body, 30);
    expect(script.scenes.map((s) => s.captionText)).toEqual([
      "Tirupati", "Alipiri Gate", "Steepest climb", "Narasimha Swamy Shrine", "Tirumala",
    ]);
  });

  it("respects an override duration (e.g. 60s, 90s)", () => {
    const s60 = buildMockScenesFromBody(body, 60);
    expect(s60.scenes[s60.scenes.length - 1].tEnd).toBeCloseTo(60, 0);
    const s90 = buildMockScenesFromBody(body, 90);
    expect(s90.scenes[s90.scenes.length - 1].tEnd).toBeCloseTo(90, 0);
  });
});

describe("buildMockScenesFromBody — tour mode", () => {
  const body = {
    routeId: "srirangam-trichy",
    routeTitle: "Srirangam — Two temples",
    mode: "tour",
    tourId: "two-temples",
    tone: "devotional",
    language: "en",
    peakMoments: [
      { t: 0.25, kind: "tour-stop", label: "Ranganathaswamy", poiId: "ranganathaswamy", durationS: 15 },
      { t: 0.75, kind: "tour-stop", label: "Jambukeshwarar",  poiId: "jambukeshwarar",  durationS: 15 },
    ],
    landmarks: [
      {
        id: "ranganathaswamy", name: "Ranganathaswamy",
        facts: ["156 acres — the largest functioning Hindu temple complex on earth"],
      },
      {
        id: "jambukeshwarar", name: "Jambukeshwarar",
        facts: ["The water-element temple; a spring under the lingam never dries"],
      },
    ],
    totalDurationS: 30,
  };

  it("emits one scene per tour-stop, honoring per-stop durationS", () => {
    const script = buildMockScenesFromBody(body, 30);
    expect(script.scenes).toHaveLength(2);
    expect(script.scenes[0].tStart).toBe(0);
    expect(script.scenes[0].tEnd).toBeCloseTo(15, 0);
    expect(script.scenes[1].tStart).toBeCloseTo(15, 0);
    expect(script.scenes[1].tEnd).toBeCloseTo(30, 0);
  });

  it("uses the landmark's first curated fact as narration substance", () => {
    const script = buildMockScenesFromBody(body, 30);
    expect(script.scenes[0].narration).toContain("Ranganathaswamy");
    expect(script.scenes[0].narration).toContain("156 acres");
    expect(script.scenes[1].narration).toContain("water-element");
  });

  it("captions are short POI names (renderable on small mobile screens)", () => {
    const script = buildMockScenesFromBody(body, 30);
    expect(script.scenes.map((s) => s.captionText)).toEqual([
      "Ranganathaswamy", "Jambukeshwarar",
    ]);
  });

  it("meta.via reflects the tour path", () => {
    const script = buildMockScenesFromBody(body, 30);
    expect(script.meta.via).toBe("mock-tour");
  });
});

describe("buildMockScenesFromBody — edge cases", () => {
  it("falls back to a title-only scene when peakMoments is empty", () => {
    const script = buildMockScenesFromBody({ routeTitle: "Nowhere", peakMoments: [] }, 30);
    expect(script.scenes).toHaveLength(1);
    expect(script.scenes[0].captionText).toBe("Nowhere");
    expect(script.scenes[0].tEnd).toBe(30);
  });

  it("handles a totally missing body without throwing", () => {
    const script = buildMockScenesFromBody(null, 30);
    expect(script.scenes).toHaveLength(1);
  });
});
