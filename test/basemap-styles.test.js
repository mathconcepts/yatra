import { describe, it, expect } from "vitest";
import { tilesForSource, makeMapStyle, BASEMAP_LABELS } from "../src/services/basemapStyles";

describe("tilesForSource", () => {
  it("returns ESRI tile URL for esri", () => {
    const tiles = tilesForSource("esri");
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatch(/arcgisonline\.com/);
  });

  it("returns OSM tile URL for osm", () => {
    const tiles = tilesForSource("osm");
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatch(/openstreetmap\.org/);
    expect(tiles[0]).toMatch(/{z}\/{x}\/{y}/);
  });

  it("returns null for bhuvan-proxy when env var is unset", () => {
    // The test env never sets VITE_BHUVAN_PROXY_URL → factory returns null.
    expect(tilesForSource("bhuvan-proxy")).toBe(null);
  });

  it("returns null for an unknown source", () => {
    expect(tilesForSource("gibberish")).toBe(null);
  });
});

describe("makeMapStyle", () => {
  it("produces a v8 style with basemap + terrain sources", () => {
    const style = makeMapStyle("topo");
    expect(style.version).toBe(8);
    expect(style.sources.basemap).toBeDefined();
    expect(style.sources.terrain).toBeDefined();
  });

  it("falls back to topo when given an unknown basemap", () => {
    const a = makeMapStyle("topo");
    const b = makeMapStyle("not-a-real-basemap");
    expect(b.sources.basemap.tiles).toEqual(a.sources.basemap.tiles);
  });
});

describe("BASEMAP_LABELS", () => {
  it("covers the three first-party basemaps", () => {
    expect(BASEMAP_LABELS.topo).toBeTruthy();
    expect(BASEMAP_LABELS.imagery).toBeTruthy();
    expect(BASEMAP_LABELS.relief).toBeTruthy();
  });
});
