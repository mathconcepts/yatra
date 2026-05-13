import { describe, it, expect, vi } from "vitest";
import {
  sha256Hex,
  buildScriptCacheKey,
  buildTtsCacheKey,
  getCached,
  putCached,
} from "../workers/yatra-director/idempotencyCache.js";

function fakeKv() {
  const store = new Map();
  return {
    get: vi.fn(async (key, type) => {
      const v = store.get(key);
      if (v === undefined) return null;
      if (type === "arrayBuffer") return v;
      if (type === "json") return JSON.parse(v);
      return v;
    }),
    put: vi.fn(async (key, value, _opts) => {
      store.set(key, value);
    }),
    __store: store,
  };
}

describe("sha256Hex", () => {
  it("produces the known sha256 of an empty string", async () => {
    const h = await sha256Hex("");
    expect(h).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
  it("produces the known sha256 of 'abc'", async () => {
    const h = await sha256Hex("abc");
    expect(h).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("is deterministic across calls", async () => {
    const a = await sha256Hex("yatra");
    const b = await sha256Hex("yatra");
    expect(a).toBe(b);
  });
  it("changes when input changes", async () => {
    const a = await sha256Hex("yatra");
    const b = await sha256Hex("yatra ");
    expect(a).not.toBe(b);
  });
});

describe("buildScriptCacheKey", () => {
  it("is stable for identical inputs", async () => {
    const k1 = await buildScriptCacheKey({ routeId: "yadagiri", tone: "devotional", language: "te", durationS: 30 });
    const k2 = await buildScriptCacheKey({ routeId: "yadagiri", tone: "devotional", language: "te", durationS: 30 });
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^script:[0-9a-f]{64}$/);
  });
  it("differs when route differs", async () => {
    const k1 = await buildScriptCacheKey({ routeId: "yadagiri", tone: "devotional", language: "te" });
    const k2 = await buildScriptCacheKey({ routeId: "tirumala", tone: "devotional", language: "te" });
    expect(k1).not.toBe(k2);
  });
  it("differs when language differs", async () => {
    const te = await buildScriptCacheKey({ routeId: "yadagiri", tone: "devotional", language: "te" });
    const hi = await buildScriptCacheKey({ routeId: "yadagiri", tone: "devotional", language: "hi" });
    expect(te).not.toBe(hi);
  });
  it("rejects missing fields", async () => {
    await expect(buildScriptCacheKey({ routeId: "x", tone: "y" })).rejects.toThrow(/language/);
  });
});

describe("buildTtsCacheKey", () => {
  it("does not include raw text in the key (text is hashed first)", async () => {
    const k = await buildTtsCacheKey({ voiceId: "te-IN-Standard-A", tempo: 0.92, text: "secret narration text", language: "te" });
    expect(k).not.toContain("secret narration");
    expect(k).toMatch(/^tts:[0-9a-f]{64}$/);
  });
  it("differs when text differs by one character", async () => {
    const a = await buildTtsCacheKey({ voiceId: "v", tempo: 1, text: "hello", language: "en" });
    const b = await buildTtsCacheKey({ voiceId: "v", tempo: 1, text: "hellO", language: "en" });
    expect(a).not.toBe(b);
  });
  it("rejects missing fields", async () => {
    await expect(buildTtsCacheKey({ voiceId: "v", text: "x" })).rejects.toThrow(/language/);
    await expect(buildTtsCacheKey({ text: "x", language: "te" })).rejects.toThrow(/voiceId/);
  });
});

describe("getCached / putCached", () => {
  it("writes and reads JSON values", async () => {
    const kv = fakeKv();
    await putCached(kv, "script:abc", { scenes: [{ id: "x" }] }, { as: "json" });
    const out = await getCached(kv, "script:abc", { as: "json" });
    expect(out).toEqual({ scenes: [{ id: "x" }] });
  });

  it("writes and reads ArrayBuffer values", async () => {
    const kv = fakeKv();
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    await putCached(kv, "tts:xyz", bytes, { as: "arrayBuffer" });
    const out = await getCached(kv, "tts:xyz", { as: "arrayBuffer" });
    expect(out).toBe(bytes);
  });

  it("returns null on miss", async () => {
    const kv = fakeKv();
    expect(await getCached(kv, "missing")).toBeNull();
  });

  it("returns null when kv is unbound (no kv namespace)", async () => {
    expect(await getCached(null, "k")).toBeNull();
    expect(await getCached(undefined, "k")).toBeNull();
  });

  it("returns false from put when kv is unbound", async () => {
    expect(await putCached(null, "k", {})).toBe(false);
  });

  it("swallows kv.get errors and returns null", async () => {
    const kv = { get: vi.fn(async () => { throw new Error("kv down"); }) };
    expect(await getCached(kv, "k")).toBeNull();
  });

  it("swallows kv.put errors and returns false", async () => {
    const kv = { put: vi.fn(async () => { throw new Error("kv full"); }) };
    expect(await putCached(kv, "k", {})).toBe(false);
  });

  it("uses 30-day TTL by default for script keys", async () => {
    const kv = fakeKv();
    await putCached(kv, "script:abc", { x: 1 });
    const opts = kv.put.mock.calls[0][2];
    expect(opts.expirationTtl).toBe(60 * 60 * 24 * 30);
  });

  it("respects explicit ttlS override", async () => {
    const kv = fakeKv();
    await putCached(kv, "tts:abc", new Uint8Array(1).buffer, { as: "arrayBuffer", ttlS: 60 });
    expect(kv.put.mock.calls[0][2].expirationTtl).toBe(60);
  });
});
