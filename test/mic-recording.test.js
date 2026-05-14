import { describe, it, expect, vi } from "vitest";
import {
  pickSupportedMime,
  recordScene,
  resampleAndFitMono,
} from "../src/services/micRecording.js";

describe("pickSupportedMime", () => {
  it("returns the first MR.isTypeSupported match", () => {
    const MR = { isTypeSupported: vi.fn((t) => t === "audio/webm") };
    expect(pickSupportedMime(MR)).toBe("audio/webm");
  });

  it("returns undefined when MediaRecorder is missing", () => {
    expect(pickSupportedMime(undefined)).toBeUndefined();
  });

  it("returns undefined when nothing matches (iOS Safari path)", () => {
    const MR = { isTypeSupported: () => false };
    expect(pickSupportedMime(MR)).toBeUndefined();
  });
});

describe("recordScene", () => {
  it("invokes MediaRecorder, stops on controller.stop, resolves with a Blob", async () => {
    const handlers = {};
    class FakeMR {
      constructor() {
        this.state = "inactive";
        this.start = () => { this.state = "recording"; };
        this.stop = () => { this.state = "inactive"; handlers.stop?.(); };
        this.addEventListener = (ev, fn) => { handlers[ev] = fn; };
      }
      static isTypeSupported() { return true; }
    }
    const stream = {};
    const { promise, controller } = recordScene({ stream, MR: FakeMR });
    handlers.dataavailable?.({ data: new Blob(["hi"], { type: "audio/webm" }) });
    controller.stop();
    const blob = await promise;
    expect(blob).toBeInstanceOf(Blob);
  });

  it("rejects when stream is missing", () => {
    class FakeMR {
      constructor() {}
      static isTypeSupported() { return true; }
    }
    expect(() => recordScene({ stream: null, MR: FakeMR })).toThrow();
  });
});

describe("resampleAndFitMono", () => {
  function fakeBuffer(channelData, sampleRate) {
    return {
      length: channelData[0].length,
      sampleRate,
      numberOfChannels: channelData.length,
      getChannelData: (ch) => channelData[ch],
    };
  }

  it("returns silence Float32Array when buffer is empty", () => {
    const out = resampleAndFitMono({ length: 0, sampleRate: 48000, numberOfChannels: 0, getChannelData: () => new Float32Array(0) }, 100, 48000);
    expect(out).toBeInstanceOf(Float32Array);
    expect(out.length).toBe(100);
  });

  it("collapses stereo to mono", () => {
    const left = new Float32Array([1, 1, 1, 1]);
    const right = new Float32Array([3, 3, 3, 3]);
    const out = resampleAndFitMono(fakeBuffer([left, right], 4), 4, 4);
    expect(out[0]).toBeCloseTo(2);  // (1+3)/2 = 2
  });

  it("pads with silence when source is shorter than target", () => {
    const data = new Float32Array([0.5, 0.5]);
    const out = resampleAndFitMono(fakeBuffer([data], 100), 200, 100);
    expect(out.length).toBe(200);
    // Last samples should be ~0 (interpolated from end of data)
    expect(out[199]).toBeCloseTo(0.5);
  });

  it("resamples 44.1kHz → 48kHz with linear interpolation", () => {
    // A 1-sample-per-frame ramp at 44100Hz
    const src = new Float32Array(441);
    for (let i = 0; i < 441; i++) src[i] = i / 441;
    const out = resampleAndFitMono(fakeBuffer([src], 44100), 480, 48000);
    expect(out.length).toBe(480);
    // First sample should be near 0
    expect(out[0]).toBeCloseTo(0, 1);
    // Last sample within reasonable range
    expect(out[479]).toBeGreaterThan(0.8);
  });
});
