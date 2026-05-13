/**
 * Google Cloud Text-to-Speech client for the yatra-director Worker.
 *
 * Why Google Cloud TTS as the v1 backend:
 *   - Free tier: 1M chars/month standard + 1M chars/month Wavenet/Neural2.
 *     For a side project that's effectively unmetered.
 *   - Native Indic voices: te-IN, hi-IN, ta-IN are all first-class with
 *     Wavenet quality. en-IN gives Indian-English accent — fits the
 *     pilgrimage context better than en-US.
 *   - Simple REST: single POST with an API key in a query param. No
 *     OAuth flow, no WebSocket protocol-sniffing.
 *   - Stable: official Google product, not a reverse-engineered endpoint.
 *
 * Pure split (same pattern as claudeClient):
 *   - buildGoogleTtsRequest: pure builder for the API body
 *   - parseGoogleTtsResponse: pure base64-to-bytes decoder
 *   - callGoogleTTS: thin fetch wrapper; tests inject fetchImpl
 *
 * Cost ceiling, with default Wavenet voices at $0.016 / 1000 chars (paid
 * tier — but the free tier covers 1M chars/month per voice family):
 *   ~120 chars × 4 langs × ~10k renders/month = 4.8M chars = $76/month
 *   IF every render were a Wavenet voice. With idempotency cache in R2,
 *   real cost should stay near zero. See SECURITY.md.
 */

const ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";

/** Map our language codes to Google's BCP-47 locales. */
export const LANGUAGE_TO_LOCALE = {
  en: "en-IN", // Indian English accent fits pilgrimage context
  hi: "hi-IN",
  te: "te-IN",
  ta: "ta-IN",
};

/**
 * Pure: build the Google TTS request body.
 *
 * `voiceId` should be a real Google voice name (e.g., "te-IN-Standard-A").
 * `tempo` maps to Google's `speakingRate` field (0.25–4.0).
 */
export function buildGoogleTtsRequest({ text, voiceId, language, tempo = 1.0 } = {}) {
  if (!text || typeof text !== "string") throw new Error("buildGoogleTtsRequest: text required");
  if (!voiceId || typeof voiceId !== "string") throw new Error("buildGoogleTtsRequest: voiceId required");
  if (!language || !LANGUAGE_TO_LOCALE[language]) {
    throw new Error(`buildGoogleTtsRequest: unsupported language ${language}`);
  }
  const speakingRate = Math.max(0.25, Math.min(4.0, Number(tempo) || 1.0));
  return {
    input: { text },
    voice: {
      languageCode: LANGUAGE_TO_LOCALE[language],
      name: voiceId,
    },
    audioConfig: {
      audioEncoding: "MP3",
      speakingRate,
      sampleRateHertz: 24000, // Google TTS native; resampled to 48k client-side
    },
  };
}

/**
 * Pure: decode Google's base64-encoded audio bytes into an ArrayBuffer.
 * Google returns `{ audioContent: "<base64 mp3>" }` on success.
 */
export function parseGoogleTtsResponse(json) {
  if (!json || typeof json !== "object") throw new Error("parseGoogleTtsResponse: empty body");
  const b64 = json.audioContent;
  if (!b64 || typeof b64 !== "string") throw new Error("parseGoogleTtsResponse: missing audioContent");
  return base64ToArrayBuffer(b64);
}

/**
 * Pure: base64 → ArrayBuffer. Works in both Worker and jsdom test envs
 * (atob is available in both). Strips whitespace defensively.
 */
export function base64ToArrayBuffer(b64) {
  const clean = b64.replace(/\s+/g, "");
  const bin = typeof atob === "function" ? atob(clean) : Buffer.from(clean, "base64").toString("binary");
  const len = bin.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/**
 * Call Google Cloud TTS. Returns an ArrayBuffer of MP3 audio bytes.
 *
 * Error codes mirror claudeClient for symmetry:
 *   - "auth"    → 401/403 from Google (bad key, key restrictions, billing)
 *   - "rate"    → 429 (quota or burst limit exceeded)
 *   - "timeout" → AbortController fired
 *   - "parse"   → 4xx/5xx other, or response missing audioContent
 */
export async function callGoogleTTS({
  apiKey,
  text,
  voiceId,
  language,
  tempo,
  fetchImpl = globalThis.fetch,
  timeoutMs = 12000,
} = {}) {
  if (!apiKey) throw withCode("auth", "GOOGLE_TTS_API_KEY not provisioned");
  if (typeof fetchImpl !== "function") throw withCode("parse", "fetch not available");

  const body = buildGoogleTtsRequest({ text, voiceId, language, tempo });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === "AbortError") throw withCode("timeout", `Google TTS exceeded ${timeoutMs}ms`);
    throw withCode("parse", `fetch failed: ${err?.message || err}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) throw withCode("auth", "Google rejected the API key (check key restrictions and that the TTS API is enabled)");
  if (res.status === 429) throw withCode("rate", "Google TTS quota exceeded");
  if (!res.ok) {
    const detail = await safeText(res);
    throw withCode("parse", `Google TTS ${res.status}: ${detail.slice(0, 240)}`);
  }
  const json = await res.json();
  return parseGoogleTtsResponse(json);
}

function withCode(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

async function safeText(res) {
  try { return await res.text(); } catch { return ""; }
}
