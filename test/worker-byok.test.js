/**
 * Worker BYOK and CORS pattern tests.
 *
 * Tests the pure helpers we exported from src/index.js. The full Worker
 * handler test (with a mock fetch event) is out of scope here; we
 * exercise the units that branch on BYOK state and the CORS allowlist.
 */

import { describe, it, expect } from "vitest";
import { isOriginAllowed } from "../workers/yatra-director/src/index.js";

describe("isOriginAllowed (CORS pattern matcher)", () => {
  it("allows exact-match localhost dev origins", () => {
    expect(isOriginAllowed("http://localhost:5173")).toBe(true);
    expect(isOriginAllowed("http://localhost:8787")).toBe(true);
  });

  it("allows *.yatra.pages.dev preview deploys", () => {
    expect(isOriginAllowed("https://abc123.yatra.pages.dev")).toBe(true);
    expect(isOriginAllowed("https://pr-42.yatra.pages.dev")).toBe(true);
    expect(isOriginAllowed("https://main.yatra.pages.dev")).toBe(true);
  });

  it("rejects unknown origins", () => {
    expect(isOriginAllowed("https://evil.example.com")).toBe(false);
    expect(isOriginAllowed("http://yatra.pages.dev")).toBe(false); // wrong protocol
    expect(isOriginAllowed("https://yatra.pages.dev.evil.com")).toBe(false); // suffix attack
  });

  it("returns false for empty / null / undefined", () => {
    expect(isOriginAllowed("")).toBe(false);
    expect(isOriginAllowed(null)).toBe(false);
    expect(isOriginAllowed(undefined)).toBe(false);
  });

  it("accepts a custom pattern set for tests", () => {
    const patterns = [
      "https://custom.example",
      /^https:\/\/[a-z]+\.example$/,
    ];
    expect(isOriginAllowed("https://custom.example", patterns)).toBe(true);
    expect(isOriginAllowed("https://hello.example", patterns)).toBe(true);
    expect(isOriginAllowed("https://other.com", patterns)).toBe(false);
  });

  it("does not allow https://localhost (wrong protocol for localhost entry)", () => {
    expect(isOriginAllowed("https://localhost:5173")).toBe(false);
  });
});

/**
 * BYOK behavior at the handler level. We exercise the Worker's exported
 * `default.fetch` handler with stubbed env + fetch dependencies.
 */
import worker from "../workers/yatra-director/src/index.js";

function makeReq({ method = "POST", path = "/v1/tts", headers = {}, body = {} } = {}) {
  return new Request(`https://w.example${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173", ...headers },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

function captureGoogleTtsFetch() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    // Google TTS response shape: { audioContent: base64string }
    return new Response(
      JSON.stringify({ audioContent: btoa("fake-mp3-bytes") }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  return { calls, fetchImpl };
}

describe("Worker /v1/tts BYOK branching", () => {
  const validBody = {
    tone: "devotional",
    language: "te",
    voiceId: "te-IN-Standard-A",
    text: "నమస్తే",
    tempo: 0.92,
  };

  it("BYOK header present → uses user's key, returns byok-bypass cache header", async () => {
    const { calls, fetchImpl } = captureGoogleTtsFetch();
    const env = {
      GOOGLE_TTS_API_KEY: "OPERATOR-KEY",
      // No BUDGET_KV / TTS_CACHE / RATE_LIMITER / TURNSTILE_SECRET_KEY — all degraded paths.
    };
    // Stub globalThis.fetch for the googleTtsClient call.
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const res = await worker.fetch(
        makeReq({ headers: { "X-Yatra-User-TTS-Key": "USER-KEY" }, body: validBody }),
        env,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Yatra-Cache")).toBe("byok-bypass");
      // Google was called with the USER key, not the operator key.
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain("key=USER-KEY");
      expect(calls[0].url).not.toContain("OPERATOR-KEY");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("no BYOK header → uses operator's env key, normal cache path", async () => {
    const { calls, fetchImpl } = captureGoogleTtsFetch();
    const env = { GOOGLE_TTS_API_KEY: "OPERATOR-KEY" };
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const res = await worker.fetch(makeReq({ body: validBody }), env);
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Yatra-Cache")).toBe("miss"); // no cache binding, first miss
      expect(calls[0].url).toContain("key=OPERATOR-KEY");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("empty-string BYOK header → falls back to operator key", async () => {
    const { calls, fetchImpl } = captureGoogleTtsFetch();
    const env = { GOOGLE_TTS_API_KEY: "OPERATOR-KEY" };
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const res = await worker.fetch(
        makeReq({ headers: { "X-Yatra-User-TTS-Key": "" }, body: validBody }),
        env,
      );
      expect(res.status).toBe(200);
      expect(calls[0].url).toContain("key=OPERATOR-KEY");
      expect(res.headers.get("X-Yatra-Cache")).toBe("miss");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("BYOK with no operator key configured → still works (user pays)", async () => {
    const { calls, fetchImpl } = captureGoogleTtsFetch();
    const env = {}; // no GOOGLE_TTS_API_KEY at all
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const res = await worker.fetch(
        makeReq({ headers: { "X-Yatra-User-TTS-Key": "USER-KEY" }, body: validBody }),
        env,
      );
      expect(res.status).toBe(200);
      expect(calls[0].url).toContain("key=USER-KEY");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("no BYOK, no operator key → 503 tts-not-configured", async () => {
    const env = {};
    const res = await worker.fetch(makeReq({ body: validBody }), env);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.type).toContain("tts-not-configured");
  });

  it("BYOK request bypasses Turnstile gate", async () => {
    const { fetchImpl } = captureGoogleTtsFetch();
    const env = {
      GOOGLE_TTS_API_KEY: "OPERATOR-KEY",
      TURNSTILE_SECRET_KEY: "ts-secret",  // Turnstile is provisioned
    };
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      // No X-Yatra-Turnstile header — would normally 401 turnstile-missing.
      const res = await worker.fetch(
        makeReq({ headers: { "X-Yatra-User-TTS-Key": "USER-KEY" }, body: validBody }),
        env,
      );
      // BYOK bypasses Turnstile, so this should succeed instead of 401.
      expect(res.status).toBe(200);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("non-BYOK request without Turnstile token when Turnstile required → 401", async () => {
    const env = {
      GOOGLE_TTS_API_KEY: "OPERATOR-KEY",
      TURNSTILE_SECRET_KEY: "ts-secret",
    };
    const res = await worker.fetch(makeReq({ body: validBody }), env);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.type).toContain("turnstile-missing");
  });
});
