import { describe, it, expect, beforeEach } from "vitest";
import {
  sanitizeForStorage,
  parseStored,
  makeSavedId,
  saveMemory,
  listMemories,
  deleteMemory,
  findMemory,
  clearMemories,
} from "../src/services/memoryStore";

describe("sanitizeForStorage", () => {
  it("returns null for invalid input", () => {
    expect(sanitizeForStorage(null)).toBe(null);
    expect(sanitizeForStorage("nope")).toBe(null);
  });
  it("strips photoUrl from landmarks", () => {
    const cfg = { title: "T", landmarks: [{ id: "a", photoUrl: "blob:foo", lat: 1, lon: 2 }] };
    const out = sanitizeForStorage(cfg);
    expect(out.landmarks[0].photoUrl).toBeUndefined();
    expect(out.landmarks[0].lat).toBe(1);
  });
  it("nulls narrationUrl", () => {
    const out = sanitizeForStorage({ title: "T", narrationUrl: "blob:bar", landmarks: [] });
    expect(out.narrationUrl).toBe(null);
  });
});

describe("parseStored", () => {
  it("returns [] for missing/invalid input", () => {
    expect(parseStored("")).toEqual([]);
    expect(parseStored(null)).toEqual([]);
    expect(parseStored("not json")).toEqual([]);
    expect(parseStored("{}")).toEqual([]);
  });
  it("parses valid payload", () => {
    const payload = JSON.stringify({ version: 1, memories: [{ savedId: "a", savedAt: "now", config: { title: "x" } }] });
    expect(parseStored(payload)).toHaveLength(1);
  });
  it("filters incomplete entries", () => {
    const payload = JSON.stringify({ version: 1, memories: [{ savedId: "a" }, { savedId: "b", config: { title: "ok" } }] });
    expect(parseStored(payload)).toHaveLength(1);
  });
  it("rejects mismatched schema version", () => {
    const payload = JSON.stringify({ version: 99, memories: [{ savedId: "x", config: {} }] });
    expect(parseStored(payload)).toEqual([]);
  });
});

describe("makeSavedId", () => {
  it("produces a unique id", () => {
    const a = makeSavedId();
    const b = makeSavedId();
    expect(a).toMatch(/^mem-\d+-[a-z0-9]+$/);
    expect(a).not.toBe(b);
  });
});

describe("localStorage CRUD", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined") localStorage.clear();
  });

  it("round-trips a saved memory", () => {
    const entry = saveMemory({ title: "Trip", landmarks: [] });
    expect(entry).not.toBe(null);
    expect(listMemories()).toHaveLength(1);
    expect(findMemory(entry.savedId)?.config.title).toBe("Trip");
  });

  it("deletes by id", () => {
    const e = saveMemory({ title: "X", landmarks: [] });
    expect(deleteMemory(e.savedId)).toBe(true);
    expect(listMemories()).toEqual([]);
  });

  it("clearMemories empties storage", () => {
    saveMemory({ title: "X", landmarks: [] });
    saveMemory({ title: "Y", landmarks: [] });
    clearMemories();
    expect(listMemories()).toEqual([]);
  });
});
