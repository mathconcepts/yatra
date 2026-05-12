import { describe, it, expect, beforeEach } from "vitest";
import { pickSurface } from "../src/components/SurfaceRouter";

describe("pickSurface", () => {
  it("returns atlas for landscape desktop (1280x800)", () => {
    expect(pickSurface(1280, 800, null, null)).toBe("atlas");
  });

  it("returns reels for portrait phone (375x812)", () => {
    expect(pickSurface(375, 812, null, null)).toBe("reels");
  });

  it("returns reels for iPad portrait (820x1180) — aspect-ratio routing", () => {
    expect(pickSurface(820, 1180, null, null)).toBe("reels");
  });

  it("returns atlas for foldable unfolded landscape (1180x820)", () => {
    expect(pickSurface(1180, 820, null, null)).toBe("atlas");
  });

  it("returns reels for small-min-dim landscape (1024x600) — netbook / split-screen", () => {
    expect(pickSurface(1024, 600, null, null)).toBe("reels");
  });

  it("URL override beats viewport heuristic", () => {
    expect(pickSurface(1280, 800, "reels", null)).toBe("reels");
    expect(pickSurface(375, 812, "atlas", null)).toBe("atlas");
  });

  it("stored preference beats viewport heuristic but loses to URL", () => {
    expect(pickSurface(1280, 800, null, "reels")).toBe("reels");
    expect(pickSurface(1280, 800, "atlas", "reels")).toBe("atlas");
  });

  it("ignores garbage values", () => {
    expect(pickSurface(1280, 800, "garbage", "garbage")).toBe("atlas");
    expect(pickSurface(375, 812, "garbage", "garbage")).toBe("reels");
  });

  it("returns atlas as safe default for unknown viewport", () => {
    expect(pickSurface(0, 0, null, null)).toBe("atlas");
    expect(pickSurface(undefined, undefined, null, null)).toBe("atlas");
  });

  it("composer override beats viewport (v3.1)", () => {
    expect(pickSurface(1280, 800, "composer", null)).toBe("composer");
    expect(pickSurface(375, 812, "composer", null)).toBe("composer");
  });

  it("composer stored preference beats viewport (v3.1)", () => {
    expect(pickSurface(1280, 800, null, "composer")).toBe("composer");
  });
});
