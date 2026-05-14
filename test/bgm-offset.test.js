import { describe, it, expect } from "vitest";
import {
  getBgmSample,
  defaultBgmStartOffsetS,
  mixWithBgm,
} from "../src/services/bgmMixer.js";

describe("getBgmSample with start offset", () => {
  const data = new Float32Array([10, 20, 30, 40, 50]);
  const sr = 100;

  it("offset=0 behaves as before (sample[i mod len])", () => {
    expect(getBgmSample(data, 0, sr, 0)).toBe(10);
    expect(getBgmSample(data, 7, sr, 0)).toBe(30); // 7 % 5 = 2
  });

  it("offset shifts the read position", () => {
    // 2-sample offset: i=0 reads index 2 (30)
    expect(getBgmSample(data, 0, sr, 2)).toBe(30);
    expect(getBgmSample(data, 1, sr, 2)).toBe(40);
    expect(getBgmSample(data, 2, sr, 2)).toBe(50);
    // wraps: i=3 with offset 2 → index 0 (10)
    expect(getBgmSample(data, 3, sr, 2)).toBe(10);
  });

  it("offset > len wraps via modulo", () => {
    expect(getBgmSample(data, 0, sr, 7)).toBe(30); // 7 % 5 = 2 → index 2 = 30
  });
});

describe("defaultBgmStartOffsetS", () => {
  it("returns 0 for short tracks", () => {
    expect(defaultBgmStartOffsetS(5)).toBe(0);
    expect(defaultBgmStartOffsetS(10)).toBe(0);
  });

  it("returns 5s for long enough tracks", () => {
    expect(defaultBgmStartOffsetS(60)).toBe(5);
    expect(defaultBgmStartOffsetS(120)).toBe(5);
  });

  it("caps at 25% for tracks shorter than 20s", () => {
    expect(defaultBgmStartOffsetS(16)).toBe(4); // 25% of 16 = 4
  });

  it("returns 0 for non-finite input", () => {
    expect(defaultBgmStartOffsetS(NaN)).toBe(0);
    expect(defaultBgmStartOffsetS(undefined)).toBe(0);
  });
});

describe("mixWithBgm respects bgmStartOffsetS", () => {
  function makeBuffer(channels, length, sr, fillFn) {
    const data = Array.from({ length: channels }, (_, ch) => {
      const arr = new Float32Array(length);
      for (let i = 0; i < length; i++) arr[i] = typeof fillFn === "function" ? fillFn(i, ch) : fillFn;
      return arr;
    });
    return {
      numberOfChannels: channels, length, sampleRate: sr,
      getChannelData: (ch) => data[ch],
    };
  }
  const createBuffer = (c, l, sr) => makeBuffer(c, l, sr, 0);

  it("changes the BGM samples used when offset is non-zero", () => {
    const sr = 100;
    const narr = makeBuffer(1, sr, sr, 0); // silence narration
    // BGM = ramp 0..1 over 1s
    const bgm = makeBuffer(1, sr, sr, (i) => i / sr);

    const noOffset = mixWithBgm({ narrationBuffer: narr, bgmBuffer: bgm, narrationWindows: [], createBuffer, bgmStartOffsetS: 0 });
    const withOffset = mixWithBgm({ narrationBuffer: narr, bgmBuffer: bgm, narrationWindows: [], createBuffer, bgmStartOffsetS: 0.5 });
    // At i=0, no-offset reads 0 (lowest), with-offset reads 0.5
    expect(noOffset.getChannelData(0)[0]).toBeLessThan(withOffset.getChannelData(0)[0]);
  });
});
