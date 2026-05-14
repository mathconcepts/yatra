/**
 * Wizard step visibility — the Mode / Trail / Tour steps appear and
 * disappear based on location config + current mode selection.
 */

import { describe, it, expect } from "vitest";
import { buildSteps } from "../src/components/director/DirectorView.jsx";

describe("buildSteps", () => {
  it("hides Mode when location has no tours", () => {
    const ids = buildSteps({ locationHasTours: false, mode: "point-to-point", locationHasMultipleTrails: true })
      .map((s) => s.id);
    expect(ids).not.toContain("mode");
  });

  it("shows Mode when location has tours", () => {
    const ids = buildSteps({ locationHasTours: true, mode: "point-to-point", locationHasMultipleTrails: true })
      .map((s) => s.id);
    expect(ids).toContain("mode");
  });

  it("shows Trail only in point-to-point mode AND when 2+ trails exist", () => {
    const both = buildSteps({ locationHasTours: true, mode: "point-to-point", locationHasMultipleTrails: true })
      .map((s) => s.id);
    expect(both).toContain("trail");

    const oneTrail = buildSteps({ locationHasTours: true, mode: "point-to-point", locationHasMultipleTrails: false })
      .map((s) => s.id);
    expect(oneTrail).not.toContain("trail");

    const tourMode = buildSteps({ locationHasTours: true, mode: "tour", locationHasMultipleTrails: true })
      .map((s) => s.id);
    expect(tourMode).not.toContain("trail");
  });

  it("shows Tour only in tour mode", () => {
    expect(
      buildSteps({ locationHasTours: true, mode: "tour", locationHasMultipleTrails: false }).map((s) => s.id),
    ).toContain("tour");
    expect(
      buildSteps({ locationHasTours: true, mode: "point-to-point", locationHasMultipleTrails: false }).map((s) => s.id),
    ).not.toContain("tour");
  });

  it("always includes tone, route, basemap, language, voice, duration, note, review", () => {
    const ids = buildSteps({ locationHasTours: false, mode: "point-to-point", locationHasMultipleTrails: false })
      .map((s) => s.id);
    for (const expected of ["tone", "route", "basemap", "language", "voice", "duration", "note", "review"]) {
      expect(ids).toContain(expected);
    }
  });
});
