/**
 * Regression: when the BYOK LLM path fails for "soft" reasons (parse
 * error from a model that refuses to emit JSON, network timeout),
 * directorScript falls back to the deterministic mock script so the
 * user always gets a working render.
 *
 * Hard failures (auth / credits / rate / model-not-found) still
 * surface as user-facing errors — we don't want to silently mask a
 * bad key with a free render.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { generateScript } from "../src/services/directorScript.js";
import { writeUserSettings, clearUserSettings } from "../src/services/userSettings.js";

const CONFIG = {
  id: "test-config",
  title: "Test Journey",
  origin: { name: "A", lat: 10, lon: 78, elev: 0 },
  destination: { name: "B", lat: 11, lon: 79, elev: 0 },
  routes: [{
    id: "main", name: "Main", color: "#000", difficulty: "Easy",
    stats: { distanceKm: 1 },
    waypoints: [
      { lat: 10, lon: 78, elev: 0 },
      { lat: 11, lon: 79, elev: 0 },
    ],
  }],
  landmarks: [
    { id: "midway", name: "Midway", lat: 10.5, lon: 78.5, elev: 0, blurb: "halfway point" },
  ],
};

beforeEach(() => {
  if (typeof window !== "undefined" && window.localStorage) window.localStorage.clear();
  clearUserSettings();
});

describe("generateScript LLM-failure fallback", () => {
  it("falls back to mock script when OpenRouter throws a parse error", async () => {
    // Stub fetch to return prose-only responses on every call (1, 2, 3)
    const proseResponse = {
      ok: true, status: 200,
      headers: { get: () => "application/json" },
      json: async () => ({ choices: [{ message: { content: "Let me analyze this carefully..." } }] }),
      text: async () => "",
    };
    const fetchImpl = vi.fn().mockResolvedValue(proseResponse);
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    writeUserSettings({ openRouterKey: "sk-or-x", openRouterModel: "meta-llama/llama-3.3-70b-instruct:free" });
    try {
      const script = await generateScript({
        config: CONFIG, tone: "devotional", language: "en",
      });
      // Falls back to mock — has scenes built from the config landmarks.
      expect(script.scenes.length).toBeGreaterThan(0);
      expect(script.meta.scriptModel).toBe("mock-fallback");
      expect(script.meta.fallbackFromLlmError).toBeDefined();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("does NOT fall back when OpenRouter returns 401 (bad key)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false, status: 401,
      headers: { get: () => "application/json" },
      json: async () => ({ error: "unauthorized" }),
      text: async () => "unauthorized",
    });
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    writeUserSettings({ openRouterKey: "sk-or-bad" });
    try {
      await expect(
        generateScript({ config: CONFIG, tone: "devotional", language: "en" })
      ).rejects.toMatchObject({ code: "auth" });
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("does NOT fall back when OpenRouter returns 402 (out of credits)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false, status: 402,
      headers: { get: () => "application/json" },
      json: async () => ({ error: "no credits" }),
      text: async () => "no credits",
    });
    const origFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    writeUserSettings({ openRouterKey: "sk-or-x" });
    try {
      await expect(
        generateScript({ config: CONFIG, tone: "devotional", language: "en" })
      ).rejects.toMatchObject({ code: "credits" });
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

import { parseClaudeResponse } from "../src/services/anthropicDirectClient.js";

describe("parseClaudeResponse permissive scene validation", () => {
  const meta = { routeId: "r", tone: "devotional", language: "en", totalDurationS: 30 };

  it("uses captionText as narration when narration is missing", () => {
    const raw = '{"scenes":[{"tStart":0,"tEnd":5,"captionText":"Tirumala"}]}';
    const out = parseClaudeResponse(raw, meta);
    expect(out.scenes[0].narration).toBe("Tirumala");
    expect(out.scenes[0].captionText).toBe("Tirumala");
  });

  it("derives captionText from narration's first 6 words when captionText is missing", () => {
    const raw = '{"scenes":[{"tStart":0,"tEnd":5,"narration":"The sacred path leads to the summit of the hill."}]}';
    const out = parseClaudeResponse(raw, meta);
    expect(out.scenes[0].captionText).toBe("The sacred path leads to the");
  });

  it("uses scene id as last-resort fallback when both fields are missing", () => {
    const raw = '{"scenes":[{"tStart":0,"tEnd":5,"id":"summit"}]}';
    const out = parseClaudeResponse(raw, meta);
    expect(out.scenes[0].narration).toBe("summit");
    expect(out.scenes[0].captionText).toBe("summit");
  });

  it("uses 'Scene N' when nothing else is available", () => {
    const raw = '{"scenes":[{"tStart":0,"tEnd":5}]}';
    const out = parseClaudeResponse(raw, meta);
    expect(out.scenes[0].narration).toBe("Scene 1");
    expect(out.scenes[0].captionText).toBe("Scene 1");
  });

  it("still throws on invalid timing (tEnd <= tStart)", () => {
    const raw = '{"scenes":[{"tStart":5,"tEnd":5,"narration":"x","captionText":"x"}]}';
    expect(() => parseClaudeResponse(raw, meta)).toThrow(/invalid tStart/);
  });
});
