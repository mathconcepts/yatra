import { describe, it, expect, beforeEach } from "vitest";
import { extractCandidates, scaffoldFromText } from "../src/services/aiScaffold";
import { _clearGeocoderCache } from "../src/services/geocoder";

describe("extractCandidates", () => {
  it("returns [] for empty/non-string input", () => {
    expect(extractCandidates("")).toEqual([]);
    expect(extractCandidates(null)).toEqual([]);
    expect(extractCandidates(123)).toEqual([]);
  });

  it("pulls capitalized single words", () => {
    const out = extractCandidates("Visited Manali last year.");
    expect(out).toContain("Manali");
  });

  it("pulls capitalized multi-word phrases", () => {
    const out = extractCandidates("Drove up to Rohtang Pass and onwards.");
    expect(out).toContain("Rohtang Pass");
  });

  it("drops standalone stop words", () => {
    const out = extractCandidates("We went to Manali on Friday.");
    expect(out).not.toContain("We");
    expect(out).not.toContain("Friday");
    expect(out).toContain("Manali");
  });

  it("dedupes case-insensitive", () => {
    const out = extractCandidates("Manali. Manali again.");
    expect(out.filter((s) => s === "Manali")).toHaveLength(1);
  });

  it("preserves text order", () => {
    const out = extractCandidates("Started in Delhi, then Manali, then Rohtang Pass.");
    expect(out).toEqual(["Delhi", "Manali", "Rohtang Pass"]);
  });
});

describe("scaffoldFromText", () => {
  beforeEach(() => _clearGeocoderCache());

  it("returns empty result for blank text", async () => {
    const r = await scaffoldFromText("");
    expect(r.waypoints).toEqual([]);
    expect(r.skipped).toEqual([]);
  });

  it("verifies candidates and returns waypoints in narrative order", async () => {
    const fetcher = async (url) => {
      const q = decodeURIComponent(url.split("q=")[1] || "");
      const fixtures = {
        Delhi: [{ lat: "28.6", lon: "77.2", display_name: "Delhi, India", importance: 0.8 }],
        Manali: [{ lat: "32.2", lon: "77.1", display_name: "Manali, India", importance: 0.7 }],
      };
      const rows = fixtures[q.split("|")[0]] || [];
      return { ok: true, json: async () => rows };
    };
    const r = await scaffoldFromText("Delhi then Manali.", { fetcher });
    expect(r.waypoints.map((w) => w.query)).toEqual(["Delhi", "Manali"]);
  });

  it("collects skipped names when geocoding returns nothing", async () => {
    const fetcher = async () => ({ ok: true, json: async () => [] });
    const r = await scaffoldFromText("Mysterio Atlantis.", { fetcher });
    expect(r.skipped.length).toBeGreaterThan(0);
    expect(r.waypoints).toEqual([]);
  });
});
