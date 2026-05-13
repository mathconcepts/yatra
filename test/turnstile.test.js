import { describe, it, expect, vi } from "vitest";
import {
  parseTurnstileResponse,
  verifyTurnstileToken,
} from "../workers/yatra-director/turnstile.js";

describe("parseTurnstileResponse", () => {
  it("returns ok=true on success", () => {
    const r = parseTurnstileResponse({ success: true, hostname: "yatra.local", action: "submit", challenge_ts: "2026-05-13T00:00:00Z" });
    expect(r.ok).toBe(true);
    expect(r.errorCodes).toEqual([]);
    expect(r.hostname).toBe("yatra.local");
  });
  it("returns ok=false with error codes on rejection", () => {
    const r = parseTurnstileResponse({ success: false, "error-codes": ["invalid-input-response", "timeout-or-duplicate"] });
    expect(r.ok).toBe(false);
    expect(r.errorCodes).toContain("invalid-input-response");
    expect(r.errorCodes).toContain("timeout-or-duplicate");
  });
  it("handles missing/malformed JSON cleanly", () => {
    expect(parseTurnstileResponse(null).ok).toBe(false);
    expect(parseTurnstileResponse(null).errorCodes).toContain("malformed-response");
    expect(parseTurnstileResponse({}).ok).toBe(false);
  });
  it("survives missing optional fields", () => {
    const r = parseTurnstileResponse({ success: true });
    expect(r.ok).toBe(true);
    expect(r.hostname).toBeNull();
    expect(r.action).toBeNull();
  });
});

describe("verifyTurnstileToken", () => {
  it("posts form-encoded body to siteverify with secret+token+remoteip", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    }));
    const out = await verifyTurnstileToken({
      token: "tok",
      secret: "sek",
      remoteIp: "1.2.3.4",
      fetchImpl,
    });
    expect(out.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("/turnstile/v0/siteverify");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const body = new URLSearchParams(init.body);
    expect(body.get("secret")).toBe("sek");
    expect(body.get("response")).toBe("tok");
    expect(body.get("remoteip")).toBe("1.2.3.4");
  });

  it("returns ok=false (does not throw) when token is rejected", async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: false, "error-codes": ["timeout-or-duplicate"] }),
    });
    const out = await verifyTurnstileToken({ token: "tok", secret: "sek", fetchImpl });
    expect(out.ok).toBe(false);
    expect(out.errorCodes).toContain("timeout-or-duplicate");
  });

  it("throws code=missing-token when token absent", async () => {
    await expect(verifyTurnstileToken({ secret: "sek", fetchImpl: async () => ({}) }))
      .rejects.toMatchObject({ code: "missing-token" });
  });

  it("throws code=missing-secret when secret absent", async () => {
    await expect(verifyTurnstileToken({ token: "tok", fetchImpl: async () => ({}) }))
      .rejects.toMatchObject({ code: "missing-secret" });
  });

  it("throws code=timeout when fetch aborts", async () => {
    const fetchImpl = async () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    };
    await expect(verifyTurnstileToken({ token: "t", secret: "s", fetchImpl, timeoutMs: 5 }))
      .rejects.toMatchObject({ code: "timeout" });
  });

  it("throws code=network on non-2xx siteverify response", async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
    await expect(verifyTurnstileToken({ token: "t", secret: "s", fetchImpl }))
      .rejects.toMatchObject({ code: "network" });
  });

  it("throws code=network on transport failure", async () => {
    const fetchImpl = async () => { throw new Error("ECONNRESET"); };
    await expect(verifyTurnstileToken({ token: "t", secret: "s", fetchImpl }))
      .rejects.toMatchObject({ code: "network" });
  });

  it("omits remoteip when not provided", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ success: true }) }));
    await verifyTurnstileToken({ token: "t", secret: "s", fetchImpl });
    const body = new URLSearchParams(fetchImpl.mock.calls[0][1].body);
    expect(body.has("remoteip")).toBe(false);
  });
});
