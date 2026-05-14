import { describe, it, expect } from "vitest";
import {
  TRAVELER_PROFILES,
  getTravelerProfile,
  applyTravelerProfile,
} from "../src/services/travelerProfile.js";
import {
  validateFile,
  assignPhotosToPois,
  MEDIA_LIMITS,
} from "../src/services/userMedia.js";

describe("travelerProfile", () => {
  it("has 6 profiles including skip", () => {
    expect(TRAVELER_PROFILES.length).toBeGreaterThanOrEqual(6);
    expect(TRAVELER_PROFILES.find((p) => p.id === "skip")).toBeDefined();
  });

  it("getTravelerProfile resolves by id", () => {
    expect(getTravelerProfile("first-time-pilgrim")?.label).toBe("First-time pilgrim");
    expect(getTravelerProfile("nope")).toBe(null);
  });

  it("applyTravelerProfile prepends the prompt insert", () => {
    const out = applyTravelerProfile("My memory", "first-time-pilgrim");
    expect(out).toContain("first visit");
    expect(out).toContain("My memory");
  });

  it("applyTravelerProfile with skip returns the note unchanged", () => {
    expect(applyTravelerProfile("hello", "skip")).toBe("hello");
  });

  it("applyTravelerProfile handles empty note + skip", () => {
    expect(applyTravelerProfile("", "skip")).toBe("");
  });

  it("applyTravelerProfile with no note returns just the insert", () => {
    expect(applyTravelerProfile("", "solo-trekker")).toContain("walks alone");
  });
});

describe("userMedia validateFile", () => {
  function fakeFile({ size = 1024, type = "image/jpeg", name = "x.jpg" } = {}) {
    return { size, type, name };
  }

  it("accepts a valid JPEG under 5 MB", async () => {
    await expect(validateFile(fakeFile())).resolves.toBe(true);
  });

  it("rejects oversize files", async () => {
    await expect(validateFile(fakeFile({ size: 10 * 1024 * 1024 }))).rejects.toMatchObject({ code: "too-big" });
  });

  it("rejects wrong types", async () => {
    await expect(validateFile(fakeFile({ type: "application/pdf" }))).rejects.toMatchObject({ code: "wrong-type" });
  });

  it("rejects missing files", async () => {
    await expect(validateFile(null)).rejects.toMatchObject({ code: "missing" });
  });
});

describe("assignPhotosToPois", () => {
  it("assigns photos to POIs in order; remaining POIs get null", () => {
    const photos = [
      { bitmap: "B1" },
      { bitmap: "B2" },
    ];
    const pois = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const out = assignPhotosToPois(photos, pois);
    expect(out.get("a")).toBe("B1");
    expect(out.get("b")).toBe("B2");
    expect(out.get("c")).toBe(null);
  });

  it("skips failed decodes", () => {
    const out = assignPhotosToPois(
      [{ error: new Error("decode") }, { bitmap: "B2" }],
      [{ id: "a" }, { id: "b" }],
    );
    expect(out.get("a")).toBe("B2");  // first VALID photo goes to first POI
    expect(out.get("b")).toBe(null);
  });

  it("returns empty Map when no POIs", () => {
    expect(assignPhotosToPois([], []).size).toBe(0);
  });

  it("MEDIA_LIMITS constants are sane", () => {
    expect(MEDIA_LIMITS.MAX_FILE_BYTES).toBe(5 * 1024 * 1024);
    expect(MEDIA_LIMITS.MAX_PHOTOS).toBe(3);
    expect(MEDIA_LIMITS.ALLOWED).toContain("image/jpeg");
  });
});
