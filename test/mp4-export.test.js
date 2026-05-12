import { describe, it, expect } from "vitest";
import { isExportSupported, framePlan } from "../src/services/mp4Export";

describe("isExportSupported", () => {
  it("reports unsupported in jsdom (no WebCodecs)", () => {
    const det = isExportSupported({});
    expect(det.supported).toBe(false);
    expect(det.missing.length).toBeGreaterThan(0);
  });
  it("reports supported when all globals present", () => {
    const det = isExportSupported({ VideoEncoder: 1, VideoFrame: 1, AudioEncoder: 1 });
    expect(det.supported).toBe(true);
    expect(det.missing).toEqual([]);
  });
  it("lists each missing global", () => {
    const det = isExportSupported({ VideoEncoder: 1 });
    expect(det.missing).toContain("VideoFrame");
    expect(det.missing).toContain("AudioEncoder");
    expect(det.missing).not.toContain("VideoEncoder");
  });
});

describe("framePlan", () => {
  it("returns sensible defaults", () => {
    const p = framePlan();
    expect(p.fps).toBe(30);
    expect(p.durationSec).toBe(22);
    expect(p.totalFrames).toBe(660);
    expect(p.frameIntervalMs).toBeCloseTo(33.33, 1);
  });
  it("clamps fps to [1, 60]", () => {
    expect(framePlan({ fps: 0 }).fps).toBe(1);
    expect(framePlan({ fps: 999 }).fps).toBe(60);
  });
  it("clamps duration to [1, 60]", () => {
    expect(framePlan({ durationSec: 0 }).durationSec).toBe(1);
    expect(framePlan({ durationSec: 200 }).durationSec).toBe(60);
  });
  it("computes totalFrames from fps × duration", () => {
    expect(framePlan({ fps: 24, durationSec: 10 }).totalFrames).toBe(240);
  });
});
