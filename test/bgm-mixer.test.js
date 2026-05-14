import { describe, it, expect } from "vitest";
import {
  bgmGainAtTime,
  getBgmSample,
  deriveNarrationWindows,
  mixWithBgm,
} from "../src/services/bgmMixer.js";
import {
  BGM_TRACKS,
  defaultBgmForTone,
  getBgmTrack,
} from "../src/services/bgmCatalog.js";

describe("bgmGainAtTime", () => {
  const windows = [{ start: 1.0, end: 3.0 }, { start: 5.0, end: 7.0 }];

  it("returns 1.0 outside any narration window", () => {
    expect(bgmGainAtTime(0.5, windows)).toBeCloseTo(1.0);
    expect(bgmGainAtTime(4.0, windows)).toBeCloseTo(1.0);
    expect(bgmGainAtTime(8.0, windows)).toBeCloseTo(1.0);
  });

  it("returns the duck gain (~0.25) during a narration window", () => {
    expect(bgmGainAtTime(2.0, windows)).toBeCloseTo(0.2512, 3);
  });

  it("ramps down before scene start", () => {
    // 0.1s before start: halfway through 200ms attack
    const v = bgmGainAtTime(0.9, windows);
    expect(v).toBeGreaterThan(0.25);
    expect(v).toBeLessThan(1.0);
  });

  it("ramps up after scene end", () => {
    // 0.2s after end: halfway through 400ms release
    const v = bgmGainAtTime(3.2, windows);
    expect(v).toBeGreaterThan(0.25);
    expect(v).toBeLessThan(1.0);
  });

  it("empty windows → always full volume", () => {
    expect(bgmGainAtTime(2.0, [])).toBeCloseTo(1.0);
    expect(bgmGainAtTime(2.0, null)).toBeCloseTo(1.0);
  });
});

describe("getBgmSample", () => {
  it("returns the modulo sample when not in crossfade region", () => {
    const data = new Float32Array([1, 2, 3, 4, 5]);
    expect(getBgmSample(data, 0, 48000)).toBe(1);
    expect(getBgmSample(data, 6, 48000)).toBe(2); // 6 % 5 = 1
  });

  it("returns 0 for empty buffer", () => {
    expect(getBgmSample(new Float32Array(0), 0, 48000)).toBe(0);
  });
});

describe("deriveNarrationWindows", () => {
  it("extracts {start,end} from valid scenes", () => {
    const out = deriveNarrationWindows([
      { tStart: 0, tEnd: 4, narration: "a" },
      { tStart: 4, tEnd: 8, narration: "b" },
    ]);
    expect(out).toEqual([{ start: 0, end: 4 }, { start: 4, end: 8 }]);
  });

  it("drops scenes with invalid timing", () => {
    const out = deriveNarrationWindows([
      { tStart: 0, tEnd: 0 },
      { tStart: 2, tEnd: 1 },
      { tStart: 3, tEnd: 5 },
    ]);
    expect(out).toEqual([{ start: 3, end: 5 }]);
  });

  it("returns [] for non-arrays", () => {
    expect(deriveNarrationWindows(null)).toEqual([]);
    expect(deriveNarrationWindows({})).toEqual([]);
  });
});

describe("mixWithBgm", () => {
  function makeBuffer(channels, length, sr, fill = 0) {
    const data = Array.from({ length: channels }, () => new Float32Array(length).fill(fill));
    return {
      numberOfChannels: channels,
      length,
      sampleRate: sr,
      getChannelData: (ch) => data[ch],
    };
  }

  function createBuffer(channels, length, sr) {
    return makeBuffer(channels, length, sr, 0);
  }

  it("returns narrationBuffer unchanged when bgmBuffer is null", () => {
    const narr = makeBuffer(1, 100, 48000, 0.5);
    const out = mixWithBgm({ narrationBuffer: narr, bgmBuffer: null, narrationWindows: [], createBuffer });
    expect(out).toBe(narr); // exact same object
  });

  it("returns narrationBuffer unchanged when bgmBuffer has zero length", () => {
    const narr = makeBuffer(1, 100, 48000, 0.5);
    const bgm = makeBuffer(1, 0, 48000);
    const out = mixWithBgm({ narrationBuffer: narr, bgmBuffer: bgm, narrationWindows: [], createBuffer });
    expect(out).toBe(narr);
  });

  it("mixes narration + BGM when both present", () => {
    const sr = 100;
    const narr = makeBuffer(1, sr, sr, 0); // 1 second of silence narration
    const bgm = makeBuffer(1, sr, sr, 1.0); // 1 second of constant 1.0 BGM
    const out = mixWithBgm({ narrationBuffer: narr, bgmBuffer: bgm, narrationWindows: [], createBuffer });
    // BGM should appear at gain*0.35 headroom
    const mid = out.getChannelData(0)[sr / 2];
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it("ducks BGM during narration windows", () => {
    const sr = 100;
    const narr = makeBuffer(1, sr, sr, 0);
    const bgm = makeBuffer(1, sr, sr, 1.0);
    const out = mixWithBgm({
      narrationBuffer: narr, bgmBuffer: bgm,
      narrationWindows: [{ start: 0, end: 1.0 }],
      createBuffer,
    });
    // Inside the narration window, BGM is ducked. 0.5s sample should
    // be lower than the no-window mix.
    const ducked = out.getChannelData(0)[50];
    const unducked = mixWithBgm({
      narrationBuffer: narr, bgmBuffer: bgm,
      narrationWindows: [], createBuffer,
    }).getChannelData(0)[50];
    expect(ducked).toBeLessThan(unducked);
  });
});

describe("BGM catalog", () => {
  it("has 4 tracks", () => {
    expect(BGM_TRACKS).toHaveLength(4);
  });

  it("defaults to a tone-matched track", () => {
    expect(defaultBgmForTone("devotional")).toBe("temple-flute");
    expect(defaultBgmForTone("explorer")).toBe("forest-ambient");
  });

  it("falls back to silence for unknown tones", () => {
    expect(defaultBgmForTone("xx")).toBe("silence");
  });

  it("getBgmTrack returns the track or null", () => {
    expect(getBgmTrack("temple-flute")?.name).toBe("Temple flute");
    expect(getBgmTrack("nope")).toBe(null);
  });
});
