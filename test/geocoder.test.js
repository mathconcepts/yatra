import { describe, it, expect, beforeEach } from "vitest";
import {
  parseNominatimRow,
  parseNominatimResponse,
  scoreResult,
  geocode,
  _clearGeocoderCache,
} from "../src/services/geocoder";

describe("parseNominatimRow", () => {
  it("returns null for missing input", () => {
    expect(parseNominatimRow(null)).toBe(null);
    expect(parseNominatimRow(undefined)).toBe(null);
  });
  it("returns null when lat/lon missing", () => {
    expect(parseNominatimRow({ display_name: "X" })).toBe(null);
    expect(parseNominatimRow({ lat: "not-a-number", lon: "0", display_name: "X" })).toBe(null);
  });
  it("parses a well-formed row", () => {
    const r = parseNominatimRow({
      lat: "32.2432",
      lon: "77.1892",
      display_name: "Manali, Kullu, Himachal Pradesh, India",
      type: "town",
      importance: 0.71,
    });
    expect(r.lat).toBeCloseTo(32.2432, 4);
    expect(r.name).toContain("Manali");
    expect(r.kind).toBe("town");
  });
  it("falls back to class when type missing", () => {
    const r = parseNominatimRow({ lat: "1", lon: "2", display_name: "X", class: "boundary" });
    expect(r.kind).toBe("boundary");
  });
});

describe("parseNominatimResponse", () => {
  it("returns [] for non-array input", () => {
    expect(parseNominatimResponse(null)).toEqual([]);
    expect(parseNominatimResponse("nope")).toEqual([]);
  });
  it("filters out invalid rows and sorts by importance", () => {
    const out = parseNominatimResponse([
      { lat: "1", lon: "2", display_name: "Low", importance: 0.1 },
      { display_name: "Bad" },
      { lat: "3", lon: "4", display_name: "High", importance: 0.9 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe("High");
    expect(out[1].name).toBe("Low");
  });
});

describe("scoreResult", () => {
  it("scores prefix matches highest", () => {
    const cand = { name: "Manali, India", importance: 0.5 };
    expect(scoreResult("Manali", cand)).toBeGreaterThan(scoreResult("India", cand));
  });
  it("returns importance only when query is empty", () => {
    const cand = { name: "X", importance: 0.42 };
    expect(scoreResult("", cand)).toBe(0.42);
  });
});

describe("geocode", () => {
  beforeEach(() => _clearGeocoderCache());

  it("returns [] for short queries", async () => {
    const out = await geocode("a");
    expect(out).toEqual([]);
  });

  it("uses the injected fetcher and parses results", async () => {
    const fetcher = async () => ({
      ok: true,
      json: async () => [
        { lat: "32.24", lon: "77.18", display_name: "Manali", type: "town", importance: 0.7 },
      ],
    });
    const out = await geocode("Manali", { fetcher });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Manali");
  });

  it("caches identical queries", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return { ok: true, json: async () => [{ lat: "1", lon: "2", display_name: "X" }] };
    };
    await geocode("Cachedplace", { fetcher });
    await geocode("Cachedplace", { fetcher });
    expect(calls).toBe(1);
  });

  it("returns [] on non-ok response", async () => {
    const fetcher = async () => ({ ok: false });
    const out = await geocode("Nopeplace", { fetcher });
    expect(out).toEqual([]);
  });

  it("returns [] on thrown errors", async () => {
    const fetcher = async () => { throw new Error("net"); };
    const out = await geocode("Boomplace", { fetcher });
    expect(out).toEqual([]);
  });

  it("returns [] silently on abort", async () => {
    const fetcher = async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    };
    const out = await geocode("Abortedplace", { fetcher });
    expect(out).toEqual([]);
  });
});
