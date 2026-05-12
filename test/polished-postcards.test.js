import { describe, it, expect, vi, beforeEach } from "vitest";

// Override the polish-manifest.json import for the test so we can exercise
// both the empty-manifest path (v3.0 starting state) and a populated one.
vi.mock("../polish-manifest.json", () => ({
  default: {
    version: 1,
    entries: {
      "tirupati-tirumala.alipiri-gate": {
        draftHash: "abc",
        polishedHash: "def",
        polished: "Polished alipiri gate text.",
        model: "claude-sonnet-4-7",
        temp: 0,
        promptVersion: "v1",
        promptHash: "xyz",
        timestamp: "2026-05-12T00:00:00Z",
      },
    },
  },
}));

import { polishedBlurb } from "../src/services/polishedPostcards";

describe("polishedBlurb", () => {
  it("returns the polished text when the manifest has an entry", () => {
    expect(polishedBlurb("tirupati-tirumala", "alipiri-gate")).toBe(
      "Polished alipiri gate text."
    );
  });

  it("returns null when the manifest has no entry for the pair", () => {
    expect(polishedBlurb("tirupati-tirumala", "no-such-landmark")).toBe(null);
    expect(polishedBlurb("nonexistent", "alipiri-gate")).toBe(null);
  });

  it("returns null for missing args", () => {
    expect(polishedBlurb(null, "x")).toBe(null);
    expect(polishedBlurb("x", null)).toBe(null);
    expect(polishedBlurb("", "")).toBe(null);
  });
});
