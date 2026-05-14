import { describe, it, expect, vi } from "vitest";
import {
  buildGeocodeUrl,
  geocodePlace,
  assembleCustomConfig,
  buildCustomJourney,
} from "../src/services/customJourney.js";

describe("buildGeocodeUrl", () => {
  it("builds a Nominatim URL with json + limit", () => {
    const url = buildGeocodeUrl("Pondicherry");
    expect(url).toContain("nominatim.openstreetmap.org");
    expect(url).toContain("q=Pondicherry");
    expect(url).toContain("format=json");
    expect(url).toContain("limit=1");
  });
});

describe("geocodePlace", () => {
  function makeFetch(json, opts = {}) {
    return vi.fn().mockResolvedValue({
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      json: async () => json,
    });
  }

  it("returns parsed { name, lat, lon } on hit", async () => {
    const fetchImpl = makeFetch([{ display_name: "Pondicherry, India", lat: "11.93", lon: "79.83" }]);
    const out = await geocodePlace("Pondicherry", { fetchImpl });
    expect(out.name).toBe("Pondicherry");
    expect(out.lat).toBeCloseTo(11.93);
    expect(out.lon).toBeCloseTo(79.83);
  });

  it("throws code='not-found' on empty array", async () => {
    const fetchImpl = makeFetch([]);
    await expect(geocodePlace("ksdjflkdjf", { fetchImpl })).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws code='rate' on 429", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => null });
    await expect(geocodePlace("x", { fetchImpl })).rejects.toMatchObject({ code: "rate" });
  });

  it("throws code='not-found' on empty query", async () => {
    await expect(geocodePlace("")).rejects.toMatchObject({ code: "not-found" });
    await expect(geocodePlace("   ")).rejects.toMatchObject({ code: "not-found" });
  });

  it("throws code='network' when fetch errors out", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Network error"));
    await expect(geocodePlace("x", { fetchImpl })).rejects.toMatchObject({ code: "network" });
  });
});

describe("assembleCustomConfig", () => {
  const points = [
    { name: "Pondicherry", lat: 11.93, lon: 79.83 },
    { name: "Auroville",   lat: 12.00, lon: 79.81 },
    { name: "Mahabalipuram", lat: 12.62, lon: 80.19 },
  ];

  it("produces a LocationConfig with origin, destination, route, landmarks, tour", () => {
    const cfg = assembleCustomConfig({ title: "Test Journey", points });
    expect(cfg.id).toMatch(/^custom-/);
    expect(cfg.title).toBe("Test Journey");
    expect(cfg.origin.name).toBe("Pondicherry");
    expect(cfg.destination.name).toBe("Mahabalipuram");
    expect(cfg.routes).toHaveLength(1);
    expect(cfg.routes[0].waypoints).toHaveLength(3);
    expect(cfg.landmarks).toHaveLength(3);
    expect(cfg.tours).toHaveLength(1);
    expect(cfg.tours[0].pois).toHaveLength(3);
  });

  it("computes bounds with padding around the points", () => {
    const cfg = assembleCustomConfig({ title: "T", points });
    expect(cfg.bounds.latMin).toBeLessThan(11.93);
    expect(cfg.bounds.latMax).toBeGreaterThan(12.62);
  });

  it("omits tours when only 2 points (no via landmarks)", () => {
    const cfg = assembleCustomConfig({ title: "T", points: [points[0], points[2]] });
    expect(cfg.tours).toHaveLength(0);
  });

  it("throws when fewer than 2 points", () => {
    expect(() => assembleCustomConfig({ title: "T", points: [points[0]] })).toThrow();
  });
});

describe("buildCustomJourney", () => {
  it("calls geocode for each query in order, with delayMs=0 for tests", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce({
      ok: true, status: 200, json: async () => [{ display_name: "Pondicherry, India", lat: "11.93", lon: "79.83" }],
    }).mockResolvedValueOnce({
      ok: true, status: 200, json: async () => [{ display_name: "Auroville, India", lat: "12.00", lon: "79.81" }],
    }).mockResolvedValueOnce({
      ok: true, status: 200, json: async () => [{ display_name: "Mahabalipuram, India", lat: "12.62", lon: "80.19" }],
    });
    const cfg = await buildCustomJourney({
      title: "South coast",
      originQuery: "Pondicherry",
      waypointQueries: ["Auroville"],
      destinationQuery: "Mahabalipuram",
      fetchImpl, delayMs: 0,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(cfg.origin.name).toBe("Pondicherry");
    expect(cfg.destination.name).toBe("Mahabalipuram");
    expect(cfg.tours).toHaveLength(1);
  });

  it("rejects when fewer than 2 queries supplied", async () => {
    await expect(
      buildCustomJourney({ originQuery: "x", destinationQuery: "", waypointQueries: [], fetchImpl: vi.fn(), delayMs: 0 })
    ).rejects.toThrow();
  });
});
