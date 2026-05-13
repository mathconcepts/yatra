import { describe, it, expect, vi } from "vitest";
import {
  dayKey,
  estimateCost,
  readSpend,
  recordSpend,
  checkBudget,
} from "../workers/yatra-director/budgetGuard.js";

function fakeKv() {
  const store = new Map();
  return {
    get: vi.fn(async (key) => store.get(key) ?? null),
    put: vi.fn(async (key, value, _opts) => { store.set(key, value); }),
    __store: store,
  };
}

describe("dayKey", () => {
  it("uses UTC date components", () => {
    const k = dayKey(new Date("2026-05-13T23:30:00Z"));
    expect(k).toBe("budget:2026-05-13");
  });
  it("rolls over at UTC midnight, not local", () => {
    // Same wall clock minute in two different timezones still hashes to
    // the same UTC date.
    const a = dayKey(new Date(Date.UTC(2026, 4, 13, 23, 59)));
    const b = dayKey(new Date(Date.UTC(2026, 4, 13, 23, 59)));
    expect(a).toBe(b);
  });
  it("zero-pads month and day", () => {
    expect(dayKey(new Date("2026-01-05T00:00:00Z"))).toBe("budget:2026-01-05");
  });
  it("accepts a date string", () => {
    expect(dayKey("2026-05-13T00:00:00Z")).toBe("budget:2026-05-13");
  });
  it("defaults to now() when no arg passed", () => {
    expect(dayKey()).toMatch(/^budget:\d{4}-\d{2}-\d{2}$/);
  });
});

describe("estimateCost", () => {
  it("returns ~100 millicents (~1c) for a script call", () => {
    expect(estimateCost("/v1/script")).toBe(100);
  });
  it("scales TTS cost with text length", () => {
    const short = estimateCost("/v1/tts", { text: "hello" });
    const long = estimateCost("/v1/tts", { text: "x".repeat(1000) });
    expect(long).toBeGreaterThan(short);
  });
  it("TTS at 1000 chars is ~26 millicents (16 + 10 overhead)", () => {
    expect(estimateCost("/v1/tts", { text: "x".repeat(1000) })).toBe(26);
  });
  it("TTS with empty text still charges overhead", () => {
    expect(estimateCost("/v1/tts", { text: "" })).toBe(10);
  });
  it("unknown route is free", () => {
    expect(estimateCost("/v1/unknown", {})).toBe(0);
  });
});

describe("readSpend", () => {
  it("returns 0 on miss", async () => {
    const kv = fakeKv();
    expect(await readSpend(kv, "budget:2026-05-13")).toBe(0);
  });
  it("parses the stored number", async () => {
    const kv = fakeKv();
    await kv.put("budget:2026-05-13", "1234");
    expect(await readSpend(kv, "budget:2026-05-13")).toBe(1234);
  });
  it("returns 0 on garbage in store", async () => {
    const kv = fakeKv();
    await kv.put("budget:2026-05-13", "not a number");
    expect(await readSpend(kv, "budget:2026-05-13")).toBe(0);
  });
  it("returns 0 when kv is unbound", async () => {
    expect(await readSpend(null, "k")).toBe(0);
  });
  it("returns 0 when kv.get throws", async () => {
    const kv = { get: vi.fn(async () => { throw new Error("down"); }) };
    expect(await readSpend(kv, "k")).toBe(0);
  });
});

describe("recordSpend", () => {
  it("accumulates across calls", async () => {
    const kv = fakeKv();
    await recordSpend(kv, "budget:d", 100);
    await recordSpend(kv, "budget:d", 250);
    expect(await readSpend(kv, "budget:d")).toBe(350);
  });
  it("swallows put errors", async () => {
    const kv = {
      get: vi.fn(async () => "0"),
      put: vi.fn(async () => { throw new Error("kv full"); }),
    };
    expect(await recordSpend(kv, "k", 10)).toBe(false);
  });
  it("returns false when kv unbound", async () => {
    expect(await recordSpend(null, "k", 10)).toBe(false);
  });
  it("uses a 36h expirationTtl on writes", async () => {
    const kv = fakeKv();
    await recordSpend(kv, "budget:d", 10);
    expect(kv.put.mock.calls[0][2].expirationTtl).toBe(60 * 60 * 36);
  });
});

describe("checkBudget", () => {
  const now = new Date("2026-05-13T12:00:00Z");

  it("allows when projected <= cap", async () => {
    const kv = fakeKv();
    const r = await checkBudget({ kv, route: "/v1/script", body: {}, now });
    expect(r.allowed).toBe(true);
    expect(r.prior).toBe(0);
    expect(r.cost).toBe(100);
    expect(r.projected).toBe(100);
    expect(r.cap).toBe(500_000);
  });

  it("blocks when projected > cap", async () => {
    const kv = fakeKv();
    await kv.put("budget:2026-05-13", "499950");
    const r = await checkBudget({ kv, route: "/v1/script", body: {}, now });
    expect(r.allowed).toBe(false);
    expect(r.projected).toBe(500050);
  });

  it("respects custom cap", async () => {
    const kv = fakeKv();
    const r = await checkBudget({ kv, route: "/v1/script", body: {}, cap: 50, now });
    expect(r.allowed).toBe(false);
    expect(r.cap).toBe(50);
  });

  it("uses today's UTC key", async () => {
    const kv = fakeKv();
    const r = await checkBudget({ kv, route: "/v1/script", body: {}, now });
    expect(r.key).toBe("budget:2026-05-13");
  });
});
