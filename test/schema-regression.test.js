import { describe, it, expect } from "vitest";
import { LOCATIONS } from "../src/config";
import tirupati from "../src/config/tirupati-tirumala";

// P9 regression: the existing Tirupati LocationConfig must keep working
// with the optional new `mode` + `cameraPlan` fields added in Slice 1.
// Adding optional schema fields must not break old configs.
describe("schema regression — Tirupati config", () => {
  it("loads via the LOCATIONS registry", () => {
    expect(LOCATIONS["tirupati-tirumala"]).toBeDefined();
    expect(LOCATIONS["tirupati-tirumala"].id).toBe("tirupati-tirumala");
  });

  it("has all required v1 fields untouched", () => {
    expect(tirupati.title).toBeTruthy();
    expect(tirupati.bounds).toBeDefined();
    expect(tirupati.origin).toBeDefined();
    expect(tirupati.destination).toBeDefined();
    expect(Array.isArray(tirupati.routes)).toBe(true);
    expect(tirupati.routes.length).toBeGreaterThanOrEqual(1);
  });

  it("works without the new optional v3.0 fields", () => {
    expect(tirupati.mode).toBeUndefined();
    expect(tirupati.cameraPlan).toBeUndefined();
  });

  it("each route still has the required v1 shape", () => {
    for (const r of tirupati.routes) {
      expect(r.id).toBeTruthy();
      expect(r.name).toBeTruthy();
      expect(Array.isArray(r.waypoints)).toBe(true);
      expect(r.waypoints.length).toBeGreaterThanOrEqual(2);
    }
  });
});
