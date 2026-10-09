import { describe, it, expect } from "vitest";
import {
  moversAt, isMoving, parseHHMM, resolveRun, projectOnRoute, walkMinutes, HALT_SNAP_KM,
} from "../src/services/schedule";
import { LOCATIONS } from "../src/config";

// A straight 10 km north-south line near the equator so km maths is easy.
const KM = 1 / 111.195; // degrees of latitude per km
const line = (km, extra = {}) => ({
  id: "r", ...extra,
  waypoints: [
    { name: "A", lat: 0, lon: 0, elev: 0 },
    { name: "B", lat: km * KM, lon: 0, elev: 100 },
  ],
});
const landmarks = [{ id: "mid", name: "Mid", lat: 5 * KM, lon: 0 }];
const MON = 0, SUN = 6;
const at = (weekday, hhmm) => ({ weekday, minutes: parseHHMM(hhmm) });

const timetable = {
  kind: "timetable", tz: "UTC", days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  halts: [
    { at: "start", dep: "08:00" },
    { landmark: "mid", arr: "09:00", dep: "09:10" },
    { at: "end", arr: "10:10" },
  ],
};

describe("moversAt: timetable", () => {
  const route = line(10);
  const run = (clock, sched = timetable) => moversAt(route, sched, clock, landmarks);

  it("before departure: one mover waiting at the start", () => {
    const [m] = run(at(MON, "07:00"));
    expect(m).toMatchObject({ state: "before", progress: 0, lat: 0 });
  });

  it("moving: interpolates by distance between halts", () => {
    const [m] = run(at(MON, "08:30")); // halfway to the 5 km halt
    expect(m.state).toBe("moving");
    expect(m.km).toBeCloseTo(2.5, 2);
    expect(m.progress).toBeCloseTo(0.25, 2);
    expect(isMoving(m)).toBe(true);
  });

  it("held: standing at a halt between arr and dep", () => {
    const [m] = run(at(MON, "09:05"));
    expect(m.state).toBe("held");
    expect(m.km).toBeCloseTo(5, 2);
    expect(isMoving(m)).toBe(true);
  });

  it("after arrival: parked at the end with progress 1", () => {
    const [m] = run(at(MON, "11:00"));
    expect(m).toMatchObject({ state: "arrived", progress: 1 });
    expect(m.km).toBeCloseTo(10, 2);
  });

  it("rest day: not running, nothing moves", () => {
    const [m] = run(at(SUN, "08:30"), { ...timetable, days: ["Mon"] });
    expect(m.state).toBe("rest-day");
    expect(isMoving(m)).toBe(false);
  });

  it("midnight wrap: a run that crosses midnight is alive the next morning", () => {
    const night = {
      ...timetable, days: ["Mon"],
      halts: [{ at: "start", dep: "23:00" }, { landmark: "mid", arr: "23:50", dep: "00:10" }, { at: "end", arr: "01:00" }],
    };
    expect(resolveRun(route, night, landmarks).endMin).toBe(1500);
    const [late] = run(at(MON, "23:30"), night);
    expect(late.state).toBe("moving");
    const [held] = run(at(1, "00:00"), night); // Tuesday 00:00, run began Monday
    expect(held.state).toBe("held");
    const [after] = run(at(1, "00:30"), night);
    expect(after.state).toBe("moving");
    expect(after.km).toBeGreaterThan(5);
    const [done] = run(at(1, "02:00"), night);
    expect(done.state).toBe("rest-day"); // Tuesday is not a running day
  });

  it("last halt short of the geometry's end: never enters the unserved stretch, progress reaches 1", () => {
    const short = { ...timetable, halts: [{ at: "start", dep: "08:00" }, { landmark: "mid", arr: "09:00" }] };
    const [m] = run(at(MON, "08:59"), short);
    expect(m.km).toBeLessThan(5);
    const [done] = run(at(MON, "09:30"), short);
    expect(done).toMatchObject({ state: "arrived", progress: 1 });
    expect(done.km).toBeCloseTo(5, 2);
  });

  it("approximate geometry still animates (the engine does not care)", () => {
    const [m] = moversAt(line(10, { geometry: "approximate" }), timetable, at(MON, "08:30"), landmarks);
    expect(m.state).toBe("moving");
  });

  it("returns nothing without a schedule or for an unknown kind", () => {
    expect(moversAt(route, undefined, at(MON, "08:00"))).toEqual([]);
    expect(moversAt(route, { kind: "mystery" }, at(MON, "08:00"))).toEqual([]);
  });

  it("rejects halts that cannot be bound to the route", () => {
    expect(() => resolveRun(route, { ...timetable, halts: [{ at: "start", dep: "08:00" }, { landmark: "nope", arr: "09:00" }] }, landmarks)).toThrow(/not a landmark/);
    const far = [{ id: "far", name: "Far", lat: 5 * KM, lon: 0.1 }];
    expect(() => resolveRun(route, { ...timetable, halts: [{ at: "start", dep: "08:00" }, { landmark: "far", arr: "09:00" }] }, far)).toThrow(/from r/);
    expect(() => resolveRun(route, { ...timetable, halts: [{ at: "start", dep: "08:00" }] }, landmarks)).toThrow(/two halts/);
    expect(() => resolveRun(route, { ...timetable, halts: [{ at: "start", dep: "08:00" }, { arr: "09:00" }] }, landmarks)).toThrow(/needs/);
    expect(() => resolveRun(route, { ...timetable, halts: [{ at: "end", dep: "08:00" }, { landmark: "mid", arr: "09:00" }] }, landmarks)).toThrow(/order/);
    expect(() => resolveRun(route, { ...timetable, halts: [{ at: "start", dep: "8am" }, { at: "end", arr: "09:00" }] }, landmarks)).toThrow(/unreadable/);
  });
});

describe("moversAt: window", () => {
  // 3 km at 3 km/h: each walk takes 60 minutes.
  const route = line(3);
  const win = (extra) => ({ kind: "window", tz: "UTC", open: "06:00", close: "18:00", paceKmh: 3, departuresPerDay: 7, ...extra });
  const run = (clock, w = win()) => moversAt(route, w, clock);

  it("seven departures, evenly spaced between open and the latest valid start", () => {
    const all = run(at(MON, "06:00"));
    expect(all).toHaveLength(7);
    // latest start is 17:00; step = 11h / 6; at 06:00 only the first has left
    expect(all.filter(isMoving)).toHaveLength(1);
    expect(all[0].state).toBe("moving");
    expect(all[6].state).toBe("before");
  });

  it("tracks each walker's own progress", () => {
    const moving = run(at(MON, "06:30")).filter(isMoving);
    expect(moving).toHaveLength(1);
    expect(moving[0].progress).toBeCloseTo(0.5, 2);
    expect(moving[0].id).toBe("r#0");
  });

  it("queried outside its hours: every walker is before (early) or arrived (late)", () => {
    expect(run(at(MON, "03:00")).every((m) => m.state === "before")).toBe(true);
    expect(run(at(MON, "23:00")).every((m) => m.state === "arrived")).toBe(true);
  });

  it("departuresPerDay: 0 yields no movers (a plain dot)", () => {
    expect(run(at(MON, "10:00"), win({ departuresPerDay: 0 }))).toEqual([]);
  });

  it("a window too short for one walk to finish yields no movers", () => {
    expect(run(at(MON, "06:30"), win({ open: "06:00", close: "06:30" }))).toEqual([]);
  });

  it("declared stats.distanceKm sets the walk time, geometry length is the fallback", () => {
    expect(walkMinutes(route, win())).toBeCloseTo(60, 0);
    expect(walkMinutes({ ...route, stats: { distanceKm: 6 } }, win())).toBe(120);
  });

  it("a single departure leaves at opening time", () => {
    const one = run(at(MON, "06:30"), win({ departuresPerDay: 1 }));
    expect(one).toHaveLength(1);
    expect(one[0].state).toBe("moving");
  });

  it("honours days: a closed day shows rest-day", () => {
    const [m] = run(at(SUN, "10:00"), win({ days: ["Mon"] }));
    expect(m.state).toBe("rest-day");
  });
});

describe("geometry helpers", () => {
  it("projectOnRoute reports distance along and offset from the line", () => {
    const p = projectOnRoute(line(10).waypoints, { lat: 4 * KM, lon: 0.001 });
    expect(p.km).toBeCloseTo(4, 1);
    expect(p.offsetKm).toBeGreaterThan(0.05);
  });
  it("parseHHMM rejects junk", () => {
    expect(parseHHMM("25:00")).toBeNaN();
    expect(parseHHMM("07:5")).toBeNaN();
    expect(parseHHMM(undefined)).toBeNaN();
    expect(parseHHMM("07:05")).toBe(425);
  });
});

describe("committed schedules", () => {
  const scheduled = Object.values(LOCATIONS).flatMap((cfg) =>
    cfg.routes.filter((r) => r.schedule).map((route) => ({ cfg, route })));

  it("the registry carries one timetable and three walk windows", () => {
    expect(scheduled.filter((s) => s.route.schedule.kind === "timetable")).toHaveLength(1);
    expect(scheduled.filter((s) => s.route.schedule.kind === "window")).toHaveLength(3);
  });

  it("every halt resolves, within 300 m of its route (replaces the snap script's CI check)", () => {
    for (const { cfg, route } of scheduled.filter((s) => s.route.schedule.kind === "timetable")) {
      const run = resolveRun(route, route.schedule, cfg.landmarks);
      expect(run.halts.length).toBeGreaterThanOrEqual(2);
      for (const h of route.schedule.halts.filter((x) => x.landmark)) {
        const lm = cfg.landmarks.find((l) => l.id === h.landmark);
        expect(projectOnRoute(route.waypoints, lm).offsetKm).toBeLessThanOrEqual(HALT_SNAP_KM);
      }
    }
  });

  it("every window can fit at least one walk", () => {
    for (const { route } of scheduled.filter((s) => s.route.schedule.kind === "window")) {
      const s = route.schedule;
      const walk = walkMinutes(route, s);
      expect(parseHHMM(s.close) - walk).toBeGreaterThanOrEqual(parseHHMM(s.open));
    }
  });

  it("at any time on a running day, some journey is moving or held", () => {
    for (let h = 5; h <= 21; h++) {
      const any = scheduled.some(({ cfg, route }) =>
        moversAt(route, route.schedule, { weekday: MON, minutes: h * 60 }, cfg.landmarks).some(isMoving));
      expect(any, `nothing moving at ${h}:00`).toBe(true);
    }
  });
});
