import { describe, it, expect, vi } from "vitest";
import {
  buildUserPrompt,
  parseClaudeResponse,
  callAnthropicDirect,
} from "../src/services/anthropicDirectClient.js";

describe("buildUserPrompt (browser-direct mirror)", () => {
  const body = {
    routeId: "yadagiri-gutta",
    routeTitle: "Yadagiri Gutta",
    tone: "devotional",
    language: "te",
    distanceKm: 4.2,
    elevationGainM: 160,
    waypointCount: 142,
    peakMoments: [
      { t: 0, kind: "origin", label: "Base" },
      { t: 1, kind: "destination", label: "Summit" },
    ],
    landmarks: [],
  };

  it("includes route, tone, language", () => {
    const p = buildUserPrompt(body);
    expect(p).toContain("Yadagiri Gutta (yadagiri-gutta)");
    expect(p).toContain("Tone: devotional");
    expect(p).toContain("Language: te");
  });

  it("weaves personalContext when present", () => {
    const p = buildUserPrompt({ ...body, personalContext: "First trip with my newborn." });
    expect(p).toContain("Pilgrim's note");
    expect(p).toContain("First trip with my newborn.");
  });

  it("omits personal-note block when empty", () => {
    expect(buildUserPrompt({ ...body, personalContext: "" })).not.toContain("Pilgrim's note");
    expect(buildUserPrompt({ ...body, personalContext: "  " })).not.toContain("Pilgrim's note");
    expect(buildUserPrompt(body)).not.toContain("Pilgrim's note");
  });
});

describe("parseClaudeResponse (browser-direct mirror)", () => {
  const meta = { routeId: "r", tone: "devotional", language: "te", totalDurationS: 30 };

  it("parses a valid scenes payload", () => {
    const raw = JSON.stringify({
      scenes: [
        { id: "origin", tStart: 0, tEnd: 4, narration: "ఆరంభం", captionText: "ఆరంభం", captionStyle: "headline" },
      ],
    });
    const out = parseClaudeResponse(raw, meta);
    expect(out.scenes).toHaveLength(1);
    expect(out.meta.via).toBe("browser-direct");
  });

  it("strips ```json fences", () => {
    const raw = "```json\n" + JSON.stringify({ scenes: [{ tStart: 0, tEnd: 4, narration: "x", captionText: "x" }] }) + "\n```";
    const out = parseClaudeResponse(raw, meta);
    expect(out.scenes).toHaveLength(1);
  });

  it("throws on empty body", () => {
    expect(() => parseClaudeResponse("", meta)).toThrow(/empty body/);
  });

  it("throws on malformed JSON", () => {
    expect(() => parseClaudeResponse("{not", meta)).toThrow(/non-JSON/);
  });

  it("throws on missing scenes", () => {
    expect(() => parseClaudeResponse('{"hello": 1}', meta)).toThrow(/missing scenes/);
  });

  it("throws on bad scene timing", () => {
    const raw = JSON.stringify({ scenes: [{ tStart: 4, tEnd: 4, narration: "x", captionText: "x" }] });
    expect(() => parseClaudeResponse(raw, meta)).toThrow(/invalid tStart/);
  });
});

describe("callAnthropicDirect", () => {
  const body = {
    routeId: "r", routeTitle: "R", tone: "devotional", language: "te",
    peakMoments: [{ t: 0, kind: "origin", label: "x" }],
  };
  const systemPrompt = "You are a narrator.";

  function mockResponse({ status = 200, json, text = "" }) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => json,
      text: async () => text,
    };
  }

  it("posts to api.anthropic.com with the BYOK headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({
      status: 200,
      json: { content: [{ type: "text", text: '{"scenes":[{"tStart":0,"tEnd":4,"narration":"x","captionText":"x"}]}' }] },
    }));
    await callAnthropicDirect({ apiKey: "sk-ant-x", systemPrompt, body, fetchImpl });
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(opts.headers["X-API-Key"]).toBe("sk-ant-x");
    expect(opts.headers["anthropic-version"]).toBe("2023-06-01");
    expect(opts.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
  });

  it("throws code='auth' when no key", async () => {
    await expect(callAnthropicDirect({ systemPrompt, body })).rejects.toMatchObject({ code: "auth" });
  });

  it("maps 401 to code='auth'", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ status: 401, text: "bad key" }));
    await expect(
      callAnthropicDirect({ apiKey: "sk-x", systemPrompt, body, fetchImpl })
    ).rejects.toMatchObject({ code: "auth" });
  });

  it("maps 429 to code='rate'", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ status: 429, text: "slow down" }));
    await expect(
      callAnthropicDirect({ apiKey: "sk-x", systemPrompt, body, fetchImpl })
    ).rejects.toMatchObject({ code: "rate" });
  });

  it("maps CORS-flavored TypeError to code='cors'", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      callAnthropicDirect({ apiKey: "sk-x", systemPrompt, body, fetchImpl })
    ).rejects.toMatchObject({ code: "cors" });
  });

  it("maps AbortError to code='timeout'", async () => {
    const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
    const fetchImpl = vi.fn().mockRejectedValue(abortErr);
    await expect(
      callAnthropicDirect({ apiKey: "sk-x", systemPrompt, body, fetchImpl, timeoutMs: 5 })
    ).rejects.toMatchObject({ code: "timeout" });
  });

  it("returns parsed scenes on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({
      status: 200,
      json: { content: [{ type: "text", text: '{"scenes":[{"tStart":0,"tEnd":5,"narration":"hi","captionText":"hi","captionStyle":"headline"}]}' }] },
    }));
    const out = await callAnthropicDirect({ apiKey: "sk-x", systemPrompt, body, fetchImpl });
    expect(out.scenes).toHaveLength(1);
    expect(out.meta.via).toBe("browser-direct");
  });
});
