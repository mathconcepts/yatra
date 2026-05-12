import { describe, it, expect } from "vitest";
import {
  composerReducer,
  initialComposerState,
  COMPOSER_ACTIONS,
  isReadyToPreview,
  toLocationConfig,
} from "../src/components/composer/composer-state";

const A = COMPOSER_ACTIONS;

describe("composerReducer", () => {
  it("returns the initial state when given an unknown action", () => {
    expect(composerReducer(initialComposerState, { type: "WAT" })).toBe(initialComposerState);
  });

  it("sets the title", () => {
    const s = composerReducer(initialComposerState, { type: A.SET_TITLE, payload: "Manali week" });
    expect(s.title).toBe("Manali week");
  });

  it("coerces non-string titles", () => {
    const s = composerReducer(initialComposerState, { type: A.SET_TITLE, payload: null });
    expect(s.title).toBe("");
  });

  it("sets origin and destination", () => {
    const s1 = composerReducer(initialComposerState, { type: A.SET_ORIGIN, payload: { name: "A", lat: 1, lon: 2 } });
    const s2 = composerReducer(s1, { type: A.SET_DESTINATION, payload: { name: "B", lat: 3, lon: 4 } });
    expect(s2.origin.name).toBe("A");
    expect(s2.destination.lat).toBe(3);
  });

  it("clears origin on null payload", () => {
    const s1 = composerReducer(initialComposerState, { type: A.SET_ORIGIN, payload: { name: "A", lat: 1, lon: 2 } });
    const s2 = composerReducer(s1, { type: A.SET_ORIGIN, payload: null });
    expect(s2.origin).toBe(null);
  });

  it("sets waypoints; rejects non-arrays", () => {
    const s1 = composerReducer(initialComposerState, { type: A.SET_WAYPOINTS, payload: [{ lat: 1, lon: 2 }] });
    expect(s1.waypoints.length).toBe(1);
    const s2 = composerReducer(s1, { type: A.SET_WAYPOINTS, payload: "no" });
    expect(s2.waypoints).toEqual([]);
  });

  it("adds landmarks with auto-id, ignores invalid ones", () => {
    const s1 = composerReducer(initialComposerState, { type: A.ADD_LANDMARK, payload: { name: "X", lat: 1, lon: 2 } });
    expect(s1.landmarks).toHaveLength(1);
    expect(s1.landmarks[0].id).toBe("lm-1");
    const s2 = composerReducer(s1, { type: A.ADD_LANDMARK, payload: { name: "no coords" } });
    expect(s2).toBe(s1); // no change
  });

  it("removes landmarks by id", () => {
    let s = composerReducer(initialComposerState, { type: A.ADD_LANDMARK, payload: { id: "x", name: "X", lat: 1, lon: 2 } });
    s = composerReducer(s, { type: A.ADD_LANDMARK, payload: { id: "y", name: "Y", lat: 3, lon: 4 } });
    s = composerReducer(s, { type: A.REMOVE_LANDMARK, payload: "x" });
    expect(s.landmarks).toHaveLength(1);
    expect(s.landmarks[0].id).toBe("y");
  });

  it("accepts only valid modes", () => {
    const s1 = composerReducer(initialComposerState, { type: A.SET_MODE, payload: "rail" });
    expect(s1.mode).toBe("rail");
    const s2 = composerReducer(s1, { type: A.SET_MODE, payload: "boat" });
    expect(s2).toBe(s1);
  });

  it("accepts only valid status values", () => {
    const s1 = composerReducer(initialComposerState, { type: A.SET_STATUS, payload: "exporting" });
    expect(s1.status).toBe("exporting");
    const s2 = composerReducer(s1, { type: A.SET_STATUS, payload: "exploded" });
    expect(s2).toBe(s1);
  });

  it("accumulates and clears errors", () => {
    let s = composerReducer(initialComposerState, { type: A.ADD_ERROR, payload: "boom" });
    s = composerReducer(s, { type: A.ADD_ERROR, payload: "kaboom" });
    expect(s.errors).toEqual(["boom", "kaboom"]);
    s = composerReducer(s, { type: A.CLEAR_ERRORS });
    expect(s.errors).toEqual([]);
  });

  it("RESET returns initialComposerState identity", () => {
    let s = composerReducer(initialComposerState, { type: A.SET_TITLE, payload: "noise" });
    s = composerReducer(s, { type: A.RESET });
    expect(s).toEqual(initialComposerState);
  });
});

describe("isReadyToPreview", () => {
  it("is false on initial state", () => {
    expect(isReadyToPreview(initialComposerState)).toBe(false);
  });
  it("is true when title + origin + destination + 2 waypoints present", () => {
    const s = {
      ...initialComposerState,
      title: "Trip",
      origin: { name: "A", lat: 1, lon: 2 },
      destination: { name: "B", lat: 3, lon: 4 },
      waypoints: [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }],
    };
    expect(isReadyToPreview(s)).toBe(true);
  });
  it("is false with only one waypoint", () => {
    const s = {
      ...initialComposerState,
      title: "Trip",
      origin: { name: "A", lat: 1, lon: 2 },
      destination: { name: "B", lat: 3, lon: 4 },
      waypoints: [{ lat: 1, lon: 2 }],
    };
    expect(isReadyToPreview(s)).toBe(false);
  });
  it("is false when title is whitespace only", () => {
    const s = {
      ...initialComposerState,
      title: "   ",
      origin: { name: "A", lat: 1, lon: 2 },
      destination: { name: "B", lat: 3, lon: 4 },
      waypoints: [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }],
    };
    expect(isReadyToPreview(s)).toBe(false);
  });
});

describe("toLocationConfig", () => {
  const ready = {
    ...initialComposerState,
    title: "Trip",
    origin: { name: "A", lat: 10, lon: 20 },
    destination: { name: "B", lat: 11, lon: 21 },
    waypoints: [{ lat: 10, lon: 20, elev: 100 }, { lat: 10.5, lon: 20.5 }, { lat: 11, lon: 21, elev: 200 }],
    landmarks: [{ id: "p", name: "Photo", lat: 10.5, lon: 20.5, blurb: "hi" }],
    mode: "trail",
  };

  it("returns null for unready states", () => {
    expect(toLocationConfig(initialComposerState)).toBe(null);
  });

  it("projects ready state into a LocationConfig", () => {
    const cfg = toLocationConfig(ready);
    expect(cfg.title).toBe("Trip");
    expect(cfg.mode).toBe("trail");
    expect(cfg.routes).toHaveLength(1);
    expect(cfg.routes[0].waypoints).toHaveLength(3);
    expect(cfg.landmarks).toHaveLength(1);
    expect(cfg.bounds.latMin).toBeLessThan(10);
    expect(cfg.bounds.latMax).toBeGreaterThan(11);
  });

  it("fills missing elev with 0", () => {
    const cfg = toLocationConfig(ready);
    expect(cfg.routes[0].waypoints[1].elev).toBe(0);
  });
});
