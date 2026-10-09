/**
 * Living Atlas view-model. Turns the location registry + a clock into the
 * rows, counts and GeoJSON the surface draws. Pure, and place-agnostic: no
 * place name, country or time zone is written here; all of it is read from
 * the registry.
 */
import {
  moversAt, isMoving, resolveRun, projectOnRoute, cumulativeKm, pointAtKm, parseHHMM,
} from "./schedule.js";

const pad = (n) => String(Math.floor(n)).padStart(2, "0");
export const hhmm = (min) => `${pad((min / 60) % 24)}:${pad(min % 60)}`;

/** Every route that carries a schedule, with the journey it belongs to. */
export function scheduledRoutes(locations) {
  const out = [];
  for (const cfg of Object.values(locations)) {
    for (const route of cfg.routes ?? []) {
      if (route.schedule) out.push({ cfg, route, schedule: route.schedule });
    }
  }
  return out;
}

/** Header counts, map bounds and time zone, all derived from the registry. */
export function summarize(locations) {
  const cfgs = Object.values(locations);
  const sched = scheduledRoutes(locations);
  const b = cfgs.reduce((a, c) => ({
    latMin: Math.min(a.latMin, c.bounds.latMin), latMax: Math.max(a.latMax, c.bounds.latMax),
    lonMin: Math.min(a.lonMin, c.bounds.lonMin), lonMax: Math.max(a.lonMax, c.bounds.lonMax),
  }), { latMin: 90, latMax: -90, lonMin: 180, lonMax: -180 });
  return {
    journeys: cfgs.length,
    timetabled: sched.filter((s) => s.schedule.kind === "timetable").length,
    windows: sched.filter((s) => s.schedule.kind === "window").length,
    bounds: cfgs.length ? b : null,
    tz: sched[0]?.schedule.tz ?? cfgs[0]?.region?.timeZone ?? "UTC",
  };
}

/** "N journeys · X timetabled services · Y walking paths" — nothing hand-typed. */
export function summaryLine(s) {
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return [plural(s.journeys, "journey"), plural(s.timetabled, "timetabled service"), plural(s.windows, "walking path")].join(" · ");
}

function nearestBehind(route, landmarks, km) {
  let best = null;
  for (const lm of landmarks ?? []) {
    const p = projectOnRoute(route.waypoints, lm);
    if (p.offsetKm <= 2 && p.km <= km + 0.01 && (!best || p.km > best.km)) best = { km: p.km, name: lm.name };
  }
  return best?.name;
}

function describe(cfg, route, schedule, movers, clockMin) {
  const first = movers[0];
  if (!first) return { sub: "no departures today", pct: 0 };
  if (schedule.kind === "timetable") {
    const run = resolveRun(route, schedule, cfg.landmarks);
    const startName = cfg.origin?.name ?? "start";
    const endName = cfg.destination?.name ?? "end";
    const span = `${hhmm(run.startMin)} → ${hhmm(run.endMin)}`;
    const sub = {
      "rest-day": "does not run today",
      before: `departs ${startName} ${hhmm(run.startMin)}`,
      arrived: `arrived ${endName} ${hhmm(run.endMin)}`,
      held: `standing at ${nearestBehind(route, cfg.landmarks, first.km) ?? "a halt"}`,
      moving: `${span}${nearestBehind(route, cfg.landmarks, first.km) ? ` · past ${nearestBehind(route, cfg.landmarks, first.km)}` : ""}`,
    }[first.state];
    return { sub, pct: Math.round(first.progress * 100) };
  }
  const walking = movers.filter(isMoving);
  const open = parseHHMM(schedule.open), close = parseHHMM(schedule.close);
  if (movers[0].state === "rest-day") return { sub: "closed today", pct: 0 };
  if (!walking.length) {
    return { sub: clockMin < open ? `opens ${hhmm(open)}` : clockMin >= close ? "closed for the day" : "between departures", pct: 0 };
  }
  const avg = walking.reduce((a, m) => a + m.progress, 0) / walking.length;
  return {
    sub: `walk window ${hhmm(open)}–${hhmm(close)} · ${walking.length} on the path (sample)`,
    pct: Math.round(avg * 100),
  };
}

/**
 * One row per journey. Journeys with no schedule still appear (as a plain
 * dot, under "All") so the registry is the roster.
 */
export function journeyRows(locations, clock) {
  return Object.values(locations).map((cfg) => {
    const routes = (cfg.routes ?? []).filter((r) => r.schedule);
    const movers = [];
    let sub = "no schedule yet", pct = 0, route = null, schedule = null;
    for (const r of routes) {
      const m = moversAt(r, r.schedule, clock, cfg.landmarks);
      movers.push(...m);
      if (!route) {
        route = r; schedule = r.schedule;
        ({ sub, pct } = describe(cfg, r, r.schedule, m, clock.minutes));
      }
    }
    const moving = movers.filter(isMoving);
    return {
      id: cfg.id, title: cfg.title, cfg, route, schedule, movers,
      movingCount: moving.length, isMoving: moving.length > 0, sub, pct,
      geometry: route?.geometry === "surveyed" ? "surveyed" : "approximate",
    };
  });
}

export function movingNow(rows) {
  return rows.reduce((n, r) => n + r.movingCount, 0);
}

const lineOf = (waypoints) => waypoints.map((w) => [w.lon, w.lat]);

/** Slice of the route between two distances, for the served-stretch overlay. */
function slice(waypoints, fromKm, toKm) {
  const cum = cumulativeKm(waypoints);
  const pts = [pointAtKm(waypoints, cum, fromKm)];
  waypoints.forEach((w, i) => { if (cum[i] > fromKm && cum[i] < toKm) pts.push(w); });
  pts.push(pointAtKm(waypoints, cum, toKm));
  return lineOf(pts);
}

/**
 * Three FeatureCollections for the map: full route lines (the served stretch
 * of a timetable is a second, brighter feature so an untravelled stretch
 * reads as dimmed), movers, and one anchor dot per journey.
 */
export function buildGeoJSON(rows, selectedId) {
  const lines = [], movers = [], anchors = [];
  for (const r of rows) {
    const sel = r.id === selectedId;
    if (r.route) {
      let served = null;
      if (r.schedule.kind === "timetable") {
        const { span } = resolveRun(r.route, r.schedule, r.cfg.landmarks);
        if (span.startKm > 0 || span.endKm < span.totalKm) served = slice(r.route.waypoints, span.startKm, span.endKm);
      }
      const props = { journeyId: r.id, color: r.route.color ?? "#ff9d3a", sel, dim: Boolean(served) };
      lines.push({ type: "Feature", properties: { ...props, role: "full" }, geometry: { type: "LineString", coordinates: lineOf(r.route.waypoints) } });
      if (served) lines.push({ type: "Feature", properties: { ...props, role: "served" }, geometry: { type: "LineString", coordinates: served } });
    }
    for (const m of r.movers.filter(isMoving)) {
      movers.push({ type: "Feature", properties: { journeyId: r.id, id: m.id, state: m.state, sel }, geometry: { type: "Point", coordinates: [m.lon, m.lat] } });
    }
    if (!r.isMoving) {
      const at = r.route ? r.route.waypoints[0] : r.cfg.origin;
      anchors.push({ type: "Feature", properties: { journeyId: r.id, sel }, geometry: { type: "Point", coordinates: [at.lon, at.lat] } });
    }
  }
  const fc = (features) => ({ type: "FeatureCollection", features });
  return { lines: fc(lines), movers: fc(movers), anchors: fc(anchors) };
}

/** Sources line for one journey: provenance + the honest caveats. */
export function sourcesLine(row) {
  if (!row.schedule) return { source: null, geometry: "no schedule yet", caveat: "No schedule has been typed in for this journey." };
  const { source } = row.schedule;
  return {
    source,
    geometry: row.geometry === "surveyed" ? "surveyed track" : "drawn straight between halts",
    caveat: "Scheduled, not tracked: a service running late is still drawn on time here.",
  };
}
