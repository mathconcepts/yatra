import { describe, it, expect } from "vitest";
import {
  bucketId,
  nextBucketStartMs,
  rolloverState,
  emptyState,
  checkAndConsume,
} from "../workers/yatra-director/rateLimiter.js";

const MIN = 60 * 1000;
const HR = 60 * MIN;
const DAY = 24 * HR;

describe("bucketId / nextBucketStartMs", () => {
  it("bucketId is monotonic and stable inside a window", () => {
    const t0 = 60_000 * 100; // exactly on a minute boundary
    expect(bucketId(t0, MIN)).toBe(bucketId(t0 + MIN - 1, MIN));
    expect(bucketId(t0, MIN)).not.toBe(bucketId(t0 + MIN, MIN));
  });
  it("nextBucketStartMs is the upcoming window edge", () => {
    expect(nextBucketStartMs(0, MIN)).toBe(MIN);
    expect(nextBucketStartMs(MIN, MIN)).toBe(2 * MIN);
    expect(nextBucketStartMs(MIN + 1, MIN)).toBe(2 * MIN);
  });
});

describe("rolloverState", () => {
  it("zeroes counts when a bucket window has moved", () => {
    const s = { minuteBucket: 0, minuteCount: 5, hourBucket: 0, hourCount: 5, dayBucket: 0, dayCount: 5 };
    const out = rolloverState(s, DAY + MIN);
    expect(out.dayCount).toBe(0);
    expect(out.hourCount).toBe(0);
    expect(out.minuteCount).toBe(0);
  });
  it("preserves counts inside the same buckets", () => {
    const now = 60 * MIN; // 1 hour in
    const s = {
      minuteBucket: bucketId(now, MIN), minuteCount: 3,
      hourBucket: bucketId(now, HR), hourCount: 12,
      dayBucket: bucketId(now, DAY), dayCount: 88,
    };
    const out = rolloverState(s, now + 1000); // 1s later, same buckets
    expect(out).toEqual(s);
  });
  it("rolls only the minute bucket when only that moved", () => {
    const now = 30 * MIN;
    const s = {
      minuteBucket: bucketId(now, MIN), minuteCount: 5,
      hourBucket: bucketId(now, HR), hourCount: 20,
      dayBucket: bucketId(now, DAY), dayCount: 80,
    };
    const out = rolloverState(s, now + MIN);
    expect(out.minuteCount).toBe(0);
    expect(out.hourCount).toBe(20);
    expect(out.dayCount).toBe(80);
  });
});

describe("checkAndConsume", () => {
  const limits = { perMinute: 3, perHour: 10, perDay: 50 };

  it("allows under all caps and increments all counters", () => {
    let s = emptyState();
    const r = checkAndConsume(s, 1000, limits);
    expect(r.allowed).toBe(true);
    expect(r.state.minuteCount).toBe(1);
    expect(r.state.hourCount).toBe(1);
    expect(r.state.dayCount).toBe(1);
    expect(r.remaining).toBe(2); // 3 - 1 minute slots
  });

  it("blocks on the minute cap (tightest binding)", () => {
    let s = emptyState();
    const t = 1000;
    for (let i = 0; i < 3; i++) s = checkAndConsume(s, t, limits).state;
    const blocked = checkAndConsume(s, t, limits);
    expect(blocked.allowed).toBe(false);
    expect(blocked.window).toBe("minute");
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("does not consume on a blocked request", () => {
    let s = emptyState();
    const t = 1000;
    for (let i = 0; i < 3; i++) s = checkAndConsume(s, t, limits).state;
    const before = { ...s };
    const blocked = checkAndConsume(s, t, limits);
    expect(blocked.allowed).toBe(false);
    expect(blocked.state).toEqual(before); // counts NOT incremented
  });

  it("rolls over the minute window after 60s", () => {
    let s = emptyState();
    let t = 1000;
    for (let i = 0; i < 3; i++) s = checkAndConsume(s, t, limits).state;
    expect(checkAndConsume(s, t, limits).allowed).toBe(false);
    // jump past the minute boundary
    t = bucketId(t, MIN) * MIN + MIN + 1;
    const after = checkAndConsume(s, t, limits);
    expect(after.allowed).toBe(true);
    expect(after.state.minuteCount).toBe(1);
    expect(after.state.hourCount).toBeGreaterThan(0); // hour bucket still active
  });

  it("blocks on hourly cap when minute is fine", () => {
    let s = emptyState();
    let t = 1000;
    // Saturate the hour by adding 10 requests at minute boundaries.
    for (let i = 0; i < 10; i++) {
      t = bucketId(1000, MIN) * MIN + i * MIN + 1000; // distinct minute buckets
      s = checkAndConsume(s, t, limits).state;
    }
    // 11th attempt within the same hour, fresh minute → blocked by hour.
    t += 100;
    const r = checkAndConsume(s, t, limits);
    expect(r.allowed).toBe(false);
    expect(r.window).toBe("hour");
  });

  it("uses default limits when none provided", () => {
    const r = checkAndConsume(emptyState(), 1000);
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(10); // perMinute default
  });

  it("remaining reflects the tightest window when ALLOWED", () => {
    const r = checkAndConsume(emptyState(), 1000, { perMinute: 10, perHour: 2, perDay: 100 });
    expect(r.window).toBe("hour");
    expect(r.remaining).toBe(1); // hour 2 - 1 consumed
  });

  it("resetAtMs is in the future for the binding window", () => {
    const r = checkAndConsume(emptyState(), 1000, limits);
    expect(r.resetAtMs).toBeGreaterThan(1000);
  });

  it("ten requests across distinct minutes stay under hour cap", () => {
    let s = emptyState();
    let allowed = 0;
    for (let i = 0; i < 10; i++) {
      const t = bucketId(0, MIN) * MIN + i * MIN + 500;
      const r = checkAndConsume(s, t, limits);
      if (r.allowed) { allowed++; s = r.state; }
    }
    expect(allowed).toBe(10);
  });
});
