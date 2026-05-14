/**
 * Director TTS — produce one Float32Array of narration audio per scene,
 * aligned to the project sample rate, ready for the directorAudio mixer
 * to assemble into a master narration channel.
 *
 * Three providers:
 *   - "silent": each scene returns silence of the right duration. Default
 *     for VITE_DIRECTOR_MOCK=1. Lets the entire pipeline (script → mix →
 *     compose → encode) run end-to-end without any audio key, producing
 *     a working silent MP4 you can verify in QuickTime.
 *   - "tone":   silent's audible cousin — a low sine tone per scene so
 *     the developer can hear the timing without paying for TTS.
 *   - "live":   POST to the Worker's /v1/tts, decode the returned audio
 *     bytes to a Float32Array via the host's AudioContext.decodeAudioData.
 *
 * Live mode is the only path that touches network. The other two are
 * pure once you've fixed the duration math. All providers honor the
 * scene's `tEnd - tStart` so timing stays aligned regardless of source.
 *
 * The "silent" default is intentional. The autoplan CEO review said
 * Indic TTS quality is the entire moat and must be validated with a $5
 * ElevenLabs sample before code is worth writing. Until that validation
 * happens, the pipeline ships silent — honest about what it is.
 */

const DEFAULT_SAMPLE_RATE = 48000;

// Lazy-loaded to keep this file usable in non-Vite test envs.
let _readUserSettings = null;
async function loadReadUserSettings() {
  if (_readUserSettings) return _readUserSettings;
  try {
    const mod = await import("./userSettings.js");
    _readUserSettings = mod.readUserSettings;
    return _readUserSettings;
  } catch {
    return () => ({});
  }
}

/** Pure: silence of the requested duration. */
export function synthesizeSilence(durationS, sampleRate = DEFAULT_SAMPLE_RATE) {
  const len = Math.max(0, Math.floor(durationS * sampleRate));
  return new Float32Array(len);
}

/**
 * Pure: a low sine tone of the requested duration. Useful for `tone`
 * mode — the developer hears scene boundaries during pipeline checks
 * without paying for TTS. Tones taper with a 30ms cosine fade-in/out so
 * scene crossfades don't introduce clicks.
 */
export function synthesizeTone(durationS, sampleRate = DEFAULT_SAMPLE_RATE, { freq = 220, amp = 0.15 } = {}) {
  const len = Math.max(0, Math.floor(durationS * sampleRate));
  const out = new Float32Array(len);
  if (len === 0) return out;
  const fade = Math.min(Math.floor(0.03 * sampleRate), Math.floor(len / 2));
  for (let i = 0; i < len; i++) {
    let env = 1;
    if (i < fade) env = 0.5 * (1 - Math.cos((i / fade) * Math.PI));
    else if (i > len - fade) env = 0.5 * (1 - Math.cos(((len - i) / fade) * Math.PI));
    out[i] = amp * env * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return out;
}

function resolveMode(explicit) {
  if (explicit === "silent" || explicit === "tone" || explicit === "live") return explicit;
  try {
    // Explicit override always wins.
    const env = import.meta.env || {};
    const explicitEnv = env.VITE_DIRECTOR_TTS_MODE;
    if (explicitEnv === "silent" || explicitEnv === "tone" || explicitEnv === "live") {
      return explicitEnv;
    }
    // MOCK dev mode → silent narration. The mock script generator
    // emits real captions for every landmark / tour stop, so the MP4
    // still tells the story visually. The audio track is silent
    // (a buzzing sine is too distracting for review). Set
    // VITE_DIRECTOR_TTS_MODE=tone to get scene-boundary tones, or =live
    // for real Google TTS via the Worker.
    if (env.VITE_DIRECTOR_MOCK === "1") return "silent";
  } catch { /* not in vite env */ }
  return "live";
}

function getWorkerBase() {
  try {
    return import.meta.env?.VITE_DIRECTOR_WORKER_URL || "";
  } catch {
    return "";
  }
}

/**
 * Build the /v1/tts request payload for a single scene.
 * Pure; exported for testability.
 */
export function buildTtsRequest({ scene, palette, language, voiceOverride }) {
  if (!scene) throw new Error("buildTtsRequest: scene required");
  if (!palette) throw new Error("buildTtsRequest: palette required");
  if (!language) throw new Error("buildTtsRequest: language required");
  // User-picked voice (from Director wizard "Voice" step) wins over the
  // palette's default. Both are passed through to /v1/tts as voiceId.
  const voiceId = voiceOverride || palette.voice?.voiceIdByLang?.[language];
  if (!voiceId) throw new Error(`buildTtsRequest: no voiceId for ${palette.id}/${language}`);
  return {
    tone: palette.id,
    language,
    voiceId,
    text: scene.narration,
    tempo: palette.voice?.tempo ?? 1.0,
  };
}

/**
 * Fetch + decode one scene's audio from the live Worker. Returns
 * Float32Array of length matching the scene's intended duration —
 * pad with silence or truncate so the scene slot stays exact.
 *
 * Dependencies injected:
 *   fetchImpl     — fetch
 *   decodeAudio   — async (ArrayBuffer, sampleRate) → Float32Array
 */
export async function synthesizeSceneLive(scene, {
  palette,
  language,
  sampleRate,
  workerBase,
  fetchImpl = globalThis.fetch,
  decodeAudio,
  signal,
  userTtsKey,         // BYOK Google TTS key from userSettings
  turnstileToken,     // Turnstile token captured by widget
  voiceOverride,      // user-picked voice from Director Voice step
}) {
  if (!workerBase) throw new Error("synthesizeSceneLive: workerBase required (VITE_DIRECTOR_WORKER_URL)");
  if (typeof fetchImpl !== "function") throw new Error("synthesizeSceneLive: fetchImpl required");
  if (typeof decodeAudio !== "function") throw new Error("synthesizeSceneLive: decodeAudio required");

  const body = buildTtsRequest({ scene, palette, language, voiceOverride });
  const headers = { "content-type": "application/json" };
  if (turnstileToken) headers["X-Yatra-Turnstile"] = turnstileToken;
  if (userTtsKey) headers["X-Yatra-User-TTS-Key"] = userTtsKey;
  const res = await fetchImpl(`${workerBase.replace(/\/$/, "")}/v1/tts`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let detail = "";
    try { detail = await res.text(); } catch { /* ignore */ }
    throw new Error(`/v1/tts ${res.status}: ${detail.slice(0, 240)}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const samples = await decodeAudio(arrayBuffer, sampleRate);
  return alignToSceneDuration(samples, scene.tEnd - scene.tStart, sampleRate);
}

/**
 * Pure: pad or truncate `samples` so it matches `durationS * sampleRate`
 * samples exactly. TTS providers don't return audio of the exact
 * requested length; the master timeline expects each scene to fit its
 * slot.
 */
export function alignToSceneDuration(samples, durationS, sampleRate) {
  const targetLen = Math.max(0, Math.floor(durationS * sampleRate));
  if (targetLen === 0) return new Float32Array(0);
  const src = samples || new Float32Array(0);
  if (src.length === targetLen) return src;
  const out = new Float32Array(targetLen);
  out.set(src.subarray(0, Math.min(src.length, targetLen)));
  return out;
}

/**
 * Synthesize every scene in a script. Returns Float32Array[] aligned to
 * the scene order in `scenes`.
 *
 * `mode` defaults to "silent" when VITE_DIRECTOR_MOCK=1 is set, else
 * "live". Callers override for explicit testing (e.g., "tone" during a
 * quick QA pass).
 */
export async function synthesizeScenes({
  scenes,
  palette,
  language,
  sampleRate = DEFAULT_SAMPLE_RATE,
  mode,
  workerBase = getWorkerBase(),
  fetchImpl,
  decodeAudio,
  signal,
  userTtsKey,        // BYOK Google TTS key (forwarded to /v1/tts via header)
  turnstileToken,    // Turnstile token from widget (omitted in dev / BYOK)
  voiceOverride,     // user-picked voice from Director Voice step
} = {}) {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error("synthesizeScenes: scenes array required");
  }
  if (!palette) throw new Error("synthesizeScenes: palette required");
  if (!language) throw new Error("synthesizeScenes: language required");

  const resolved = resolveMode(mode);
  const out = [];

  if (resolved === "silent") {
    for (const s of scenes) {
      out.push(synthesizeSilence(s.tEnd - s.tStart, sampleRate));
    }
    return { tracks: out, mode: "silent" };
  }
  if (resolved === "tone") {
    for (const s of scenes) {
      out.push(synthesizeTone(s.tEnd - s.tStart, sampleRate));
    }
    return { tracks: out, mode: "tone" };
  }

  // live
  if (!workerBase) {
    throw new Error("VITE_DIRECTOR_WORKER_URL is not set. Set mode='silent' to bypass.");
  }
  // Auto-pull BYOK key + (caller may still override) so callers don't
  // have to thread settings through every layer.
  let effectiveUserTtsKey = userTtsKey;
  let effectiveWorkerBase = workerBase;
  if (effectiveUserTtsKey === undefined) {
    const read = await loadReadUserSettings();
    const s = read();
    if (s.googleTtsKey) effectiveUserTtsKey = s.googleTtsKey;
    if (s.workerUrl && s.workerUrl.trim()) effectiveWorkerBase = s.workerUrl.trim();
  }
  for (const s of scenes) {
    const buf = await synthesizeSceneLive(s, {
      palette,
      language,
      sampleRate,
      workerBase: effectiveWorkerBase,
      fetchImpl,
      decodeAudio,
      signal,
      userTtsKey: effectiveUserTtsKey,
      turnstileToken,
      voiceOverride,
    });
    out.push(buf);
  }
  return { tracks: out, mode: "live" };
}

/**
 * Convenience: extract the scene-start seconds array from a scene list.
 * directorAudio.mixDirectorAudio wants {sceneTracks, sceneStartsS}.
 */
export function sceneStarts(scenes) {
  return scenes.map((s) => s.tStart);
}

export const __internals = { resolveMode, getWorkerBase, DEFAULT_SAMPLE_RATE };
