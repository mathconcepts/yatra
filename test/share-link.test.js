import { describe, it, expect } from "vitest";
import {
  encodeMemoryUrl,
  decodeMemoryUrl,
  compactConfig,
  expandCompact,
  readMemoryFromUrl,
} from "../src/services/shareLink";

const sampleConfig = {
  title: "Manali trip",
  subtitle: "Mountain pass",
  bounds: { latMin: 32.2, latMax: 32.4, lonMin: 77.1, lonMax: 77.3 },
  origin: { name: "Manali", lat: 32.24, lon: 77.18, elev: 2050 },
  destination: { name: "Rohtang", lat: 32.37, lon: 77.25, elev: 3978 },
  mode: "road",
  routes: [{
    id: "r1", name: "NH-3", color: "#3b82f6",
    waypoints: [
      { lat: 32.24, lon: 77.18, elev: 2050 },
      { lat: 32.30, lon: 77.20, elev: 2500 },
      { lat: 32.37, lon: 77.25, elev: 3978 },
    ],
  }],
  landmarks: [
    { id: "lm1", name: "Photo stop", lat: 32.28, lon: 77.19, elev: 2200, type: "milestone", blurb: "Lunch" },
  ],
  topography: { basemap: "imagery", zoom: 12, pitch: 50, bearing: -25, terrainExaggeration: 1.5 },
  culture: { accentColor: "#06b6d4" },
};

describe("compactConfig + expandCompact", () => {
  it("compacts to short field names", () => {
    const c = compactConfig(sampleConfig);
    expect(c.t).toBe("Manali trip");
    expect(c.b).toEqual([32.2, 32.4, 77.1, 77.3]);
    expect(c.w).toHaveLength(3);
    expect(c.w[0]).toEqual([32.24, 77.18, 2050]);
  });

  it("stripElev drops the third tuple element", () => {
    const c = compactConfig(sampleConfig, { stripElev: true });
    expect(c.w[0]).toHaveLength(2);
  });

  it("round-trips through expandCompact", () => {
    const c = compactConfig(sampleConfig);
    const back = expandCompact(c);
    expect(back.title).toBe("Manali trip");
    expect(back.bounds.latMin).toBeCloseTo(32.2, 4);
    expect(back.routes[0].waypoints).toHaveLength(3);
    expect(back.landmarks).toHaveLength(1);
    expect(back.landmarks[0].name).toBe("Photo stop");
  });

  it("returns null for invalid compact input", () => {
    expect(expandCompact(null)).toBe(null);
    expect(expandCompact({})).toBe(null);
    expect(expandCompact({ b: [1, 2], w: [] })).toBe(null);
  });
});

describe("encodeMemoryUrl + decodeMemoryUrl", () => {
  it("encodes to URL-safe characters only", () => {
    const enc = encodeMemoryUrl(sampleConfig);
    expect(enc).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("decodes back to a usable LocationConfig", () => {
    const enc = encodeMemoryUrl(sampleConfig);
    const back = decodeMemoryUrl(enc);
    expect(back.title).toBe("Manali trip");
    expect(back.routes[0].waypoints[0].lat).toBeCloseTo(32.24, 4);
  });

  it("returns null for invalid input", () => {
    expect(encodeMemoryUrl(null)).toBe(null);
    expect(decodeMemoryUrl("")).toBe(null);
    expect(decodeMemoryUrl("not!base64$$$")).toBe(null);
  });

  it("preserves multi-byte UTF-8 in title", () => {
    const cfg = { ...sampleConfig, title: "मनाली यात्रा" };
    const back = decodeMemoryUrl(encodeMemoryUrl(cfg));
    expect(back.title).toBe("मनाली यात्रा");
  });
});

describe("readMemoryFromUrl", () => {
  it("returns null when ?memory= is absent", () => {
    expect(readMemoryFromUrl("http://x/?surface=atlas")).toBe(null);
  });
  it("returns null for invalid href", () => {
    expect(readMemoryFromUrl(null)).toBe(null);
    expect(readMemoryFromUrl("not-a-url")).toBe(null);
  });
  it("decodes the ?memory= param when present", () => {
    const enc = encodeMemoryUrl(sampleConfig);
    const href = `http://x/path?surface=reels&memory=${enc}`;
    const out = readMemoryFromUrl(href);
    expect(out.title).toBe("Manali trip");
  });
});
