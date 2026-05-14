import { describe, it, expect } from "vitest";
import { buildScriptRequest, generateScript, suggestPersonalNote } from "../src/services/directorScript.js";

const fakeConfig = {
  id: "yadagiri-gutta",
  title: "Yadagiri Gutta",
  routes: [
    {
      id: "main",
      name: "Hilltop route",
      distanceKm: 4.2,
      waypoints: [
        { lat: 17.59, lon: 78.94, elev: 380 },
        { lat: 17.595, lon: 78.945, elev: 430 },
        { lat: 17.5995, lon: 78.9495, elev: 540 },
      ],
    },
  ],
  landmarks: [
    { name: "Steps base", lat: 17.59, lon: 78.94, curatedFacts: ["Trail starts here"] },
    { name: "Summit mandapam", lat: 17.5995, lon: 78.9495 },
  ],
};

describe("directorScript", () => {
  it("buildScriptRequest reuses peakMoments and config metadata", () => {
    const req = buildScriptRequest({ config: fakeConfig, tone: "devotional", language: "te" });
    expect(req.routeId).toBe("yadagiri-gutta");
    expect(req.tone).toBe("devotional");
    expect(req.language).toBe("te");
    expect(req.waypointCount).toBe(3);
    expect(req.elevationGainM).toBeCloseTo(160, 0);
    expect(req.landmarks).toHaveLength(2);
    expect(req.peakMoments.length).toBeGreaterThan(0);
  });

  it("generateScript throws when required args are missing", async () => {
    await expect(generateScript({})).rejects.toThrow(/requires/);
  });

  it("generateScript without mock + without worker URL throws a useful message", async () => {
    // VITE_DIRECTOR_MOCK is not set in test env; VITE_DIRECTOR_WORKER_URL also unset.
    await expect(
      generateScript({ config: fakeConfig, tone: "devotional", language: "te" }),
    ).rejects.toThrow(/VITE_DIRECTOR_WORKER_URL|VITE_DIRECTOR_MOCK/);
  });

  it("buildScriptRequest carries personalContext when provided (trimmed, capped 500)", () => {
    const note = "  A return to the hill my grandmother walked.  ";
    const req = buildScriptRequest({ config: fakeConfig, tone: "devotional", language: "te", personalContext: note });
    expect(req.personalContext).toBe("A return to the hill my grandmother walked.");
    const long = "y".repeat(600);
    const req2 = buildScriptRequest({ config: fakeConfig, tone: "devotional", language: "te", personalContext: long });
    expect(req2.personalContext.length).toBe(500);
  });

  it("buildScriptRequest emits empty personalContext when absent", () => {
    const req = buildScriptRequest({ config: fakeConfig, tone: "devotional", language: "te" });
    expect(req.personalContext).toBe("");
  });

  it("suggestPersonalNote returns a tone-shaped default mentioning the route title", () => {
    const dev = suggestPersonalNote({ config: fakeConfig, tone: "devotional" });
    expect(dev).toContain("Yadagiri Gutta");
    const exp = suggestPersonalNote({ config: fakeConfig, tone: "explorer" });
    expect(exp).toContain("Yadagiri Gutta");
    // Different tones produce different copy
    expect(dev).not.toBe(exp);
  });
});
