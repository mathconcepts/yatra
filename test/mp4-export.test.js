import { describe, it, expect, vi } from "vitest";
import { isExportSupported, framePlan, resolveAudioPlan, pickAvcLevelHex, pickAvcCodec } from "../src/services/mp4Export";

describe("pickAvcLevelHex", () => {
  it("uses level 3.1 for 720x1280@30 (the bug we just fixed)", () => {
    expect(pickAvcLevelHex(720, 1280, 30)).toBe("1F");
  });
  it("uses level 3.0 for SD 640x480@30", () => {
    expect(pickAvcLevelHex(640, 480, 30)).toBe("1E");
  });
  it("uses level 4.0 for 1080p@30", () => {
    expect(pickAvcLevelHex(1920, 1080, 30)).toBe("28");
  });
  it("emits a full avc1.42E0XX codec string", () => {
    expect(pickAvcCodec(720, 1280, 30)).toBe("avc1.42E01F");
  });
});

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

describe("resolveAudioPlan", () => {
  it("prefers audioBuffer when both are present (no decode call)", async () => {
    const decodeBlob = vi.fn(async () => ({ sampleRate: 22050, numberOfChannels: 1 }));
    const audioBuffer = { sampleRate: 48000, numberOfChannels: 2 };
    const plan = await resolveAudioPlan({ audioBuffer, audioBlob: {}, decodeBlob });
    expect(plan).toEqual({ buffer: audioBuffer, channels: 2, sampleRate: 48000 });
    expect(decodeBlob).not.toHaveBeenCalled();
  });

  it("decodes audioBlob via the injected decoder when no buffer", async () => {
    const decoded = { sampleRate: 44100, numberOfChannels: 2 };
    const decodeBlob = vi.fn(async () => decoded);
    const plan = await resolveAudioPlan({ audioBlob: { __blob: true }, decodeBlob });
    expect(plan).toEqual({ buffer: decoded, channels: 2, sampleRate: 44100 });
    expect(decodeBlob).toHaveBeenCalledTimes(1);
  });

  it("returns null when neither source is present", async () => {
    expect(await resolveAudioPlan({})).toBeNull();
  });

  it("returns null when audioBlob decoder yields a falsy result", async () => {
    const plan = await resolveAudioPlan({ audioBlob: {}, decodeBlob: async () => null });
    expect(plan).toBeNull();
  });

  it("returns null when audioBuffer is malformed (no sampleRate)", async () => {
    const plan = await resolveAudioPlan({ audioBuffer: { foo: 1 } });
    expect(plan).toBeNull();
  });

  it("defaults to 1 channel when audioBuffer omits numberOfChannels", async () => {
    const plan = await resolveAudioPlan({ audioBuffer: { sampleRate: 48000 } });
    expect(plan.channels).toBe(1);
  });
});
