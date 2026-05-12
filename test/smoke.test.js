import { describe, it, expect } from "vitest";

// Sanity test for the Vitest bootstrap (Slice 0.5).
// Confirms the test framework runs, jsdom is available, and the
// jest-dom matchers from setup.js are wired up.
describe("smoke", () => {
  it("runs vitest with jsdom", () => {
    const el = document.createElement("div");
    el.textContent = "yatra";
    document.body.appendChild(el);
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent("yatra");
  });
});
