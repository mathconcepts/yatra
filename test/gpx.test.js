import { describe, it, expect } from "vitest";
import { parseGPX, simplify } from "../src/services/gpx";

const SAMPLE_GPX = `<?xml version="1.0"?>
<gpx version="1.1" creator="test"><trk><name>Test track</name><trkseg>
  <trkpt lat="32.24" lon="77.18"><ele>2050</ele></trkpt>
  <trkpt lat="32.30" lon="77.20"><ele>2300</ele></trkpt>
  <trkpt lat="32.37" lon="77.25"><ele>3978</ele></trkpt>
</trkseg></trk></gpx>`;

describe("parseGPX", () => {
  it("returns error on empty input", () => {
    expect(parseGPX("").error).toBeDefined();
    expect(parseGPX(null).error).toBeDefined();
  });

  it("parses well-formed trkpts", () => {
    const out = parseGPX(SAMPLE_GPX);
    expect(out.waypoints).toHaveLength(3);
    expect(out.waypoints[0].lat).toBeCloseTo(32.24, 2);
    expect(out.waypoints[0].elev).toBe(2050);
    expect(out.name).toBe("Test track");
  });

  it("returns error when no track points", () => {
    const out = parseGPX(`<?xml version="1.0"?><gpx></gpx>`);
    expect(out.error).toBe("no track points found");
  });

  it("handles missing elevation as zero", () => {
    const xml = `<?xml version="1.0"?><gpx><trk><trkseg>
      <trkpt lat="1" lon="2"/><trkpt lat="3" lon="4"/></trkseg></trk></gpx>`;
    const out = parseGPX(xml);
    expect(out.waypoints).toHaveLength(2);
    expect(out.waypoints[0].elev).toBe(0);
  });

  it("falls back to <wpt> when <trkpt> absent", () => {
    const xml = `<?xml version="1.0"?><gpx>
      <wpt lat="10" lon="20"><ele>5</ele></wpt>
      <wpt lat="11" lon="21"><ele>10</ele></wpt></gpx>`;
    const out = parseGPX(xml);
    expect(out.waypoints).toHaveLength(2);
    expect(out.waypoints[1].elev).toBe(10);
  });

  it("skips points with non-numeric lat/lon", () => {
    const xml = `<?xml version="1.0"?><gpx><trk><trkseg>
      <trkpt lat="1" lon="2"/><trkpt lat="bad" lon="x"/></trkseg></trk></gpx>`;
    expect(parseGPX(xml).waypoints).toHaveLength(1);
  });
});

describe("simplify (Douglas-Peucker)", () => {
  it("returns input unchanged for short arrays", () => {
    const pts = [{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }];
    expect(simplify(pts, 0.001)).toEqual(pts);
  });

  it("reduces a straight line to endpoints", () => {
    const pts = [];
    for (let i = 0; i <= 10; i++) pts.push({ lat: i, lon: i });
    const out = simplify(pts, 0.01);
    expect(out).toHaveLength(2);
    expect(out[0].lat).toBe(0);
    expect(out[1].lat).toBe(10);
  });

  it("keeps detour points above tolerance", () => {
    const pts = [
      { lat: 0, lon: 0 },
      { lat: 0.5, lon: 5 }, // big detour east
      { lat: 1, lon: 0 },
    ];
    const out = simplify(pts, 0.1);
    expect(out.length).toBeGreaterThanOrEqual(3);
  });
});
