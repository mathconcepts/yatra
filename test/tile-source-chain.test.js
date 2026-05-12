import { describe, it, expect } from "vitest";
import {
  createChain,
  recordFailure,
  tryFlush,
  reset,
  activeSource,
  DEFAULT_SOURCES,
  DEFAULT_THRESHOLD,
  DEFAULT_WINDOW_MS,
} from "../src/services/tileSourceChain";

describe("tileSourceChain", () => {
  it("starts on the first source", () => {
    const s = createChain();
    expect(activeSource(s)).toBe(DEFAULT_SOURCES[0]);
    expect(s.activeIndex).toBe(0);
    expect(s.pendingSwap).toBe(false);
  });

  it("records failures without pending swap below threshold", () => {
    let s = createChain();
    s = recordFailure(s, 100);
    s = recordFailure(s, 200);
    expect(s.failures.length).toBe(2);
    expect(s.pendingSwap).toBe(false);
  });

  it("marks pendingSwap when threshold crossed", () => {
    let s = createChain();
    for (let i = 0; i < DEFAULT_THRESHOLD; i++) s = recordFailure(s, 1000 + i);
    expect(s.pendingSwap).toBe(true);
  });

  it("flushing a pending swap advances activeIndex and clears state", () => {
    let s = createChain();
    for (let i = 0; i < DEFAULT_THRESHOLD; i++) s = recordFailure(s, 1000 + i);
    const r = tryFlush(s);
    expect(r.swapped).toBe(true);
    expect(r.state.activeIndex).toBe(1);
    expect(activeSource(r.state)).toBe(DEFAULT_SOURCES[1]);
    expect(r.state.failures).toEqual([]);
    expect(r.state.pendingSwap).toBe(false);
  });

  it("flushing without a pending swap is a no-op", () => {
    const s = createChain();
    const r = tryFlush(s);
    expect(r.swapped).toBe(false);
    expect(r.state).toEqual(s);
  });

  it("sliding window prunes old failures", () => {
    let s = createChain({ windowMs: 1000, threshold: 3 });
    s = recordFailure(s, 0);
    s = recordFailure(s, 500);
    s = recordFailure(s, 2000); // far outside the window — earlier two pruned
    expect(s.failures.length).toBe(1);
    expect(s.pendingSwap).toBe(false);
  });

  it("does not swap past the end of the source list", () => {
    let s = createChain({ sources: ["esri", "osm"] });
    // First swap esri → osm
    for (let i = 0; i < DEFAULT_THRESHOLD; i++) s = recordFailure(s, 1000 + i);
    s = tryFlush(s).state;
    expect(activeSource(s)).toBe("osm");
    // Second attempted swap: osm fails too, but no further fallback exists
    for (let i = 0; i < DEFAULT_THRESHOLD; i++) s = recordFailure(s, 2000 + i);
    const r = tryFlush(s);
    expect(r.swapped).toBe(false);
    expect(activeSource(r.state)).toBe("osm");
    expect(r.state.pendingSwap).toBe(false);
  });

  it("reset() clears failures + pending but preserves active", () => {
    let s = createChain();
    for (let i = 0; i < DEFAULT_THRESHOLD; i++) s = recordFailure(s, 1000 + i);
    s = tryFlush(s).state;
    s = recordFailure(s, 5000);
    s = recordFailure(s, 5100);
    const after = reset(s);
    expect(after.activeIndex).toBe(1);
    expect(after.failures).toEqual([]);
    expect(after.pendingSwap).toBe(false);
  });

  it("respects custom threshold", () => {
    let s = createChain({ threshold: 2 });
    s = recordFailure(s, 100);
    expect(s.pendingSwap).toBe(false);
    s = recordFailure(s, 200);
    expect(s.pendingSwap).toBe(true);
  });

  it("default window is 4000ms", () => {
    expect(DEFAULT_WINDOW_MS).toBe(4000);
  });
});
