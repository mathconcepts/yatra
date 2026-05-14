import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildHeaders,
  buildUrl,
  mapErrorBody,
  request,
  HEADER_TTS_KEY,
  HEADER_TURNSTILE,
} from "../src/services/directorClient.js";
import { writeUserSettings } from "../src/services/userSettings.js";

beforeEach(() => {
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.clear();
  }
});

describe("buildHeaders", () => {
  it("always sets Content-Type", () => {
    const h = buildHeaders({ settings: {} });
    expect(h["Content-Type"]).toBe("application/json");
  });

  it("attaches Turnstile token when provided", () => {
    const h = buildHeaders({ settings: {}, turnstileToken: "ts-token-abc" });
    expect(h[HEADER_TURNSTILE]).toBe("ts-token-abc");
  });

  it("omits Turnstile when token is empty / nullish", () => {
    expect(buildHeaders({ settings: {} })[HEADER_TURNSTILE]).toBeUndefined();
    expect(buildHeaders({ settings: {}, turnstileToken: "" })[HEADER_TURNSTILE]).toBeUndefined();
    expect(buildHeaders({ settings: {}, turnstileToken: null })[HEADER_TURNSTILE]).toBeUndefined();
  });

  it("attaches BYOK TTS key only when keyType === 'tts' AND key is set", () => {
    expect(buildHeaders({ settings: { googleTtsKey: "AIza-x" }, keyType: "tts" })[HEADER_TTS_KEY]).toBe("AIza-x");
    expect(buildHeaders({ settings: { googleTtsKey: "AIza-x" }, keyType: "script" })[HEADER_TTS_KEY]).toBeUndefined();
    expect(buildHeaders({ settings: {}, keyType: "tts" })[HEADER_TTS_KEY]).toBeUndefined();
  });

  it("never attaches an Anthropic header (BYOK bypasses Worker)", () => {
    const h = buildHeaders({ settings: { anthropicKey: "sk-ant-x" }, keyType: "script" });
    expect(JSON.stringify(h)).not.toContain("Anthropic");
    expect(JSON.stringify(h)).not.toContain("sk-ant-x");
  });

  it("falls back to readUserSettings when settings not passed", () => {
    writeUserSettings({ googleTtsKey: "AIza-stored" });
    const h = buildHeaders({ keyType: "tts" });
    expect(h[HEADER_TTS_KEY]).toBe("AIza-stored");
  });
});

describe("buildUrl", () => {
  it("joins env URL + path", () => {
    expect(buildUrl("/v1/script", "https://w.example")).toBe("https://w.example/v1/script");
  });

  it("strips a trailing slash from base", () => {
    expect(buildUrl("/v1/tts", "https://w.example/")).toBe("https://w.example/v1/tts");
  });

  it("adds a leading slash to path when missing", () => {
    expect(buildUrl("v1/script", "https://w.example")).toBe("https://w.example/v1/script");
  });

  it("user override wins over env", () => {
    writeUserSettings({ workerUrl: "https://my.worker" });
    expect(buildUrl("/v1/tts", "https://default")).toBe("https://my.worker/v1/tts");
  });

  it("throws config error when neither is set", () => {
    expect(() => buildUrl("/v1/script", "")).toThrowError(/Worker URL/);
    try { buildUrl("/v1/script"); } catch (e) { expect(e.code).toBe("config"); }
  });
});

describe("mapErrorBody", () => {
  it("extracts slug from RFC-7807 type URL", () => {
    const e = mapErrorBody(401, {
      type: "https://yatra/errors/turnstile-missing",
      title: "Turnstile required",
      detail: "Header absent",
    });
    expect(e.code).toBe("turnstile-missing");
    expect(e.status).toBe(401);
    expect(e.message).toContain("Turnstile required");
    expect(e.message).toContain("Header absent");
  });

  it("falls back to 'unknown' code when body is not an RFC-7807 doc", () => {
    const e = mapErrorBody(500, "Internal error");
    expect(e.code).toBe("unknown");
    expect(e.status).toBe(500);
  });

  it("handles null body without throwing", () => {
    const e = mapErrorBody(500, null);
    expect(e.code).toBe("unknown");
    expect(e.message).toContain("Director request failed");
  });
});

describe("request", () => {
  function mockResponse({ status = 200, json, ab, contentType = "application/json" } = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (h) => (h.toLowerCase() === "content-type" ? contentType : null) },
      json: async () => json,
      arrayBuffer: async () => ab || new ArrayBuffer(0),
    };
  }

  it("calls fetch with the assembled URL + headers + body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ json: { ok: true } }));
    await request({
      path: "/v1/script",
      body: { hello: "world" },
      envUrl: "https://w.example",
      turnstileToken: "ts-abc",
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://w.example/v1/script");
    expect(opts.method).toBe("POST");
    expect(opts.headers[HEADER_TURNSTILE]).toBe("ts-abc");
    expect(JSON.parse(opts.body)).toEqual({ hello: "world" });
  });

  it("returns parsed JSON on 2xx", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ json: { scenes: [1, 2] } }));
    const out = await request({ path: "/v1/script", body: {}, envUrl: "https://w", fetchImpl });
    expect(out).toEqual({ scenes: [1, 2] });
  });

  it("returns binary wrapper on non-JSON 2xx (e.g., MP3 from /v1/tts)", async () => {
    const ab = new ArrayBuffer(4);
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ ab, contentType: "audio/mpeg" }));
    const out = await request({ path: "/v1/tts", body: {}, envUrl: "https://w", fetchImpl });
    expect(out._binary).toBe(true);
    expect(out.buffer).toBe(ab);
    expect(out.contentType).toBe("audio/mpeg");
  });

  it("throws mapErrorBody Error on non-2xx", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({
      status: 429,
      json: { type: "https://yatra/errors/rate-limited", title: "Slow down", detail: "1/min" },
    }));
    await expect(
      request({ path: "/v1/script", body: {}, envUrl: "https://w", fetchImpl })
    ).rejects.toMatchObject({ code: "rate-limited", status: 429 });
  });

  it("maps AbortError to code='abort'", async () => {
    const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
    const fetchImpl = vi.fn().mockRejectedValue(abortErr);
    await expect(
      request({ path: "/v1/script", body: {}, envUrl: "https://w", fetchImpl })
    ).rejects.toMatchObject({ code: "abort" });
  });

  it("maps other transport failures to code='network'", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("connect ECONNREFUSED"));
    await expect(
      request({ path: "/v1/script", body: {}, envUrl: "https://w", fetchImpl })
    ).rejects.toMatchObject({ code: "network" });
  });

  it("throws code='config' when no Worker URL is resolvable", async () => {
    const fetchImpl = vi.fn();
    await expect(
      request({ path: "/v1/script", body: {}, envUrl: "", fetchImpl })
    ).rejects.toMatchObject({ code: "config" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
