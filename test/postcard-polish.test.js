import { describe, it, expect } from "vitest";
import {
  extractProperNouns,
  diffNewProperNouns,
  wordCount,
} from "../scripts/lib/proper-noun-diff.mjs";
import { shouldPolish } from "../scripts/lib/should-polish.mjs";
import { PROMPT_VERSION, SYSTEM_PROMPT, userPrompt, promptHashInput } from "../scripts/lib/postcard-prompt.mjs";

describe("extractProperNouns", () => {
  it("ignores sentence-initial capitalisation", () => {
    const tokens = extractProperNouns("The pilgrim walks. They climb.");
    expect(tokens).toEqual(new Set());
  });

  it("captures mid-sentence proper nouns", () => {
    const tokens = extractProperNouns("The hill rises above Yadagirigutta town.");
    expect(tokens.has("Yadagirigutta")).toBe(true);
  });

  it("captures multiple proper nouns", () => {
    const tokens = extractProperNouns("Pilgrims cross from Srirangam to the Rock Fort over the Cauvery.");
    expect(tokens.has("Srirangam")).toBe(true);
    expect(tokens.has("Rock")).toBe(true);
    expect(tokens.has("Fort")).toBe(true);
    expect(tokens.has("Cauvery")).toBe(true);
  });

  it("filters common capitalised function words", () => {
    const tokens = extractProperNouns("She walks. And He runs. But They stand.");
    expect(tokens.has("And")).toBe(false);
    expect(tokens.has("But")).toBe(false);
    expect(tokens.has("They")).toBe(false);
  });

  it("returns empty for empty input", () => {
    expect(extractProperNouns("")).toEqual(new Set());
    expect(extractProperNouns(null)).toEqual(new Set());
  });
});

describe("diffNewProperNouns", () => {
  const draft = "The temple of Ranganatha sits on the Cauvery.";

  it("returns empty when polished introduces nothing", () => {
    const polished = "The Ranganatha temple sits on the Cauvery.";
    expect(diffNewProperNouns(draft, polished)).toEqual([]);
  });

  it("flags an invented place", () => {
    const polished = "The temple of Ranganatha sits on the Cauvery near Madurai.";
    expect(diffNewProperNouns(draft, polished)).toContain("Madurai");
  });

  it("flags an invented person", () => {
    const polished = "The Ranganatha temple sits on the Cauvery, blessed by Ramanuja.";
    expect(diffNewProperNouns(draft, polished)).toContain("Ramanuja");
  });

  it("allows the polished to subtract proper nouns", () => {
    const polished = "The temple sits on the river.";
    expect(diffNewProperNouns(draft, polished)).toEqual([]);
  });
});

describe("wordCount", () => {
  it("counts whitespace-split words", () => {
    expect(wordCount("one two three")).toBe(3);
  });
  it("handles empty / whitespace-only", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("   ")).toBe(0);
  });
  it("collapses multiple spaces", () => {
    expect(wordCount("a    b\t\tc")).toBe(3);
  });
});

describe("shouldPolish (religious carve-out)", () => {
  it("polishes a milestone landmark", () => {
    expect(shouldPolish({ type: "milestone", blurb: "abc" })).toBe(true);
  });
  it("polishes a gateway landmark", () => {
    expect(shouldPolish({ type: "gateway", blurb: "abc" })).toBe(true);
  });
  it("polishes a rail station", () => {
    expect(shouldPolish({ type: "station", blurb: "abc" })).toBe(true);
  });
  it("polishes a tunnel", () => {
    expect(shouldPolish({ type: "tunnel", blurb: "abc" })).toBe(true);
  });

  it("SKIPS a shrine", () => {
    expect(shouldPolish({ type: "shrine", blurb: "abc" })).toBe(false);
  });
  it("SKIPS a destination with a ritual (treated as religious)", () => {
    expect(shouldPolish({ type: "destination", blurb: "abc", ritual: "Darshan" })).toBe(false);
  });
  it("ALLOWS a destination without ritual (e.g. Mangaluru Jn)", () => {
    expect(shouldPolish({ type: "destination", blurb: "abc" })).toBe(true);
  });
  it("respects explicit polish:false opt-out", () => {
    expect(shouldPolish({ type: "milestone", blurb: "abc", polish: false })).toBe(false);
  });
  it("SKIPS empty / missing blurb", () => {
    expect(shouldPolish({ type: "milestone", blurb: "" })).toBe(false);
    expect(shouldPolish({ type: "milestone" })).toBe(false);
    expect(shouldPolish(null)).toBe(false);
  });
});

describe("postcard-prompt", () => {
  it("PROMPT_VERSION is set", () => {
    expect(typeof PROMPT_VERSION).toBe("string");
    expect(PROMPT_VERSION.length).toBeGreaterThan(0);
  });

  it("SYSTEM_PROMPT mentions the hard rules", () => {
    expect(SYSTEM_PROMPT).toMatch(/place name/i);
    expect(SYSTEM_PROMPT).toMatch(/60 words/i);
    expect(SYSTEM_PROMPT).toMatch(/new proper nouns/i);
  });

  it("userPrompt embeds the draft", () => {
    expect(userPrompt("hello world")).toContain("hello world");
  });

  it("promptHashInput is deterministic per draft", () => {
    expect(promptHashInput("a")).toBe(promptHashInput("a"));
    expect(promptHashInput("a")).not.toBe(promptHashInput("b"));
  });

  it("promptHashInput changes if PROMPT_VERSION changes", () => {
    // can't mutate the const, but the input should at least include the version string
    expect(promptHashInput("a")).toContain(PROMPT_VERSION);
  });
});
