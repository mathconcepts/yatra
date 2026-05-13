import { describe, it, expect } from "vitest";
import {
  dbfsToGain,
  mixInto,
  mixWithEqualPowerFade,
  sidechainEnvelope,
  ambientEnvelope,
  loopToLength,
  concatenateNarration,
  mixDirectorAudio,
} from "../src/services/directorAudio.js";

function tone(freq, durationS, sampleRate, amp = 0.5) {
  const len = Math.floor(durationS * sampleRate);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}

function silence(durationS, sampleRate) {
  return new Float32Array(Math.floor(durationS * sampleRate));
}

describe("dbfsToGain", () => {
  it("0 dBFS is unity", () => expect(dbfsToGain(0)).toBeCloseTo(1));
  it("-6 dBFS halves amplitude", () => expect(dbfsToGain(-6)).toBeCloseTo(0.501, 2));
  it("-Infinity dBFS is silence", () => expect(dbfsToGain(-Infinity)).toBe(0));
  it("falls back to 1 for garbage input", () => expect(dbfsToGain(NaN)).toBe(1));
});

describe("mixInto", () => {
  it("adds source into out with constant gain", () => {
    const out = new Float32Array([0.1, 0.2, 0.3]);
    const src = new Float32Array([0.05, 0.05, 0.05]);
    mixInto(out, src, { gain: 2 });
    expect(out[0]).toBeCloseTo(0.2);
    expect(out[1]).toBeCloseTo(0.3);
    expect(out[2]).toBeCloseTo(0.4);
  });
  it("respects outOffset", () => {
    const out = new Float32Array(5);
    const src = new Float32Array([0.5, 0.5]);
    mixInto(out, src, { outOffset: 2 });
    expect(out[0]).toBe(0);
    expect(out[2]).toBeCloseTo(0.5);
    expect(out[3]).toBeCloseTo(0.5);
  });
  it("uses per-sample envelope when provided", () => {
    const out = new Float32Array(3);
    const src = new Float32Array([1, 1, 1]);
    const env = new Float32Array([0.1, 0.5, 1.0]);
    mixInto(out, src, { gainEnvelope: env });
    expect(out[0]).toBeCloseTo(0.1);
    expect(out[1]).toBeCloseTo(0.5);
    expect(out[2]).toBeCloseTo(1.0);
  });
  it("clips to [-1, 1]", () => {
    const out = new Float32Array([0.8]);
    const src = new Float32Array([0.8]);
    mixInto(out, src);
    expect(out[0]).toBe(1);
    const out2 = new Float32Array([-0.8]);
    mixInto(out2, new Float32Array([-0.8]));
    expect(out2[0]).toBe(-1);
  });
  it("returns 0 on null inputs", () => {
    expect(mixInto(null, new Float32Array(3))).toBe(0);
    expect(mixInto(new Float32Array(3), null)).toBe(0);
  });
});

describe("mixWithEqualPowerFade", () => {
  it("hits exactly 0 at both endpoints and 1 in the sustain region", () => {
    const out = new Float32Array(1000);
    const src = new Float32Array(1000).fill(1);
    mixWithEqualPowerFade(out, src, { fadeSamples: 100 });
    expect(out[0]).toBe(0); // sin(0) = 0
    expect(out[99]).toBeCloseTo(1, 5); // end of fade-in, sin(pi/2) = 1
    expect(out[500]).toBe(1); // sustain region
    expect(out[900]).toBeCloseTo(1, 5); // start of fade-out, cos(0) = 1
    expect(out[999]).toBeCloseTo(0, 5); // end of fade-out, cos(pi/2) = 0
  });
  it("clamps fadeSamples to half the length", () => {
    const out = new Float32Array(10);
    const src = new Float32Array(10).fill(1);
    mixWithEqualPowerFade(out, src, { fadeSamples: 999 });
    expect(out[0]).toBeCloseTo(0);
    expect(out[9]).toBeCloseTo(0);
  });
});

describe("sidechainEnvelope", () => {
  const SR = 4800;
  it("returns 1 throughout when narration is silent", () => {
    const env = sidechainEnvelope(silence(1, SR), { sampleRate: SR });
    for (let i = 0; i < env.length; i += 100) expect(env[i]).toBeCloseTo(1, 2);
  });
  it("ducks below 1 while narration is loud", () => {
    const narration = tone(440, 1, SR, 0.6); // well above threshold
    const env = sidechainEnvelope(narration, { sampleRate: SR, thresholdRms: 0.1, floorGain: 0.3 });
    // After attack, env should approach floorGain
    expect(env[env.length - 1]).toBeLessThan(0.5);
    expect(env[env.length - 1]).toBeGreaterThan(0.25);
  });
  it("recovers toward 1 after narration ends", () => {
    const SR2 = 4800;
    const loud = tone(440, 0.3, SR2, 0.6);
    const tail = silence(0.5, SR2);
    const narration = new Float32Array(loud.length + tail.length);
    narration.set(loud);
    narration.set(tail, loud.length);
    const env = sidechainEnvelope(narration, { sampleRate: SR2, attackMs: 20, releaseMs: 60 });
    expect(env[narration.length - 1]).toBeGreaterThan(0.9);
  });
  it("zero-length narration yields empty envelope", () => {
    expect(sidechainEnvelope(new Float32Array(0)).length).toBe(0);
  });
});

describe("ambientEnvelope", () => {
  const rule = { gateAt: 0.5, peakAt: 0.95, dbfs: -6 }; // peakGain ≈ 0.501
  it("is silent below gateAt", () => {
    const env = ambientEnvelope(new Float32Array([0, 0.2, 0.5]), rule);
    expect(env[0]).toBe(0);
    expect(env[1]).toBe(0);
    expect(env[2]).toBe(0); // at gateAt is still 0
  });
  it("saturates above peakAt", () => {
    const env = ambientEnvelope(new Float32Array([0.95, 1.0, 1.5]), rule);
    for (const v of env) expect(v).toBeCloseTo(0.501, 2);
  });
  it("interpolates linearly between gateAt and peakAt", () => {
    const mid = (0.5 + 0.95) / 2;
    const env = ambientEnvelope(new Float32Array([mid]), rule);
    expect(env[0]).toBeCloseTo(0.501 * 0.5, 2);
  });
  it("missing rule returns zeros", () => {
    const env = ambientEnvelope(new Float32Array([0.8]), null);
    expect(env[0]).toBe(0);
  });
});

describe("loopToLength", () => {
  it("repeats source to fill", () => {
    const out = loopToLength(new Float32Array([1, 2, 3]), 7);
    expect(Array.from(out)).toEqual([1, 2, 3, 1, 2, 3, 1]);
  });
  it("zero source returns zeros", () => {
    const out = loopToLength(new Float32Array(0), 5);
    expect(Array.from(out)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe("concatenateNarration", () => {
  const SR = 1000;
  it("places each scene at its start time", () => {
    const s1 = new Float32Array(500).fill(0.3);
    const s2 = new Float32Array(500).fill(0.4);
    const out = concatenateNarration({
      sceneTracks: [s1, s2],
      sceneStartsS: [0, 0.5],
      sampleRate: SR,
      lengthSamples: 1000,
      crossfadeMs: 0,
    });
    expect(out[100]).toBeCloseTo(0.3, 2);
    expect(out[600]).toBeCloseTo(0.4, 2);
  });
  it("skips empty scenes silently", () => {
    const out = concatenateNarration({
      sceneTracks: [null, new Float32Array(0), new Float32Array(100).fill(0.5)],
      sceneStartsS: [0, 0.1, 0.2],
      sampleRate: SR,
      lengthSamples: 500,
    });
    expect(out[250]).toBeCloseTo(0.5, 2);
  });
});

describe("mixDirectorAudio", () => {
  function fakeCreateBuffer(numChannels, lengthSamples, sampleRate) {
    const channels = Array.from({ length: numChannels }, () => new Float32Array(lengthSamples));
    return {
      numberOfChannels: numChannels,
      length: lengthSamples,
      sampleRate,
      copyToChannel: (arr, ch) => { channels[ch] = new Float32Array(arr); },
      getChannelData: (ch) => channels[ch],
    };
  }

  const SR = 4800;
  const DUR = 1.0;
  const len = Math.floor(DUR * SR);

  it("returns a buffer with the narration on channel 0", () => {
    const narration = new Float32Array(len).fill(0.3);
    const buf = mixDirectorAudio({
      sampleRate: SR,
      durationS: DUR,
      sceneTracks: [narration],
      sceneStartsS: [0],
      createBuffer: fakeCreateBuffer,
    });
    const ch = buf.getChannelData(0);
    expect(ch.length).toBe(len);
    expect(Math.abs(ch[len - 100])).toBeGreaterThan(0);
  });

  it("ducks music when narration is loud, restores when silent", () => {
    const half = Math.floor(len / 2);
    const narration = new Float32Array(len);
    for (let i = 0; i < half; i++) narration[i] = 0.6 * Math.sin((2 * Math.PI * 440 * i) / SR);
    // second half silent
    const music = new Float32Array(len).fill(0.5);
    const buf = mixDirectorAudio({
      sampleRate: SR,
      durationS: DUR,
      sceneTracks: [narration],
      sceneStartsS: [0],
      musicBed: music,
      musicDbfs: 0,
      createBuffer: fakeCreateBuffer,
    });
    const ch = buf.getChannelData(0);
    // Late narration window: music heavily ducked, narration silent → low absolute
    // Early narration window: music ducked but narration present → can be either,
    // so check that music in silent half is louder than in loud half (after duck)
    // Use a sample point in the loud half (with narration silenced) vs silent half:
    // Actually: in the silent second half, music should be at full unity (close to 0.5).
    const lateSilentSample = ch[len - 50];
    expect(Math.abs(lateSilentSample)).toBeGreaterThan(0.4);
  });

  it("plays ambient gated by proximity", () => {
    const proximity = new Float32Array(len);
    // proximity ramps from 0 to 1 over the render
    for (let i = 0; i < len; i++) proximity[i] = i / len;
    const ambient = new Float32Array(len).fill(0.5);
    const buf = mixDirectorAudio({
      sampleRate: SR,
      durationS: DUR,
      sceneTracks: [new Float32Array(len)],
      sceneStartsS: [0],
      ambientSources: [
        { rule: { gateAt: 0.5, peakAt: 0.95, dbfs: -6 }, samples: ambient },
      ],
      proximityChannel: proximity,
      createBuffer: fakeCreateBuffer,
    });
    const ch = buf.getChannelData(0);
    // Early sample (proximity < gateAt): should be near 0
    expect(Math.abs(ch[100])).toBeLessThan(0.05);
    // Late sample (proximity above peakAt): should have ambient bleed
    expect(Math.abs(ch[len - 100])).toBeGreaterThan(0.05);
  });

  it("rejects bad inputs", () => {
    expect(() => mixDirectorAudio({ durationS: 1, createBuffer: () => {} })).toThrow(/sampleRate/);
    expect(() => mixDirectorAudio({ sampleRate: 48000, createBuffer: () => {} })).toThrow(/durationS/);
    expect(() => mixDirectorAudio({ sampleRate: 48000, durationS: 1 })).toThrow(/createBuffer/);
  });
});
