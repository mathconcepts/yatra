import { describe, it, expect, vi } from "vitest";
import {
  framePlanForDuration,
  scenesToAudioTiming,
  runDirectorPipeline,
} from "../src/services/directorPipeline.js";
import devotional from "../src/services/tonePalettes/devotional.js";

const config = {
  id: "yadagiri-gutta",
  title: "Yadagiri Gutta",
  routes: [{ stats: { distanceKm: 4.2, durationHr: 1.5 } }],
  origin: { elev: 380 },
  destination: { elev: 540 },
};

const scriptResult = {
  routeId: "yadagiri-gutta",
  tone: "devotional",
  language: "te",
  scenes: [
    { id: "origin", tStart: 0, tEnd: 10, narration: "ఆరంభం", captionText: "ఆరంభం", captionStyle: "headline" },
    { id: "summit", tStart: 10, tEnd: 30, narration: "శిఖరం", captionText: "శిఖరం", captionStyle: "headline" },
  ],
  meta: { scriptModel: "stub", totalDurationS: 30, wordCount: 2 },
};

function makeDeps({ frameCount = null } = {}) {
  const events = [];
  const generate = vi.fn(async () => scriptResult);
  const synthesize = vi.fn(async ({ scenes, sampleRate }) => ({
    tracks: scenes.map((s) => new Float32Array(Math.floor((s.tEnd - s.tStart) * sampleRate))),
    mode: "silent",
  }));
  const mix = vi.fn(({ createBuffer, sampleRate, durationS }) => createBuffer(1, Math.floor(durationS * sampleRate), sampleRate));
  const createAudioBuffer = vi.fn((n, len, sr) => ({
    numberOfChannels: n,
    length: len,
    sampleRate: sr,
    copyToChannel: vi.fn(),
  }));
  const captureFrame = vi.fn(async (t) => ({ __frame: true, t, close: vi.fn() }));
  const destroy = vi.fn();
  const makeRenderer = vi.fn(async (cfg, opts) => {
    makeRenderer.lastOpts = opts;
    return { captureFrame, destroy };
  });
  const encodeMp4Impl = vi.fn(async (frames) => {
    if (frameCount !== null && frames.length !== frameCount) {
      throw new Error(`expected ${frameCount} frames, got ${frames.length}`);
    }
    return "blob:mp4/123";
  });
  const postcard = vi.fn(async () => "blob:postcard/456");
  const onProgress = vi.fn((e) => events.push(e));
  return {
    generate, synthesize, mix, createAudioBuffer,
    captureFrame, destroy, makeRenderer, encodeMp4Impl, postcard,
    onProgress, events,
  };
}

describe("framePlanForDuration", () => {
  it("rounds to nearest integer frame count", () => {
    expect(framePlanForDuration(1, 24)).toBe(24);
    expect(framePlanForDuration(0.5, 24)).toBe(12);
    expect(framePlanForDuration(30, 24)).toBe(720);
  });
  it("never returns less than 1 frame", () => {
    expect(framePlanForDuration(0, 24)).toBe(1);
    expect(framePlanForDuration(-1, 24)).toBe(1);
  });
});

describe("scenesToAudioTiming", () => {
  it("extracts scene starts and total duration", () => {
    const { sceneStartsS, totalDurationS } = scenesToAudioTiming(scriptResult.scenes);
    expect(sceneStartsS).toEqual([0, 10]);
    expect(totalDurationS).toBe(30);
  });
  it("empty input yields empty starts and 0 duration", () => {
    const { sceneStartsS, totalDurationS } = scenesToAudioTiming([]);
    expect(sceneStartsS).toEqual([]);
    expect(totalDurationS).toBe(0);
  });
});

describe("runDirectorPipeline", () => {
  it("walks every stage in order and returns artifact URLs", async () => {
    const d = makeDeps();
    const out = await runDirectorPipeline({
      config,
      palette: devotional,
      language: "te",
      fps: 6, // fewer frames for the test
      ...d,
    });
    expect(d.generate).toHaveBeenCalledTimes(1);
    expect(d.synthesize).toHaveBeenCalledTimes(1);
    expect(d.mix).toHaveBeenCalledTimes(1);
    expect(d.makeRenderer).toHaveBeenCalledTimes(1);
    expect(d.captureFrame).toHaveBeenCalled();
    expect(d.encodeMp4Impl).toHaveBeenCalledTimes(1);
    expect(d.postcard).toHaveBeenCalledTimes(1);
    expect(d.destroy).toHaveBeenCalledTimes(1);
    expect(out.mp4Url).toBe("blob:mp4/123");
    expect(out.postcardUrl).toBe("blob:postcard/456");
    expect(out.mode).toBe("silent");
    expect(out.scenes).toHaveLength(2);
    expect(out.durationS).toBe(30);
    expect(out.frameCount).toBe(180); // 30s × 6 fps
  });

  it("forwards the mixed audioBuffer into encodeMp4", async () => {
    const d = makeDeps();
    await runDirectorPipeline({ config, palette: devotional, language: "te", fps: 1, ...d });
    const encodeArgs = d.encodeMp4Impl.mock.calls[0][1];
    expect(encodeArgs.audioBuffer).toBeTruthy();
    expect(encodeArgs.audioBuffer.sampleRate).toBe(48000);
    expect(encodeArgs.audioBuffer.numberOfChannels).toBe(1);
  });

  it("forwards audioBuffer = undefined when no createAudioBuffer wired", async () => {
    const d = makeDeps();
    await runDirectorPipeline({
      config, palette: devotional, language: "te", fps: 1,
      generate: d.generate, synthesize: d.synthesize, mix: d.mix,
      makeRenderer: d.makeRenderer, encodeMp4Impl: d.encodeMp4Impl,
      postcard: d.postcard, onProgress: d.onProgress,
    });
    const encodeArgs = d.encodeMp4Impl.mock.calls[0][1];
    expect(encodeArgs.audioBuffer).toBeNull();
  });

  it("passes directorMode into the renderer", async () => {
    const d = makeDeps();
    await runDirectorPipeline({ config, palette: devotional, language: "te", fps: 1, ...d });
    expect(d.makeRenderer.lastOpts.directorMode).toBeDefined();
    expect(d.makeRenderer.lastOpts.directorMode.palette).toBe(devotional);
    expect(d.makeRenderer.lastOpts.directorMode.language).toBe("te");
    expect(d.makeRenderer.lastOpts.directorMode.durationS).toBe(30);
    expect(d.makeRenderer.lastOpts.directorMode.scenes).toEqual(scriptResult.scenes);
  });

  it("passes the first captured frame to exportPostcard as hero", async () => {
    const d = makeDeps();
    await runDirectorPipeline({ config, palette: devotional, language: "te", fps: 1, ...d });
    const postcardArgs = d.postcard.mock.calls[0][0];
    expect(postcardArgs.sourceCanvas).toBeTruthy();
    expect(postcardArgs.config).toBe(config);
    expect(postcardArgs.palette).toBe(devotional);
    expect(postcardArgs.language).toBe("te");
  });

  it("emits progress events for every stage", async () => {
    const d = makeDeps();
    await runDirectorPipeline({ config, palette: devotional, language: "te", fps: 1, ...d });
    const stages = d.events.map((e) => e.stage);
    expect(stages).toContain("script");
    expect(stages).toContain("tts");
    expect(stages).toContain("audio");
    expect(stages).toContain("render");
    expect(stages).toContain("encode");
    expect(stages).toContain("postcard");
    expect(stages).toContain("done");
  });

  it("emits audio stage with the resolved mode", async () => {
    const d = makeDeps();
    await runDirectorPipeline({ config, palette: devotional, language: "te", fps: 1, ...d });
    const audioEvent = d.events.find((e) => e.stage === "audio");
    expect(audioEvent.mode).toBe("silent");
  });

  it("aborts mid-capture when signal is fired", async () => {
    const controller = new AbortController();
    const d = makeDeps();
    d.captureFrame = vi.fn(async (t) => {
      if (t > 0.5) controller.abort();
      return { __frame: true, t, close: vi.fn() };
    });
    d.makeRenderer = vi.fn(async () => ({ captureFrame: d.captureFrame, destroy: vi.fn() }));
    await expect(
      runDirectorPipeline({
        config,
        palette: devotional,
        language: "te",
        fps: 4,
        signal: controller.signal,
        ...d,
      }),
    ).rejects.toThrow(/aborted/);
  });

  it("rejects missing config/palette/language", async () => {
    const d = makeDeps();
    await expect(runDirectorPipeline({ palette: devotional, language: "te", ...d })).rejects.toThrow(/config/);
    await expect(runDirectorPipeline({ config, language: "te", ...d })).rejects.toThrow(/palette/);
    await expect(runDirectorPipeline({ config, palette: devotional, ...d })).rejects.toThrow(/language/);
  });

  it("rejects missing makeRenderer or encodeMp4Impl", async () => {
    const d = makeDeps();
    await expect(
      runDirectorPipeline({
        config, palette: devotional, language: "te", fps: 1,
        generate: d.generate, synthesize: d.synthesize, mix: d.mix,
        createAudioBuffer: d.createAudioBuffer,
        encodeMp4Impl: d.encodeMp4Impl, postcard: d.postcard,
      }),
    ).rejects.toThrow(/makeRenderer/);
  });

  it("throws when the script comes back empty", async () => {
    const d = makeDeps();
    d.generate = vi.fn(async () => ({ scenes: [] }));
    await expect(
      runDirectorPipeline({ config, palette: devotional, language: "te", fps: 1, ...d }),
    ).rejects.toThrow(/no scenes/);
  });

  it("runs without createAudioBuffer (audioBuffer === null)", async () => {
    const d = makeDeps();
    const out = await runDirectorPipeline({
      config, palette: devotional, language: "te", fps: 1,
      generate: d.generate, synthesize: d.synthesize, mix: d.mix,
      makeRenderer: d.makeRenderer, encodeMp4Impl: d.encodeMp4Impl,
      postcard: d.postcard, onProgress: d.onProgress,
    });
    expect(out.audioBuffer).toBeNull();
    // Mix still gets called only when createAudioBuffer is provided
    expect(d.mix).not.toHaveBeenCalled();
  });
});
