import { describe, it, expect } from "vitest";
import { interpolateLineWaypoints, haversineKm } from "../src/components/composer/route-builder";

describe("interpolateLineWaypoints", () => {
  it("returns [] for missing endpoints", () => {
    expect(interpolateLineWaypoints(null, { lat: 1, lon: 2 })).toEqual([]);
    expect(interpolateLineWaypoints({ lat: 1, lon: 2 }, null)).toEqual([]);
  });
  it("returns [] when coords are not numbers", () => {
    expect(interpolateLineWaypoints({ lat: "x", lon: "y" }, { lat: 1, lon: 2 })).toEqual([]);
  });
  it("interpolates 10 evenly-spaced points by default", () => {
    const out = interpolateLineWaypoints({ lat: 0, lon: 0 }, { lat: 10, lon: 20 });
    expect(out).toHaveLength(10);
    expect(out[0].lat).toBe(0);
    expect(out[9].lat).toBe(10);
    expect(out[9].lon).toBe(20);
  });
  it("clamps n to at least 2", () => {
    const out = interpolateLineWaypoints({ lat: 0, lon: 0 }, { lat: 1, lon: 1 }, 1);
    expect(out).toHaveLength(2);
  });
  it("evenly distributes intermediate points", () => {
    const out = interpolateLineWaypoints({ lat: 0, lon: 0 }, { lat: 10, lon: 0 }, 3);
    expect(out[1].lat).toBeCloseTo(5, 4);
  });
});

describe("haversineKm", () => {
  it("returns 0 for missing input", () => {
    expect(haversineKm(null, { lat: 1, lon: 2 })).toBe(0);
  });
  it("returns 0 for identical points", () => {
    expect(haversineKm({ lat: 10, lon: 20 }, { lat: 10, lon: 20 })).toBe(0);
  });
  it("computes ~157km for 1 lat-degree apart at the equator within 2km", () => {
    const d = haversineKm({ lat: 0, lon: 0 }, { lat: 1, lon: 1 });
    expect(d).toBeGreaterThan(155);
    expect(d).toBeLessThan(160);
  });
});
