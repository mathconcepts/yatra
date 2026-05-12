import { describe, it, expect } from "vitest";
import { dmsToDeg, readExifGPS } from "../src/services/exif";

describe("dmsToDeg", () => {
  it("converts well-formed DMS tuples", () => {
    expect(dmsToDeg([45, 30, 0])).toBeCloseTo(45.5, 5);
    expect(dmsToDeg([0, 0, 0])).toBe(0);
  });
  it("returns NaN for invalid input", () => {
    expect(Number.isNaN(dmsToDeg(null))).toBe(true);
    expect(Number.isNaN(dmsToDeg([1, 2]))).toBe(true);
  });
});

describe("readExifGPS", () => {
  it("returns null for null input", async () => {
    expect(await readExifGPS(null)).toBe(null);
  });
  it("returns null for non-blob input", async () => {
    expect(await readExifGPS({})).toBe(null);
  });
  it("returns null for too-small buffers", async () => {
    const blob = new Blob([new Uint8Array([0xff])]);
    expect(await readExifGPS(blob)).toBe(null);
  });
  it("returns null for non-JPEG signatures", async () => {
    const blob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])]); // PNG
    expect(await readExifGPS(blob)).toBe(null);
  });
});
