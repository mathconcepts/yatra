import { describe, it, expect } from "vitest";
import {
  SUPPORTED_FORMATS,
  SUPPORTED_ASPECTS,
  aspectToDimensions,
  validateFormat,
  validateAspect,
  exportArtifact,
} from "../src/services/exportRouter";

describe("constants", () => {
  it("exposes supported formats and aspects", () => {
    expect(SUPPORTED_FORMATS).toContain("png");
    expect(SUPPORTED_FORMATS).toContain("mp4");
    expect(SUPPORTED_ASPECTS).toEqual(["9:16", "1:1", "16:9"]);
  });
});

describe("validateFormat", () => {
  it("accepts known formats", () => {
    expect(validateFormat("png")).toBe(true);
    expect(validateFormat("mp4")).toBe(true);
  });
  it("rejects others", () => {
    expect(validateFormat("gif")).toBe(false);
    expect(validateFormat("avif")).toBe(false);
    expect(validateFormat("")).toBe(false);
  });
});

describe("validateAspect", () => {
  it("accepts known aspects", () => {
    expect(validateAspect("9:16")).toBe(true);
    expect(validateAspect("1:1")).toBe(true);
    expect(validateAspect("16:9")).toBe(true);
  });
  it("rejects others", () => {
    expect(validateAspect("4:3")).toBe(false);
    expect(validateAspect("")).toBe(false);
  });
});

describe("aspectToDimensions", () => {
  it("maps 9:16 to portrait video size", () => {
    const d = aspectToDimensions("9:16");
    expect(d.width).toBe(720);
    expect(d.height).toBe(1280);
  });
  it("maps 1:1 to square", () => {
    const d = aspectToDimensions("1:1");
    expect(d.width).toBe(d.height);
  });
  it("maps 16:9 to landscape", () => {
    const d = aspectToDimensions("16:9");
    expect(d.width).toBeGreaterThan(d.height);
  });
  it("defaults to 9:16 for unknown", () => {
    expect(aspectToDimensions("bogus")).toEqual({ width: 720, height: 1280 });
  });
});

describe("exportArtifact", () => {
  it("throws on unsupported format", async () => {
    await expect(exportArtifact({ format: "gif" })).rejects.toThrow(/Unsupported format/);
  });
  it("throws on PNG without canvas", async () => {
    await expect(exportArtifact({ format: "png" })).rejects.toThrow(/No canvas/);
  });
});
