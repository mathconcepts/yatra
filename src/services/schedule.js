/**
 * Living Atlas schedule engine. Pure: no DOM, no clock, no map.
 *
 * `moversAt(route, schedule, clock, landmarks)` answers "where is everything
 * on this route right now?" for the two schedule kinds in config/schema.js:
 *
 *   timetable  one timetabled run (a train, a tour) with halts bound to the
 *              route by landmark id, interpolated by distance between halts.
 *   window     evenly spaced walks between `open` and the latest start that
 *              still finishes by `close`, at `paceKmh` over the route length.
 *
 * `clock` is the local wall-clock at the schedule's tz:
 *   { weekday: 0..6 (Mon = 0), minutes: 0..1440 (fractional ok) }
 *
 * Positions are scheduled, never tracked.
 */
import { distanceKm } from "../utils/route.js";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY = 1440;
export const HALT_SNAP_KM = 0.3; // a halt must sit within 300 m of its route

export function parseHHMM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? ""));
  if (!m) return NaN;
  const h = Number(m[1]), min = Number(m[2]);
  return h > 23 || min > 59 ? NaN : h * 60 + min;
}

/** Cumulative haversine distance (km) at each waypoint. */
export function cumulativeKm(waypoints) {
  const cum = [0];
  for (let i = 1; i < waypoints.length; i++) {
    cum.push(cum[i - 1] + distanceKm(waypoints[i - 1], waypoints[i]));
  }
  return cum;
}

export function routeLengthKm(route) {
  const cum = cumulativeKm(route.waypoints);
  return cum[cum.length - 1];
}

/** Position `km` along the waypoints (clamped), linear between waypoints. */
export function pointAtKm(waypoints, cum, km) {
  const total = cum[cum.length - 1];
  const d = Math.max(0, Math.min(total, km));
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1] < d) i++;
  const span = cum[i + 1] - cum[i];
  const f = span === 0 ? 0 : (d - cum[i]) / span;
  const a = waypoints[i], b = waypoints[i + 1];
  return {
    lon: a.lon + (b.lon - a.lon) * f,
    lat: a.lat + (b.lat - a.lat) * f,
    elev: (a.elev ?? 0) + ((b.elev ?? 0) - (a.elev ?? 0)) * f,
  };
}

/**
 * Nearest point on the polyline to `point`: { km: distance along the route,
 * offsetKm: how far `point` is from the line }. Local flat-earth maths per
 * segment, which is accurate to well under a metre at these scales.
 */
export function projectOnRoute(waypoints, point) {
  const cum = cumulativeKm(waypoints);
  const kmLat = 110.57, kmLon = (lat) => 111.32 * Math.cos((lat * Math.PI) / 180);
  let best = { km: 0, offsetKm: Infinity };
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i], b = waypoints[i + 1];
    const k = kmLon(point.lat);
    const ax = (a.lon - point.lon) * k, ay = (a.lat - point.lat) * kmLat;
    const bx = (b.lon - point.lon) * k, by = (b.lat - point.lat) * kmLat;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const f = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const off = Math.hypot(ax + dx * f, ay + dy * f);
    if (off < best.offsetKm) best = { km: cum[i] + (cum[i + 1] - cum[i]) * f, offsetKm: off };
  }
  return best;
}

/**
 * Bind a timetable's halts to the route: distance along the route plus
 * absolute minutes. Times that wrap past midnight keep counting (a halt at
 * 00:20 after one at 23:50 is 1460 + 20). Throws on a halt that cannot be
 * bound or whose order contradicts the route.
 */
export function resolveRun(route, schedule, landmarks = []) {
  const cum = cumulativeKm(route.waypoints);
  const total = cum[cum.length - 1];
  const halts = schedule.halts ?? [];
  if (halts.length < 2) throw new Error(`schedule on ${route.id} needs at least two halts`);

  let offset = 0, prev = -Infinity, prevKm = -Infinity;
  const out = halts.map((h, idx) => {
    let km, name;
    if (h.at === "start") { km = 0; name = route.waypoints[0].name; }
    else if (h.at === "end") { km = total; name = route.waypoints[route.waypoints.length - 1].name; }
    else if (h.landmark) {
      const lm = landmarks.find((l) => l.id === h.landmark);
      if (!lm) throw new Error(`halt "${h.landmark}" on ${route.id} is not a landmark of this location`);
      const p = projectOnRoute(route.waypoints, lm);
      if (p.offsetKm > HALT_SNAP_KM) {
        throw new Error(`halt "${h.landmark}" is ${(p.offsetKm * 1000).toFixed(0)} m from ${route.id}, limit is ${HALT_SNAP_KM * 1000} m`);
      }
      km = p.km; name = lm.name;
    } else throw new Error(`halt ${idx} on ${route.id} needs "landmark" or "at"`);

    if (km < prevKm - 1e-9) throw new Error(`halts on ${route.id} are out of route order at "${h.landmark ?? h.at}"`);
    prevKm = km;

    const lift = (hhmm) => {
      let v = parseHHMM(hhmm) + offset;
      while (v < prev) { offset += DAY; v += DAY; }
      prev = v;
      return v;
    };
    const first = idx === 0, last = idx === halts.length - 1;
    const arrRaw = first ? undefined : h.arr ?? h.dep;
    const depRaw = last ? undefined : h.dep ?? h.arr;
    const arr = arrRaw === undefined ? undefined : lift(arrRaw);
    const dep = depRaw === undefined ? undefined : lift(depRaw);
    if ((arr !== undefined && Number.isNaN(arr)) || (dep !== undefined && Number.isNaN(dep))) {
      throw new Error(`halt ${idx} on ${route.id} has an unreadable time`);
    }
    return { km, name, arr: first ? dep : arr, dep: last ? arr : dep };
  });

  return {
    halts: out,
    startMin: out[0].dep,
    endMin: out[out.length - 1].arr,
    span: { startKm: out[0].km, endKm: out[out.length - 1].km, totalKm: total },
  };
}

/**
 * How long one walk takes. The declared `stats.distanceKm` wins over the
 * drawn geometry, because approximate lines are routinely shorter than the
 * real path; geometry length is the fallback.
 */
export function walkMinutes(route, schedule) {
  const km = route.stats?.distanceKm ?? routeLengthKm(route);
  return (km / schedule.paceKmh) * 60;
}

function mover(route, cum, id, km, state, progress) {
  const p = pointAtKm(route.waypoints, cum, km);
  return { id, routeId: route.id, ...p, km, progress, state };
}

function timetableAt(route, schedule, clock, landmarks) {
  const run = resolveRun(route, schedule, landmarks);
  const cum = cumulativeKm(route.waypoints);
  const { startKm, endKm } = run.span;
  const days = schedule.days ?? WEEKDAYS;
  const runsToday = days.includes(WEEKDAYS[clock.weekday]);
  const runsYesterday = days.includes(WEEKDAYS[(clock.weekday + 6) % 7]);

  const at = (t) => {
    const H = run.halts;
    let km = endKm, state = "moving";
    for (let k = 0; k < H.length; k++) {
      if (k > 0 && t >= H[k].arr && t < H[k].dep) { km = H[k].km; state = "held"; break; }
      if (k < H.length - 1 && t >= H[k].dep && t < H[k + 1].arr) {
        const f = (t - H[k].dep) / (H[k + 1].arr - H[k].dep);
        km = H[k].km + (H[k + 1].km - H[k].km) * f;
        break;
      }
    }
    const span = endKm - startKm;
    return mover(route, cum, route.id, km, state, span === 0 ? 1 : (km - startKm) / span);
  };

  // A run that crosses midnight is still alive the next morning.
  if (runsYesterday && run.endMin > DAY) {
    const t = clock.minutes + DAY;
    if (t >= run.startMin && t < run.endMin) return [at(t)];
  }
  if (!runsToday) return [mover(route, cum, route.id, startKm, "rest-day", 0)];
  const t = clock.minutes;
  if (t < run.startMin) return [mover(route, cum, route.id, startKm, "before", 0)];
  if (t >= run.endMin) return [mover(route, cum, route.id, endKm, "arrived", 1)];
  return [at(t)];
}

function windowAt(route, schedule, clock) {
  const days = schedule.days ?? WEEKDAYS;
  const cum = cumulativeKm(route.waypoints);
  const total = cum[cum.length - 1];
  const open = parseHHMM(schedule.open), close = parseHHMM(schedule.close);
  const n = schedule.departuresPerDay ?? 0;
  const walk = walkMinutes(route, schedule);
  const latest = close - walk;
  if (n <= 0 || !(latest >= open)) return []; // no departures: a plain dot
  if (!days.includes(WEEKDAYS[clock.weekday])) return [mover(route, cum, `${route.id}#0`, 0, "rest-day", 0)];

  const step = n > 1 ? (latest - open) / (n - 1) : 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    const start = open + i * step, t = clock.minutes;
    const id = `${route.id}#${i}`;
    if (t < start) out.push(mover(route, cum, id, 0, "before", 0));
    else if (t >= start + walk) out.push(mover(route, cum, id, total, "arrived", 1));
    else {
      const progress = (t - start) / walk;
      out.push(mover(route, cum, id, total * progress, "moving", progress));
    }
  }
  return out;
}

/**
 * @returns {Array<{id,routeId,lon,lat,elev,km,progress,state}>}
 *   state: before | moving | held | arrived | rest-day
 */
export function moversAt(route, schedule, clock, landmarks = []) {
  if (!schedule) return [];
  if (schedule.kind === "timetable") return timetableAt(route, schedule, clock, landmarks);
  if (schedule.kind === "window") return windowAt(route, schedule, clock);
  return [];
}

export const isMoving = (m) => m.state === "moving" || m.state === "held";
