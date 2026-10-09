/**
 * Living Atlas clock + URL state. Pure helpers, no React.
 *
 * The clock is a local wall-clock `{ date: "YYYY-MM-DD", minutes }` in the
 * region's time zone. It lives in the URL, never in a store:
 *
 *   ?surface=living-atlas&t=2026-10-09T20:32&speed=5m&mode=day
 *
 * There is no `day` parameter: the day tab is the weekday of `t`.
 */
import { WEEKDAYS } from "./schedule.js";

export const SPEEDS = { "1m": 1, "5m": 5, "20m": 20 }; // simulated minutes per real second
export const DEFAULT_SPEED = "5m";
export const DEFAULT_MODE = "day";

const pad = (n) => String(Math.floor(n)).padStart(2, "0");

/** Local wall-clock for `now` in `tz`. */
export function localClock(now, tz) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const g = (type) => Number(parts.find((p) => p.type === type).value);
  return {
    date: `${g("year")}-${pad(g("month"))}-${pad(g("day"))}`,
    minutes: g("hour") * 60 + g("minute") + g("second") / 60,
  };
}

const toUTC = (date) => {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Mon = 0 … Sun = 6 */
export function weekdayOf(date) {
  return (new Date(toUTC(date)).getUTCDay() + 6) % 7;
}

export function addDays(date, n) {
  const d = new Date(toUTC(date) + n * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** The clock as the schedule engine wants it. */
export const engineClock = (c) => ({ weekday: weekdayOf(c.date), minutes: c.minutes });

/** Same time of day on another weekday of the same Mon–Sun week. */
export function shiftToWeekday(clock, weekday) {
  return { date: addDays(clock.date, weekday - weekdayOf(clock.date)), minutes: clock.minutes };
}

/** Advance by simulated minutes, rolling the date at midnight. */
export function advance(clock, deltaMin) {
  let minutes = clock.minutes + deltaMin, date = clock.date;
  while (minutes >= 1440) { minutes -= 1440; date = addDays(date, 1); }
  while (minutes < 0) { minutes += 1440; date = addDays(date, -1); }
  return { date, minutes };
}

export const formatT = (c) => `${c.date}T${pad(c.minutes / 60)}:${pad(c.minutes % 60)}`;

export function parseT(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(str ?? ""));
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  if (Number(h) > 23 || Number(mi) > 59) return null;
  const date = `${y}-${mo}-${d}`;
  if (addDays(date, 0) !== date) return null; // rejects 2026-02-31 and friends
  return { date, minutes: Number(h) * 60 + Number(mi) };
}

export const clockLabel = (c) => ({
  hm: `${pad(c.minutes / 60)}:${pad(c.minutes % 60)}`,
  s: pad((c.minutes * 60) % 60),
  day: WEEKDAYS[weekdayOf(c.date)],
});

/**
 * Read the clock state from a query string. With no usable `t` the surface
 * starts live, on `nowClock`.
 */
export function parseLivingParams(search, nowClock) {
  const q = new URLSearchParams(search);
  const t = parseT(q.get("t"));
  const speed = q.get("speed") in SPEEDS ? q.get("speed") : DEFAULT_SPEED;
  return { clock: t ?? nowClock, live: !t, speed, mode: DEFAULT_MODE };
}

/** Query-string state for the current view. `t` is omitted while live. */
export function livingState({ clock, live, speed, mode = DEFAULT_MODE }) {
  const q = new URLSearchParams();
  if (!live) q.set("t", formatT(clock));
  q.set("speed", speed);
  q.set("mode", mode);
  return q;
}

/** Dot click: open that journey in the Atlas, carrying the clock for the way back. */
export function atlasLink(locationId, state) {
  const q = new URLSearchParams({ surface: "atlas", location: locationId, from: "living-atlas" });
  livingState(state).forEach((v, k) => q.set(k, v));
  return `?${q.toString()}`;
}

/** The Atlas's "Back to the atlas" link: restores the Living Atlas exactly. */
export function backToLivingLink(search) {
  const src = new URLSearchParams(search);
  if (src.get("from") !== "living-atlas") return null;
  const q = new URLSearchParams({ surface: "living-atlas" });
  for (const k of ["t", "speed", "mode"]) if (src.has(k)) q.set(k, src.get(k));
  return `?${q.toString()}`;
}
