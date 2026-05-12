import { describe, it, expect } from "vitest";
import { isAudioEncodeSupported, framesForBuffer, decodeAudioBlob } from "../src/services/audioEncode";

describe("isAudioEncodeSupported", () => {
  it("reports unsupported in jsdom", () => {
    const det = isAudioEncodeSupported({});
    expect(det.supported).toBe(false);
    expect(det.missing).toContain("AudioEncoder");
  });
  it("reports supported when globals are present", () => {
    const det = isAudioEncodeSupported({ AudioEncoder: 1, AudioData: 1, AudioContext: 1 });
    expect(det.supported).toBe(true);
  });
  it("accepts webkitAudioContext as a fallback", () => {
    const det = isAudioEncodeSupported({ AudioEncoder: 1, AudioData: 1, webkitAudioContext: 1 });
    expect(det.supported).toBe(true);
  });
});

describe("framesForBuffer", () => {
  it("returns [] for invalid input", () => {
    expect(framesForBuffer(0, 48000)).toEqual([]);
    expect(framesForBuffer(-100, 48000)).toEqual([]);
    expect(framesForBuffer(NaN, 48000)).toEqual([]);
    expect(framesForBuffer(1000, 0)).toEqual([]);
  });

  it("splits a buffer into 1024-sample frames", () => {
    const plan = framesForBuffer(48000, 48000); // 1 second at 48kHz
    // 48000 / 1024 = 46.875 → 47 frames, last is partial
    expect(plan).toHaveLength(47);
    expect(plan[0].sampleStart).toBe(0);
    expect(plan[0].sampleCount).toBe(1024);
    expect(plan[46].sampleCount).toBeLessThanOrEqual(1024);
  });

  it("computes timestamps in microseconds from sample rate", () => {
    const plan = framesForBuffer(2048, 48000);
    expect(plan[0].timestampUs).toBe(0);
    // 1024 / 48000 sec ≈ 21333 us
    expect(plan[1].timestampUs).toBeGreaterThan(21000);
    expect(plan[1].timestampUs).toBeLessThan(21500);
  });
});

describe("decodeAudioBlob", () => {
  it("returns null for null input", async () => {
    expect(await decodeAudioBlob(null)).toBe(null);
  });
  it("returns null for non-blob input", async () => {
    expect(await decodeAudioBlob({})).toBe(null);
  });
  it("returns null when AudioContext is unavailable (jsdom)", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    expect(await decodeAudioBlob(blob)).toBe(null);
  });
});
