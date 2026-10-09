import { describe, it, expect } from "vitest";
import {
  summarize, summaryLine, journeyRows, movingNow, buildGeoJSON, sourcesLine, scheduledRoutes, hhmm,
} from "../src/services/livingAtlas";
import { makeLivingStyle } from "../src/services/livingStyle";
import { LOCATIONS } from "../src/config";

const clock = (weekday, h, m = 0) => ({ weekday, minutes: h * 60 + m });

describe("summarize (derived from the registry, nothing hand-typed)", () => {
  it("counts journeys, timetables and walking paths", () => {
    const s = summarize(LOCATIONS);
    expect(s.journeys).toBe(Object.keys(LOCATIONS).length);
    expect(s.timetabled).toBe(1);
    expect(s.windows).toBe(3);
    expect(s.tz).toBe("Asia/Kolkata");
    expect(summaryLine(s)).toBe("4 journeys · 1 timetabled service · 3 walking paths");
    expect(s.bounds.lonMin).toBeLessThan(s.bounds.lonMax);
  });

  it("is place-agnostic: a registry with another place and zone works unchanged", () => {
    const alps = {
      ski: {
        id: "ski", title: "Valley train", bounds: { latMin: 46, latMax: 47, lonMin: 8, lonMax: 9 },
        origin: { name: "Up", lat: 46.5, lon: 8.1 }, destination: { name: "Down", lat: 46.6, lon: 8.2 },
        landmarks: [],
        routes: [{
          id: "r", waypoints: [{ lat: 46.5, lon: 8.1 }, { lat: 46.6, lon: 8.2 }],
          schedule: { kind: "timetable", tz: "Europe/Zurich", halts: [{ at: "start", dep: "08:00" }, { at: "end", arr: "09:00" }] },
        }],
      },
    };
    expect(summarize(alps).tz).toBe("Europe/Zurich");
    expect(summaryLine(summarize(alps))).toBe("1 journey · 1 timetabled service · 0 walking paths");
    const [row] = journeyRows(alps, clock(2, 8, 30));
    expect(row.isMoving).toBe(true);
    expect(row.sub).toBe("08:00 → 09:00");
    expect(row.pct).toBe(50);
  });

  it("empty and unscheduled registries do not crash", () => {
    expect(summarize({}).bounds).toBeNull();
    expect(summarize({}).tz).toBe("UTC");
    const bare = { a: { id: "a", title: "A", bounds: { latMin: 0, latMax: 1, lonMin: 0, lonMax: 1 }, origin: { lat: 0, lon: 0 }, routes: [{ id: "r", waypoints: [] }] } };
    expect(summarize(bare).tz).toBe("UTC");
    const [row] = journeyRows(bare, clock(0, 9));
    expect(row).toMatchObject({ isMoving: false, sub: "no schedule yet", route: null });
    expect(sourcesLine(row).caveat).toMatch(/No schedule/);
    const g = buildGeoJSON([row], "a");
    expect(g.anchors.features).toHaveLength(1); // plain dot at the origin
  });
});

describe("journeyRows", () => {
  it("one row per registered journey, with live describe text", () => {
    const rows = journeyRows(LOCATIONS, clock(4, 12)); // Friday noon
    expect(rows).toHaveLength(Object.keys(LOCATIONS).length);
    const konkan = rows.find((r) => r.id === "konkan-railway");
    expect(konkan.isMoving).toBe(true);
    expect(konkan.sub).toMatch(/07:05 → 21:35/);
    expect(konkan.pct).toBeGreaterThan(20);
    expect(movingNow(rows)).toBeGreaterThanOrEqual(2);
  });

  it("describes each timetable state", () => {
    const sub = (c) => journeyRows(LOCATIONS, c).find((r) => r.id === "konkan-railway");
    expect(sub(clock(4, 3)).sub).toBe("departs Mumbai CST 07:05");
    expect(sub(clock(4, 23)).sub).toBe("arrived Mangaluru Junction 21:35");
    expect(sub(clock(4, 11, 52)).sub).toMatch(/standing at/);
    expect(sub(clock(4, 11, 52)).isMoving).toBe(true);
    expect(sub(clock(4, 7, 20)).sub).toMatch(/^07:05 → 21:35$|past/);
  });

  it("describes each window state", () => {
    const row = (c) => journeyRows(LOCATIONS, c).find((r) => r.id === "yadagirigutta");
    expect(row(clock(0, 3)).sub).toBe("opens 06:00");
    expect(row(clock(0, 23)).sub).toBe("closed for the day");
    expect(row(clock(0, 6, 30)).sub).toMatch(/1 on the path/);
    expect(row(clock(0, 6, 30)).pct).toBeGreaterThan(0);
    // 3 km at 3 km/h = 60 min walks, 4 departures from 06:00 to 19:30: a gap at 10:00
    expect(row(clock(0, 10)).sub).toBe("between departures");
  });

  it("rest days and empty timetables", () => {
    const cfg = JSON.parse(JSON.stringify(LOCATIONS["konkan-railway"]));
    cfg.routes[0].schedule.days = ["Mon"];
    const [r] = journeyRows({ k: cfg }, clock(3, 12));
    expect(r.sub).toBe("does not run today");
    const win = JSON.parse(JSON.stringify(LOCATIONS["yadagirigutta"]));
    win.routes[0].schedule.days = ["Mon"];
    expect(journeyRows({ y: win }, clock(3, 12))[0].sub).toBe("closed today");
    win.routes[0].schedule.departuresPerDay = 0;
    win.routes[0].schedule.days = undefined;
    expect(journeyRows({ y: win }, clock(3, 12))[0].sub).toBe("no departures today");
  });
});

describe("buildGeoJSON", () => {
  it("draws lines for scheduled routes, movers for moving things, anchors for the rest", () => {
    const rows = journeyRows(LOCATIONS, clock(4, 12));
    const g = buildGeoJSON(rows, "konkan-railway");
    expect(g.lines.features.length).toBeGreaterThanOrEqual(4);
    expect(g.movers.features.some((f) => f.properties.journeyId === "konkan-railway" && f.properties.sel)).toBe(true);
    const moverJourneys = new Set(g.movers.features.map((f) => f.properties.journeyId));
    expect(g.anchors.features.every((f) => !moverJourneys.has(f.properties.journeyId))).toBe(true);
  });

  it("adds a served-stretch overlay (and dims the full line) when a timetable stops short", () => {
    const cfg = JSON.parse(JSON.stringify(LOCATIONS["konkan-railway"]));
    cfg.routes[0].schedule.halts = [{ at: "start", dep: "07:05" }, { landmark: "ratnagiri", arr: "11:50" }];
    const g = buildGeoJSON(journeyRows({ k: cfg }, clock(4, 9)), "k");
    expect(g.lines.features.map((f) => f.properties.role).sort()).toEqual(["full", "served"]);
    expect(g.lines.features[0].properties.dim).toBe(true);
    // a service that starts after the route's own start is also dimmed at the front
    cfg.routes[0].schedule.halts = [{ landmark: "roha", dep: "08:00" }, { at: "end", arr: "20:00" }];
    expect(buildGeoJSON(journeyRows({ k: cfg }, clock(4, 9)), "k").lines.features).toHaveLength(2);
  });

  it("scheduledRoutes and hhmm helpers", () => {
    expect(scheduledRoutes(LOCATIONS)).toHaveLength(4);
    expect(hhmm(425)).toBe("07:05");
    expect(hhmm(1500)).toBe("01:00");
  });
});

describe("sourcesLine", () => {
  it("always says scheduled, not tracked, and labels approximate geometry honestly", () => {
    const row = journeyRows(LOCATIONS, clock(4, 12)).find((r) => r.id === "konkan-railway");
    const s = sourcesLine(row);
    expect(s.caveat).toMatch(/Scheduled, not tracked/);
    expect(s.geometry).toBe("drawn straight between halts");
    expect(s.source.name).toMatch(/PLACEHOLDER/);
    const surveyed = { ...row, geometry: "surveyed" };
    expect(sourcesLine(surveyed).geometry).toBe("surveyed track");
  });
});

describe("makeLivingStyle", () => {
  it("is key-free Sentinel-2 cloudless with its CC-BY attribution", () => {
    const style = makeLivingStyle();
    expect(style.sources.eox.tiles[0]).toContain("tiles.maps.eox.at");
    expect(style.sources.eox.attribution).toMatch(/CC-BY 4\.0/);
    expect(style.layers.map((l) => l.id)).toEqual(["bg", "eox"]);
  });
});
