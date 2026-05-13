import { describe, it, expect, vi } from "vitest";
import {
  extractSystemPrompt,
  buildUserPrompt,
  parseClaudeResponse,
  callClaude,
} from "../workers/yatra-director/claudeClient.js";

describe("extractSystemPrompt", () => {
  it("strips preamble above the first --- line", () => {
    const md = [
      "# Devotional",
      "doc above",
      "another doc line",
      "---",
      "You are a narrator.",
      "Be brief.",
    ].join("\n");
    expect(extractSystemPrompt(md)).toBe("You are a narrator.\nBe brief.");
  });
  it("returns whole content when no --- separator", () => {
    expect(extractSystemPrompt("just the prompt")).toBe("just the prompt");
  });
  it("returns empty string for non-string input", () => {
    expect(extractSystemPrompt(null)).toBe("");
    expect(extractSystemPrompt(undefined)).toBe("");
    expect(extractSystemPrompt(42)).toBe("");
  });
});

describe("buildUserPrompt", () => {
  const body = {
    routeId: "yadagiri-gutta",
    routeTitle: "Yadagiri Gutta",
    tone: "devotional",
    language: "te",
    distanceKm: 4.2,
    elevationGainM: 160,
    waypointCount: 142,
    peakMoments: [
      { t: 0, kind: "origin", label: "Steps base" },
      { t: 0.5, kind: "landmark", label: "Mandapam" },
      { t: 1.0, kind: "destination", label: "Summit" },
    ],
    landmarks: [
      { name: "Steps base", facts: ["Trail starts at the base of the hill"], lat: 17.59, lon: 78.94 },
      { name: "Summit", facts: [], lat: 17.6, lon: 78.95 },
    ],
  };

  it("includes route, tone, language, and duration", () => {
    const p = buildUserPrompt(body, { totalDurationS: 30 });
    expect(p).toContain("Yadagiri Gutta (yadagiri-gutta)");
    expect(p).toContain("Tone: devotional");
    expect(p).toContain("Language: te");
    expect(p).toContain("Total duration: 30 seconds");
  });

  it("includes peak moments with numeric t values", () => {
    const p = buildUserPrompt(body);
    expect(p).toMatch(/t=0\.000\s+kind=origin/);
    expect(p).toMatch(/t=0\.500\s+kind=landmark/);
    expect(p).toMatch(/t=1\.000\s+kind=destination/);
  });

  it("calls out empty curated facts so Claude doesn't invent", () => {
    const p = buildUserPrompt(body);
    expect(p).toContain("USE ONLY THESE");
    // Summit landmark has no facts; ensure the no-facts note appears
    expect(p).toContain("no curated facts");
  });

  it("omits landmarks block entirely when none provided", () => {
    const p = buildUserPrompt({ ...body, landmarks: [] });
    expect(p).not.toContain("Curated facts");
  });

  it("rounds elevation gain to integer meters", () => {
    const p = buildUserPrompt({ ...body, elevationGainM: 159.7 });
    expect(p).toContain("Elevation gain: 160 m");
  });

  it("weaves personalContext into the prompt when present", () => {
    const note = "A return to the hill my grandmother walked.";
    const p = buildUserPrompt({ ...body, personalContext: note });
    expect(p).toContain("Pilgrim's note");
    expect(p).toContain(note);
    expect(p).toContain("do NOT invent facts beyond what is stated here");
  });

  it("omits the personal-note block when personalContext is empty or absent", () => {
    expect(buildUserPrompt(body)).not.toContain("Pilgrim's note");
    expect(buildUserPrompt({ ...body, personalContext: "" })).not.toContain("Pilgrim's note");
    expect(buildUserPrompt({ ...body, personalContext: "   " })).not.toContain("Pilgrim's note");
  });

  it("truncates a long personalContext at 500 chars", () => {
    const long = "x".repeat(600);
    const p = buildUserPrompt({ ...body, personalContext: long });
    // Block exists with truncated content (500 x's, not 600)
    expect(p).toContain("Pilgrim's note");
    expect(p).toContain("x".repeat(500));
    expect(p).not.toContain("x".repeat(501));
  });
});

describe("parseClaudeResponse", () => {
  const meta = { routeId: "r", tone: "devotional", language: "te", totalDurationS: 30 };
  const valid = JSON.stringify({
    scenes: [
      { id: "origin", tStart: 0, tEnd: 4, narration: "ఆరంభం", captionText: "ఆరంభం", captionStyle: "headline" },
      { id: "summit", tStart: 4, tEnd: 30, narration: "శిఖరం", captionText: "శిఖరం" },
    ],
  });

  it("parses valid JSON", () => {
    const out = parseClaudeResponse(valid, meta);
    expect(out.scenes).toHaveLength(2);
    expect(out.scenes[0].narration).toBe("ఆరంభం");
    expect(out.routeId).toBe("r");
    expect(out.meta.scriptModel).toBeTruthy();
    expect(out.meta.totalDurationS).toBe(30);
  });

  it("strips ```json fences when present", () => {
    const fenced = "```json\n" + valid + "\n```";
    const out = parseClaudeResponse(fenced, meta);
    expect(out.scenes).toHaveLength(2);
  });

  it("defaults captionStyle to subtitle when missing", () => {
    const out = parseClaudeResponse(valid, meta);
    expect(out.scenes[1].captionStyle).toBe("subtitle");
  });

  it("throws on empty body", () => {
    expect(() => parseClaudeResponse("", meta)).toThrow(/empty/);
    expect(() => parseClaudeResponse("   ", meta)).toThrow(/empty/);
  });

  it("throws on non-JSON", () => {
    expect(() => parseClaudeResponse("not a json", meta)).toThrow(/non-JSON/);
  });

  it("throws when scenes missing", () => {
    expect(() => parseClaudeResponse(JSON.stringify({}), meta)).toThrow(/scenes/);
    expect(() => parseClaudeResponse(JSON.stringify({ scenes: [] }), meta)).toThrow(/scenes/);
  });

  it("throws when scene has invalid tStart/tEnd", () => {
    const bad = JSON.stringify({ scenes: [{ id: "x", tStart: 5, tEnd: 5, narration: "a", captionText: "a" }] });
    expect(() => parseClaudeResponse(bad, meta)).toThrow(/tStart\/tEnd/);
  });

  it("throws when narration is missing", () => {
    const bad = JSON.stringify({ scenes: [{ id: "x", tStart: 0, tEnd: 4, narration: "", captionText: "a" }] });
    expect(() => parseClaudeResponse(bad, meta)).toThrow(/narration/);
  });

  it("computes wordCount", () => {
    const out = parseClaudeResponse(valid, meta);
    expect(out.meta.wordCount).toBe(2);
  });
});

describe("callClaude", () => {
  const body = {
    routeId: "r",
    routeTitle: "R",
    tone: "devotional",
    language: "te",
    peakMoments: [{ t: 0, kind: "origin", label: "Start" }],
    landmarks: [],
    waypointCount: 1,
  };
  const validResponse = {
    content: [{
      type: "text",
      text: JSON.stringify({
        scenes: [
          { id: "origin", tStart: 0, tEnd: 30, narration: "ఆరంభం", captionText: "ఆరంభం", captionStyle: "headline" },
        ],
      }),
    }],
  };

  it("returns parsed scenes on 200", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => validResponse,
    }));
    const out = await callClaude({
      apiKey: "sk-test",
      systemPrompt: "be brief",
      body,
      fetchImpl,
    });
    expect(out.scenes).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["X-API-Key"]).toBe("sk-test");
    expect(init.headers["anthropic-version"]).toBeTruthy();
    const bodyJson = JSON.parse(init.body);
    expect(bodyJson.system).toBe("be brief");
    expect(bodyJson.messages[0].role).toBe("user");
  });

  it("throws code=auth when no apiKey", async () => {
    await expect(callClaude({ body, fetchImpl: async () => ({}) })).rejects.toMatchObject({ code: "auth" });
  });

  it("throws code=auth on 401", async () => {
    const fetchImpl = async () => ({ ok: false, status: 401, text: async () => "unauth" });
    await expect(callClaude({ apiKey: "sk", systemPrompt: "p", body, fetchImpl })).rejects.toMatchObject({ code: "auth" });
  });

  it("throws code=rate on 429", async () => {
    const fetchImpl = async () => ({ ok: false, status: 429, text: async () => "rate" });
    await expect(callClaude({ apiKey: "sk", systemPrompt: "p", body, fetchImpl })).rejects.toMatchObject({ code: "rate" });
  });

  it("throws code=parse on 500", async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, text: async () => "boom" });
    await expect(callClaude({ apiKey: "sk", systemPrompt: "p", body, fetchImpl })).rejects.toMatchObject({ code: "parse" });
  });

  it("throws code=timeout on AbortError", async () => {
    const fetchImpl = async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    };
    await expect(callClaude({ apiKey: "sk", systemPrompt: "p", body, fetchImpl, timeoutMs: 10 })).rejects.toMatchObject({ code: "timeout" });
  });

  it("joins multiple text content blocks", async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          { type: "text", text: '{"scenes":[' },
          { type: "text", text: '{"id":"x","tStart":0,"tEnd":30,"narration":"a","captionText":"a"}' },
          { type: "text", text: "]}" },
        ],
      }),
    });
    const out = await callClaude({ apiKey: "sk", systemPrompt: "p", body, fetchImpl });
    expect(out.scenes).toHaveLength(1);
  });
});
