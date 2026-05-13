import { describe, it, expect, vi } from "vitest";
import {
  synthesizeSilence,
  synthesizeTone,
  buildTtsRequest,
  alignToSceneDuration,
  synthesizeSceneLive,
  synthesizeScenes,
  sceneStarts,
} from "../src/services/directorTTS.js";
import devotional from "../src/services/tonePalettes/devotional.js";

const SR = 48000;
const scenes = [
  { id: "a", tStart: 0, tEnd: 4, narration: "ఆరంభం", captionText: "ఆరంభం", captionStyle: "headline" },
  { id: "b", tStart: 4, tEnd: 10, narration: "శిఖరం", captionText: "శిఖరం" },
];

describe("synthesizeSilence", () => {
  it("returns the right length", () => {
    expect(synthesizeSilence(1, 1000)).toHaveLength(1000);
    expect(synthesizeSilence(0.5, 48000)).toHaveLength(24000);
  });
  it("every sample is 0", () => {
    const s = synthesizeSilence(0.01, 48000);
    for (let i = 0; i < s.length; i++) expect(s[i]).toBe(0);
  });
  it("zero/negative duration returns empty", () => {
    expect(synthesizeSilence(0, 48000)).toHaveLength(0);
    expect(synthesizeSilence(-1, 48000)).toHaveLength(0);
  });
});

describe("synthesizeTone", () => {
  it("returns the right length", () => {
    expect(synthesizeTone(0.5, 48000)).toHaveLength(24000);
  });
  it("starts and ends near zero from the cosine fade", () => {
    const t = synthesizeTone(0.5, 48000);
    expect(Math.abs(t[0])).toBeLessThan(0.01);
    expect(Math.abs(t[t.length - 1])).toBeLessThan(0.01);
  });
  it("has audible content in the middle (peak over a window)", () => {
    const t = synthesizeTone(0.5, 48000);
    // Single-sample probes can hit a zero crossing for a periodic
    // signal; check peak across the middle 1000 samples instead.
    let peak = 0;
    for (let i = t.length / 2 - 500; i < t.length / 2 + 500; i++) {
      const v = Math.abs(t[i]);
      if (v > peak) peak = v;
    }
    expect(peak).toBeGreaterThan(0.05);
  });
  it("respects amp parameter", () => {
    const quiet = synthesizeTone(0.1, 48000, { amp: 0.01 });
    const loud = synthesizeTone(0.1, 48000, { amp: 0.5 });
    const peakQuiet = Math.max(...Array.from(quiet).map(Math.abs));
    const peakLoud = Math.max(...Array.from(loud).map(Math.abs));
    expect(peakLoud).toBeGreaterThan(peakQuiet * 10);
  });
});

describe("buildTtsRequest", () => {
  it("assembles fields from scene + palette + language", () => {
    const req = buildTtsRequest({ scene: scenes[0], palette: devotional, language: "te" });
    expect(req.tone).toBe("devotional");
    expect(req.language).toBe("te");
    expect(req.text).toBe("ఆరంభం");
    expect(req.tempo).toBe(devotional.voice.tempo);
    expect(req.voiceId).toBe(devotional.voice.voiceIdByLang.te);
  });
  it("rejects unknown language", () => {
    expect(() => buildTtsRequest({ scene: scenes[0], palette: devotional, language: "zz" })).toThrow(/voiceId/);
  });
  it("rejects missing inputs", () => {
    expect(() => buildTtsRequest({})).toThrow();
    expect(() => buildTtsRequest({ scene: scenes[0] })).toThrow(/palette/);
    expect(() => buildTtsRequest({ scene: scenes[0], palette: devotional })).toThrow(/language/);
  });
});

describe("alignToSceneDuration", () => {
  it("returns input unchanged when length already matches", () => {
    const buf = new Float32Array(48000).fill(0.5);
    const out = alignToSceneDuration(buf, 1.0, 48000);
    expect(out.length).toBe(48000);
    expect(out[1000]).toBeCloseTo(0.5);
  });
  it("truncates when input is too long", () => {
    const buf = new Float32Array(96000).fill(0.5);
    const out = alignToSceneDuration(buf, 1.0, 48000);
    expect(out.length).toBe(48000);
  });
  it("pads with silence when input is too short", () => {
    const buf = new Float32Array(24000).fill(0.5);
    const out = alignToSceneDuration(buf, 1.0, 48000);
    expect(out.length).toBe(48000);
    expect(out[10000]).toBeCloseTo(0.5);
    expect(out[40000]).toBe(0);
  });
  it("handles null samples by returning silence", () => {
    const out = alignToSceneDuration(null, 0.5, 48000);
    expect(out.length).toBe(24000);
    expect(out[0]).toBe(0);
  });
  it("zero duration returns empty array", () => {
    expect(alignToSceneDuration(new Float32Array(1000), 0, 48000)).toHaveLength(0);
  });
});

describe("synthesizeSceneLive", () => {
  it("posts to worker /v1/tts with the right body", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(8),
    }));
    const decodeAudio = vi.fn(async () => new Float32Array(SR * 4).fill(0.2));
    const out = await synthesizeSceneLive(scenes[0], {
      palette: devotional,
      language: "te",
      sampleRate: SR,
      workerBase: "https://worker.example",
      fetchImpl,
      decodeAudio,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://worker.example/v1/tts");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.language).toBe("te");
    expect(body.text).toBe("ఆరంభం");
    // Aligned to scene duration 4s × SR
    expect(out.length).toBe(SR * 4);
  });

  it("aligns audio that's shorter than the scene duration", async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    const decodeAudio = async () => new Float32Array(SR * 2).fill(0.3);
    const out = await synthesizeSceneLive(scenes[0], {
      palette: devotional,
      language: "te",
      sampleRate: SR,
      workerBase: "https://w.example",
      fetchImpl,
      decodeAudio,
    });
    expect(out.length).toBe(SR * 4);
    expect(out[SR]).toBeCloseTo(0.3); // first half full
    expect(out[SR * 3]).toBe(0); // padded
  });

  it("propagates worker errors", async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 502,
      text: async () => "upstream-claude",
    });
    const decodeAudio = async () => new Float32Array(0);
    await expect(
      synthesizeSceneLive(scenes[0], {
        palette: devotional,
        language: "te",
        sampleRate: SR,
        workerBase: "https://w.example",
        fetchImpl,
        decodeAudio,
      }),
    ).rejects.toThrow(/502/);
  });

  it("rejects missing dependencies", async () => {
    await expect(
      synthesizeSceneLive(scenes[0], {
        palette: devotional,
        language: "te",
        sampleRate: SR,
      }),
    ).rejects.toThrow(/workerBase/);
  });
});

describe("synthesizeScenes", () => {
  it("silent mode returns silence of the right total length", async () => {
    const { tracks, mode } = await synthesizeScenes({
      scenes,
      palette: devotional,
      language: "te",
      sampleRate: 1000,
      mode: "silent",
    });
    expect(mode).toBe("silent");
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toHaveLength(4000);
    expect(tracks[1]).toHaveLength(6000);
    for (const t of tracks) for (const v of t) expect(v).toBe(0);
  });

  it("tone mode produces audible non-zero content", async () => {
    const { tracks, mode } = await synthesizeScenes({
      scenes,
      palette: devotional,
      language: "te",
      sampleRate: 48000,
      mode: "tone",
    });
    expect(mode).toBe("tone");
    let peak = 0;
    for (const v of tracks[0]) if (Math.abs(v) > peak) peak = Math.abs(v);
    expect(peak).toBeGreaterThan(0.05);
  });

  it("live mode routes through synthesizeSceneLive per scene", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));
    const decodeAudio = vi.fn(async () => new Float32Array(48000).fill(0.4));
    const { tracks, mode } = await synthesizeScenes({
      scenes,
      palette: devotional,
      language: "te",
      sampleRate: 48000,
      mode: "live",
      workerBase: "https://w.example",
      fetchImpl,
      decodeAudio,
    });
    expect(mode).toBe("live");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(tracks).toHaveLength(2);
  });

  it("live mode without workerBase fails loudly", async () => {
    await expect(
      synthesizeScenes({
        scenes,
        palette: devotional,
        language: "te",
        mode: "live",
        workerBase: "",
      }),
    ).rejects.toThrow(/VITE_DIRECTOR_WORKER_URL|workerBase/i);
  });

  it("rejects empty / invalid inputs", async () => {
    await expect(synthesizeScenes({ scenes: [], palette: devotional, language: "te" })).rejects.toThrow(/scenes/);
    await expect(synthesizeScenes({ scenes, language: "te" })).rejects.toThrow(/palette/);
    await expect(synthesizeScenes({ scenes, palette: devotional })).rejects.toThrow(/language/);
  });
});

describe("sceneStarts", () => {
  it("extracts tStart values in order", () => {
    expect(sceneStarts(scenes)).toEqual([0, 4]);
  });
  it("handles empty input", () => {
    expect(sceneStarts([])).toEqual([]);
  });
});
