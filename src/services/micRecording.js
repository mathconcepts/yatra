/**
 * Mic recording — capture user voice per scene via MediaRecorder, then
 * decode each Blob into an AudioBuffer the directorAudio mixer can
 * splice into the narration track.
 *
 * Flow:
 *   1. requestMic()                 → MediaStream (asks for permission once)
 *   2. recordScene(stream, options) → Blob (one scene at a time)
 *   3. decodeScene(blob, ctx)       → AudioBuffer aligned to scene length
 *
 * The recorder uses webm/opus where supported (every modern Android
 * Chrome and desktop Chrome/Firefox). Decode goes through the standard
 * AudioContext.decodeAudioData path — same one BGM uses — so the
 * resulting AudioBuffer is a drop-in replacement for the TTS-produced
 * one.
 */

const PREFERRED_MIME = "audio/webm;codecs=opus";

/**
 * Pick a MIME type the current browser supports. Returns the first
 * matching from a fallback chain. `undefined` on iOS Safari where
 * MediaRecorder accepts no explicit type but works with the default.
 */
export function pickSupportedMime(MR = globalThis.MediaRecorder) {
  if (typeof MR === "undefined" || typeof MR.isTypeSupported !== "function") return undefined;
  const candidates = [
    PREFERRED_MIME,
    "audio/webm",
    "audio/mp4",        // iOS Safari 14+
    "audio/ogg;codecs=opus",
  ];
  for (const c of candidates) {
    if (MR.isTypeSupported(c)) return c;
  }
  return undefined;
}

/**
 * Ask the OS for mic access. Returns a MediaStream the caller passes
 * to recordScene. Caller is responsible for stopping tracks when done.
 */
export async function requestMic() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone API unavailable in this browser.");
  }
  return await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
}

/**
 * Record one scene. Returns a Promise<Blob>. The caller invokes
 * `controller.stop()` when the user releases the record button.
 *
 * Returns { promise, controller } so the UI can wire the stop action
 * to a button release / re-tap.
 */
export function recordScene({ stream, MR = globalThis.MediaRecorder }) {
  if (!stream) throw new Error("recordScene: stream required");
  if (typeof MR === "undefined") throw new Error("MediaRecorder unavailable");
  const mime = pickSupportedMime(MR);
  const recorder = mime ? new MR(stream, { mimeType: mime }) : new MR(stream);
  const chunks = [];
  recorder.addEventListener("dataavailable", (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  });
  const promise = new Promise((resolve, reject) => {
    recorder.addEventListener("stop", () => {
      const blob = new Blob(chunks, { type: mime || "audio/webm" });
      resolve(blob);
    });
    recorder.addEventListener("error", (e) => reject(e?.error || new Error("recordScene: error")));
  });
  recorder.start();
  return {
    promise,
    controller: {
      stop: () => { try { recorder.stop(); } catch { /* already stopped */ } },
      pause: () => recorder.pause?.(),
      resume: () => recorder.resume?.(),
      state: () => recorder.state,
    },
  };
}

/**
 * Decode one scene blob into an AudioBuffer of the requested length.
 * Pads with silence if the recording is short, truncates if long.
 */
export async function decodeScene({
  blob,
  audioContext,
  durationS,
  sampleRate = 48000,
}) {
  if (!blob) return new Float32Array(Math.floor(durationS * sampleRate));
  if (!audioContext?.decodeAudioData) {
    throw new Error("decodeScene: AudioContext required");
  }
  const ab = await blob.arrayBuffer();
  let decoded;
  try {
    decoded = await audioContext.decodeAudioData(ab);
  } catch {
    return new Float32Array(Math.floor(durationS * sampleRate));
  }
  const targetLen = Math.floor(durationS * sampleRate);
  // Resample with simple linear interpolation if rates differ. For
  // recordings at 48kHz (default on Android) and target 48kHz, this
  // is a no-op straight copy.
  return resampleAndFitMono(decoded, targetLen, sampleRate);
}

/**
 * Pure: collapse a multi-channel AudioBuffer to mono and fit it into
 * `targetLen` samples at the project sample rate. Resampling uses
 * linear interpolation; precise enough for narration.
 */
export function resampleAndFitMono(decoded, targetLen, targetSampleRate) {
  if (!decoded || decoded.length === 0) return new Float32Array(targetLen);
  const channels = decoded.numberOfChannels || 1;
  const srcLen = decoded.length;
  const srcRate = decoded.sampleRate;
  const ratio = srcRate / targetSampleRate;
  const out = new Float32Array(targetLen);
  const srcMixed = new Float32Array(srcLen);
  for (let ch = 0; ch < channels; ch++) {
    const data = decoded.getChannelData(ch);
    for (let i = 0; i < srcLen; i++) srcMixed[i] += data[i] / channels;
  }
  for (let i = 0; i < targetLen; i++) {
    const srcIdx = i * ratio;
    const loRaw = Math.floor(srcIdx);
    if (loRaw >= srcLen) {
      // Past the end of the source — pad with the last value (or 0 if
      // the source is empty). Avoids NaN from out-of-bounds reads.
      out[i] = srcLen > 0 ? srcMixed[srcLen - 1] : 0;
      continue;
    }
    const lo = loRaw;
    const hi = Math.min(srcLen - 1, lo + 1);
    const frac = srcIdx - lo;
    out[i] = srcMixed[lo] * (1 - frac) + srcMixed[hi] * frac;
  }
  return out;
}

/**
 * Stop all tracks on a MediaStream. Call when the recording session is
 * complete so the OS releases the mic indicator.
 */
export function releaseMic(stream) {
  if (!stream || !stream.getTracks) return;
  stream.getTracks().forEach((t) => t.stop());
}
