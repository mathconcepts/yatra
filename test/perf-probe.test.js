import { describe, it, expect } from "vitest";
import { scoreFrames, clampTerrain } from "../src/services/perfProbe";

describe("scoreFrames", () => {
  it("returns zero-shape for empty input", () => {
    const r = scoreFrames([]);
    expect(r.medianMs).toBe(0);
    expect(r.p95Ms).toBe(0);
    expect(r.shouldDisableTerrain).toBe(false);
    expect(r.sampleCount).toBe(0);
  });

  it("computes median for odd-length input", () => {
    const r = scoreFrames(Array.from({ length: 31 }, (_, i) => i + 1)); // 1..31
    // 31 samples — median is 16
    expect(r.medianMs).toBe(16);
    expect(r.sampleCount).toBe(31);
  });

  it("computes median for even-length input", () => {
    // 30 samples 16.6ms each → 60fps → median 16.6
    const samples = Array.from({ length: 30 }, () => 16.6);
    const r = scoreFrames(samples);
    expect(r.medianMs).toBeCloseTo(16.6, 5);
    expect(r.shouldDisableTerrain).toBe(false);
  });

  it("flags terrain disable when median > 41 ms AND >=30 samples", () => {
    // 50 samples at 50ms each — that's 20 fps, well below threshold
    const samples = Array.from({ length: 50 }, () => 50);
    const r = scoreFrames(samples);
    expect(r.medianMs).toBe(50);
    expect(r.shouldDisableTerrain).toBe(true);
  });

  it("does NOT flag terrain disable with too few samples", () => {
    // 5 samples at 100ms — slow but not enough data
    const samples = [100, 100, 100, 100, 100];
    const r = scoreFrames(samples);
    expect(r.shouldDisableTerrain).toBe(false);
    expect(r.sampleCount).toBe(5);
  });

  it("does NOT flag terrain disable at exactly threshold", () => {
    // 30 samples at exactly 41ms — at threshold, not over
    const samples = Array.from({ length: 30 }, () => 41);
    const r = scoreFrames(samples);
    expect(r.medianMs).toBe(41);
    expect(r.shouldDisableTerrain).toBe(false);
  });

  it("computes p95", () => {
    // 100 samples — 95 at 16ms, 5 at 100ms — p95 should be 100
    const samples = [...Array(95).fill(16), ...Array(5).fill(100)];
    const r = scoreFrames(samples);
    expect(r.medianMs).toBe(16);
    expect(r.p95Ms).toBe(100);
  });

  it("uses a custom threshold", () => {
    const samples = Array.from({ length: 30 }, () => 30);
    expect(scoreFrames(samples, 25).shouldDisableTerrain).toBe(true);
    expect(scoreFrames(samples, 35).shouldDisableTerrain).toBe(false);
  });
});

describe("clampTerrain", () => {
  it("clamps above the cap", () => {
    expect(clampTerrain(1.8, 1.3)).toBe(1.3);
  });
  it("passes through below the cap", () => {
    expect(clampTerrain(1.0, 1.3)).toBe(1.0);
  });
  it("uses default cap of 1.3 when none given", () => {
    expect(clampTerrain(1.8)).toBe(1.3);
  });
  it("returns null for non-number input", () => {
    expect(clampTerrain(undefined)).toBe(null);
    expect(clampTerrain(NaN)).toBe(null);
  });
  it("returns input unchanged when cap is invalid", () => {
    expect(clampTerrain(1.8, NaN)).toBe(1.8);
  });
});
