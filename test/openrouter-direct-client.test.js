import { describe, it, expect, vi } from "vitest";
import { callOpenRouterDirect, rawCallOpenRouter } from "../src/services/openRouterDirectClient.js";
import {
  OPENROUTER_MODELS,
  isOpenRouterModelId,
  findOpenRouterModel,
} from "../src/services/openRouterCatalog.js";

describe("openRouterCatalog", () => {
  it("ships a non-empty curated list", () => {
    expect(OPENROUTER_MODELS.length).toBeGreaterThan(4);
  });

  it("includes at least one free model", () => {
    expect(OPENROUTER_MODELS.some((m) => m.tier === "free")).toBe(true);
  });

  it("isOpenRouterModelId accepts provider/model slugs", () => {
    expect(isOpenRouterModelId("anthropic/claude-3.5-sonnet")).toBe(true);
    expect(isOpenRouterModelId("meta-llama/llama-3.3-70b-instruct:free")).toBe(true);
    expect(isOpenRouterModelId("openai/gpt-4o")).toBe(true);
  });

  it("isOpenRouterModelId rejects non-slug strings", () => {
    expect(isOpenRouterModelId("claude")).toBe(false);
    expect(isOpenRouterModelId("")).toBe(false);
    expect(isOpenRouterModelId(null)).toBe(false);
  });

  it("findOpenRouterModel resolves a catalog entry by id", () => {
    expect(findOpenRouterModel("anthropic/claude-3.5-sonnet")?.label).toBe("Claude 3.5 Sonnet");
    expect(findOpenRouterModel("nope/nope")).toBe(null);
  });
});

describe("callOpenRouterDirect", () => {
  const body = {
    routeId: "r", routeTitle: "R", tone: "devotional", language: "en",
    peakMoments: [{ t: 0, kind: "origin", label: "x" }],
  };
  const systemPrompt = "You are a narrator.";

  function mockResponse({ status = 200, json, text = "" } = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => json,
      text: async () => text,
    };
  }

  function openAiContent(narrationJson) {
    return { choices: [{ message: { content: narrationJson } }] };
  }

  it("posts to openrouter.ai with Bearer auth + Referer + Title", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({
      json: openAiContent('{"scenes":[{"tStart":0,"tEnd":4,"narration":"x","captionText":"x"}]}'),
    }));
    await callOpenRouterDirect({ apiKey: "sk-or-x", systemPrompt, body, fetchImpl });
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(opts.headers["Authorization"]).toBe("Bearer sk-or-x");
    expect(opts.headers["HTTP-Referer"]).toBeDefined();
    expect(opts.headers["X-Title"]).toBe("Yatra Director");
  });

  it("uses the supplied model id or the default", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({
      json: openAiContent('{"scenes":[{"tStart":0,"tEnd":4,"narration":"x","captionText":"x"}]}'),
    }));
    await callOpenRouterDirect({ apiKey: "sk-or-x", model: "openai/gpt-4o-mini", systemPrompt, body, fetchImpl });
    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(sent.model).toBe("openai/gpt-4o-mini");
    expect(sent.messages[0].role).toBe("system");
    expect(sent.messages[1].role).toBe("user");
  });

  it("throws code='auth' when no key", async () => {
    await expect(callOpenRouterDirect({ systemPrompt, body })).rejects.toMatchObject({ code: "auth" });
  });

  it("maps 401 to code='auth'", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ status: 401, text: "bad key" }));
    await expect(
      callOpenRouterDirect({ apiKey: "sk-or-x", systemPrompt, body, fetchImpl })
    ).rejects.toMatchObject({ code: "auth" });
  });

  it("maps 404 with 'No endpoints found' to code='model-not-found'", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({
      status: 404,
      text: '{"error":{"message":"No endpoints found for some/old-model","code":404}}',
    }));
    await expect(
      callOpenRouterDirect({ apiKey: "sk-or-x", model: "some/old-model", systemPrompt, body, fetchImpl })
    ).rejects.toMatchObject({ code: "model-not-found" });
  });

  it("maps 402 to code='credits'", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ status: 402, text: "out of credits" }));
    await expect(
      callOpenRouterDirect({ apiKey: "sk-or-x", systemPrompt, body, fetchImpl })
    ).rejects.toMatchObject({ code: "credits" });
  });

  it("maps 429 to code='rate'", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ status: 429, text: "slow down" }));
    await expect(
      callOpenRouterDirect({ apiKey: "sk-or-x", systemPrompt, body, fetchImpl })
    ).rejects.toMatchObject({ code: "rate" });
  });

  it("returns parsed scenes on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({
      json: openAiContent('{"scenes":[{"tStart":0,"tEnd":5,"narration":"hi","captionText":"hi","captionStyle":"headline"}]}'),
    }));
    const out = await callOpenRouterDirect({ apiKey: "sk-or-x", systemPrompt, body, fetchImpl });
    expect(out.scenes).toHaveLength(1);
    expect(out.scenes[0].narration).toBe("hi");
  });

  it("throws code='parse' when upstream returns empty content", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({ json: { choices: [{ message: { content: "" } }] } }));
    await expect(
      callOpenRouterDirect({ apiKey: "sk-or-x", systemPrompt, body, fetchImpl })
    ).rejects.toMatchObject({ code: "parse" });
  });
});

describe("rawCallOpenRouter — multi-shape response handling", () => {
  function mockResponse({ status = 200, json } = {}) {
    return { ok: status >= 200 && status < 300, status, json: async () => json, text: async () => "" };
  }

  it("reads choices[0].message.content (standard chat shape)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({
      json: { choices: [{ message: { content: "hello" } }] },
    }));
    const out = await rawCallOpenRouter({
      apiKey: "k", systemPrompt: "s", userPrompt: "u", fetchImpl,
    });
    expect(out.text).toBe("hello");
  });

  it("falls back to message.reasoning for reasoning models", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({
      json: { choices: [{ message: { content: "", reasoning: "thought process" } }] },
    }));
    const out = await rawCallOpenRouter({
      apiKey: "k", systemPrompt: "s", userPrompt: "u", fetchImpl,
    });
    expect(out.text).toBe("thought process");
  });

  it("falls back to tool_calls arguments", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({
      json: {
        choices: [{
          message: {
            content: "",
            tool_calls: [{ function: { arguments: '{"x":1}' } }],
          },
        }],
      },
    }));
    const out = await rawCallOpenRouter({
      apiKey: "k", systemPrompt: "s", userPrompt: "u", fetchImpl,
    });
    expect(out.text).toBe('{"x":1}');
  });

  it("falls back to choices[0].text for completions-style models", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({
      json: { choices: [{ text: "completion text", message: {} }] },
    }));
    const out = await rawCallOpenRouter({
      apiKey: "k", systemPrompt: "s", userPrompt: "u", fetchImpl,
    });
    expect(out.text).toBe("completion text");
  });

  it("returns empty string (not error) when every field is missing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(mockResponse({
      json: { choices: [{ message: {} }] },
    }));
    const out = await rawCallOpenRouter({
      apiKey: "k", systemPrompt: "s", userPrompt: "u", fetchImpl,
    });
    expect(out.text).toBe("");
    // Caller (Test or Director) decides what to do with empty text.
  });
});
