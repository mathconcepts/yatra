import { describe, it, expect } from "vitest";
import {
  localClock, weekdayOf, addDays, shiftToWeekday, advance, formatT, parseT, clockLabel,
  parseLivingParams, livingState, atlasLink, backToLivingLink, engineClock, SPEEDS,
} from "../src/services/livingClock";

describe("livingClock", () => {
  it("localClock reads wall-clock time in the given zone", () => {
    const c = localClock(new Date("2026-10-09T15:02:16Z"), "Asia/Kolkata"); // +05:30
    expect(c.date).toBe("2026-10-09");
    expect(c.minutes).toBeCloseTo(20 * 60 + 32 + 16 / 60, 3);
    // crossing midnight in the other direction
    expect(localClock(new Date("2026-10-09T23:00:00Z"), "Asia/Kolkata").date).toBe("2026-10-10");
    expect(localClock(new Date("2026-10-09T23:00:00Z"), "Europe/Zurich").date).toBe("2026-10-10");
  });

  it("weekday and date arithmetic", () => {
    expect(weekdayOf("2026-10-09")).toBe(4); // Friday
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftToWeekday({ date: "2026-10-09", minutes: 1232 }, 0)).toEqual({ date: "2026-10-05", minutes: 1232 });
    expect(engineClock({ date: "2026-10-09", minutes: 5 })).toEqual({ weekday: 4, minutes: 5 });
  });

  it("advance rolls the date forward and back", () => {
    expect(advance({ date: "2026-10-09", minutes: 1439 }, 2)).toEqual({ date: "2026-10-10", minutes: 1 });
    expect(advance({ date: "2026-10-09", minutes: 1 }, -2)).toEqual({ date: "2026-10-08", minutes: 1439 });
  });

  it("formats and parses t, rejecting bad values", () => {
    expect(formatT({ date: "2026-10-09", minutes: 1232.7 })).toBe("2026-10-09T20:32");
    expect(parseT("2026-10-09T20:32")).toEqual({ date: "2026-10-09", minutes: 1232 });
    for (const bad of [null, "", "2026-10-09", "2026-10-09T24:00", "2026-10-09T10:60", "2026-02-31T10:00"]) {
      expect(parseT(bad)).toBeNull();
    }
    expect(clockLabel({ date: "2026-10-09", minutes: 1232.5 })).toEqual({ hm: "20:32", s: "30", day: "Fri" });
  });

  it("parseLivingParams: live with defaults when t is absent or bad", () => {
    const now = { date: "2026-10-09", minutes: 10 };
    expect(parseLivingParams("?surface=living-atlas", now)).toEqual({ clock: now, live: true, speed: "5m", mode: "day" });
    expect(parseLivingParams("?t=garbage&speed=99m", now).live).toBe(true);
    const p = parseLivingParams("?t=2026-10-09T20:32&speed=20m", now);
    expect(p).toMatchObject({ live: false, speed: "20m", clock: { date: "2026-10-09", minutes: 1232 } });
  });

  it("round trip: dot click carries the clock, back link restores it", () => {
    const state = { clock: { date: "2026-10-09", minutes: 1232 }, live: false, speed: "1m", mode: "day" };
    const out = atlasLink("konkan-railway", state);
    const q = new URLSearchParams(out);
    expect(q.get("surface")).toBe("atlas");
    expect(q.get("location")).toBe("konkan-railway");
    expect(q.get("from")).toBe("living-atlas");
    const back = new URLSearchParams(backToLivingLink(out));
    expect(back.get("surface")).toBe("living-atlas");
    expect(back.get("t")).toBe("2026-10-09T20:32");
    expect(back.get("speed")).toBe("1m");
    expect(back.get("mode")).toBe("day");
  });

  it("live state omits t, so the way back lands on the live clock", () => {
    const out = atlasLink("x", { clock: { date: "2026-10-09", minutes: 5 }, live: true, speed: "5m" });
    expect(new URLSearchParams(out).has("t")).toBe(false);
    expect(new URLSearchParams(backToLivingLink(out)).has("t")).toBe(false);
    expect(livingState({ clock: { date: "2026-10-09", minutes: 5 }, live: true, speed: "5m" }).get("mode")).toBe("day");
  });

  it("no back link unless the Atlas was opened from the Living Atlas", () => {
    expect(backToLivingLink("?surface=atlas&location=x")).toBeNull();
    expect(Object.keys(SPEEDS)).toEqual(["1m", "5m", "20m"]);
  });
});
