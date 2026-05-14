import { describe, it, expect } from "vitest";
import { getSystemPrompt, extractSystemPrompt } from "../src/services/directorPrompts.js";

describe("getSystemPrompt", () => {
  it("returns the devotional prompt", () => {
    const p = getSystemPrompt("devotional");
    expect(p).toContain("unobtrusive narrator");
  });

  it("returns the explorer prompt", () => {
    const p = getSystemPrompt("explorer");
    expect(p).toContain("curious, attentive narrator");
  });

  it("returns the poetic prompt", () => {
    const p = getSystemPrompt("poetic");
    expect(p).toContain("lyrical narrator");
  });

  it("returns the historical prompt", () => {
    const p = getSystemPrompt("historical");
    expect(p).toContain("measured, factual narrator");
  });

  it("falls back to devotional + tone hint for unknown tones (no throw)", () => {
    const p = getSystemPrompt("nostalgic"); // not in catalog yet
    expect(p).toContain('Tone register: "nostalgic"');
    expect(p).toContain("unobtrusive narrator");
  });
});

describe("extractSystemPrompt", () => {
  it("strips everything up to the first --- line", () => {
    const md = "# Title\n\nDocs here\n\n---\n\nThe real prompt";
    expect(extractSystemPrompt(md)).toBe("The real prompt");
  });

  it("returns trimmed input when no --- exists", () => {
    expect(extractSystemPrompt("  Just a prompt  ")).toBe("Just a prompt");
  });

  it("returns empty string for non-string input", () => {
    expect(extractSystemPrompt(null)).toBe("");
    expect(extractSystemPrompt(undefined)).toBe("");
  });
});
