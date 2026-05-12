/**
 * AudioEncoder pipeline — decode an audio Blob (the composer's
 * MediaRecorder output, usually audio/webm with Opus) and re-encode as
 * AAC chunks that mp4-muxer accepts.
 *
 * The browser path:
 *   Blob → ArrayBuffer → AudioContext.decodeAudioData → AudioBuffer
 *   → per-frame ChunkedAudioData(s) → AudioEncoder ("mp4a.40.2") → callback
 *
 * Public API:
 *   isAudioEncodeSupported() — feature detect AudioEncoder
 *   encodeAudio(blob, { sampleRate, onChunk })
 *     → { numberOfChannels, sampleRate, durationSec }
 *
 * The caller adds each chunk to mp4-muxer via `muxer.addAudioChunk`.
 * Pure helpers (`framesForBuffer`) are unit-tested without WebCodecs.
 */

const DEFAULT_SAMPLE_RATE = 48000;
const FRAME_SAMPLES = 1024; // AAC LC frame size

export function isAudioEncodeSupported(scope = typeof globalThis !== "undefined" ? globalThis : {}) {
  const missing = [];
  if (typeof scope.AudioEncoder === "undefined") missing.push("AudioEncoder");
  if (typeof scope.AudioData === "undefined") missing.push("AudioData");
  if (typeof scope.AudioContext === "undefined" && typeof scope.webkitAudioContext === "undefined") {
    missing.push("AudioContext");
  }
  return { supported: missing.length === 0, missing };
}

/**
 * Pure: split a total sample count into FRAME_SAMPLES-sized slices.
 * Returns array of { sampleStart, sampleCount, timestampUs }.
 * Exported for unit tests.
 */
export function framesForBuffer(totalSamples, sampleRate = DEFAULT_SAMPLE_RATE, frameSize = FRAME_SAMPLES) {
  if (!Number.isFinite(totalSamples) || totalSamples <= 0) return [];
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return [];
  const out = [];
  for (let s = 0; s < totalSamples; s += frameSize) {
    const count = Math.min(frameSize, totalSamples - s);
    out.push({
      sampleStart: s,
      sampleCount: count,
      timestampUs: Math.round((s / sampleRate) * 1_000_000),
    });
  }
  return out;
}

/**
 * Decode an audio Blob into an AudioBuffer.
 * Returns null on failure (caller falls back to video-only).
 */
export async function decodeAudioBlob(blob) {
  if (!blob || typeof blob.arrayBuffer !== "function") return null;
  if (typeof AudioContext === "undefined" && typeof webkitAudioContext === "undefined") return null;
  const Ctx = typeof AudioContext !== "undefined" ? AudioContext : webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buf = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(buf);
    return audioBuffer;
  } catch {
    return null;
  } finally {
    try { await ctx.close(); } catch { /* */ }
  }
}

/**
 * Encode an AudioBuffer's PCM data to AAC chunks via AudioEncoder.
 * Calls `onChunk(encodedChunk, meta)` for each emitted chunk so the
 * caller can mux it.
 *
 * Resolves with { numberOfChannels, sampleRate, durationSec }.
 * Throws if AudioEncoder is unavailable or configure() fails.
 */
export async function encodeAacFromBuffer(audioBuffer, { onChunk } = {}) {
  if (!audioBuffer) throw new Error("No audio buffer");
  if (typeof globalThis.AudioEncoder === "undefined" || typeof globalThis.AudioData === "undefined") {
    throw new Error("AudioEncoder unavailable");
  }
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const total = audioBuffer.length;
  const plan = framesForBuffer(total, sampleRate);

  const encoder = new globalThis.AudioEncoder({
    output: (chunk, meta) => { if (typeof onChunk === "function") onChunk(chunk, meta); },
    error: (e) => { throw e; },
  });
  encoder.configure({
    codec: "mp4a.40.2",
    numberOfChannels: channels,
    sampleRate,
    bitrate: 128_000,
  });

  // Interleave PCM channels into one Float32Array per AAC frame.
  const channelData = [];
  for (let c = 0; c < channels; c++) channelData.push(audioBuffer.getChannelData(c));

  for (const f of plan) {
    const interleaved = new Float32Array(f.sampleCount * channels);
    for (let s = 0; s < f.sampleCount; s++) {
      for (let c = 0; c < channels; c++) {
        interleaved[s * channels + c] = channelData[c][f.sampleStart + s];
      }
    }
    const data = new globalThis.AudioData({
      format: "f32",
      sampleRate,
      numberOfFrames: f.sampleCount,
      numberOfChannels: channels,
      timestamp: f.timestampUs,
      data: interleaved,
    });
    encoder.encode(data);
    data.close();
  }
  await encoder.flush();
  encoder.close();

  return {
    numberOfChannels: channels,
    sampleRate,
    durationSec: total / sampleRate,
  };
}
