import { describe, it, expect, vi } from "vitest";
import {
  buildGoogleTtsRequest,
  parseGoogleTtsResponse,
  base64ToArrayBuffer,
  callGoogleTTS,
  LANGUAGE_TO_LOCALE,
} from "../workers/yatra-director/googleTtsClient.js";

describe("LANGUAGE_TO_LOCALE", () => {
  it("maps all four supported languages to BCP-47 Indic locales", () => {
    expect(LANGUAGE_TO_LOCALE).toEqual({
      en: "en-IN",
      hi: "hi-IN",
      te: "te-IN",
      ta: "ta-IN",
    });
  });
});

describe("buildGoogleTtsRequest", () => {
  it("assembles a valid request with MP3 audio encoding", () => {
    const req = buildGoogleTtsRequest({
      text: "ఆరంభం",
      voiceId: "te-IN-Standard-A",
      language: "te",
      tempo: 0.92,
    });
    expect(req.input.text).toBe("ఆరంభం");
    expect(req.voice.languageCode).toBe("te-IN");
    expect(req.voice.name).toBe("te-IN-Standard-A");
    expect(req.audioConfig.audioEncoding).toBe("MP3");
    expect(req.audioConfig.speakingRate).toBeCloseTo(0.92);
    expect(req.audioConfig.sampleRateHertz).toBe(24000);
  });

  it("clamps speakingRate to Google's [0.25, 4.0] range", () => {
    const fast = buildGoogleTtsRequest({ text: "x", voiceId: "v", language: "en", tempo: 10 });
    const slow = buildGoogleTtsRequest({ text: "x", voiceId: "v", language: "en", tempo: 0.001 });
    expect(fast.audioConfig.speakingRate).toBe(4.0);
    expect(slow.audioConfig.speakingRate).toBe(0.25);
  });

  it("defaults tempo to 1.0 when omitted or invalid", () => {
    const a = buildGoogleTtsRequest({ text: "x", voiceId: "v", language: "en" });
    const b = buildGoogleTtsRequest({ text: "x", voiceId: "v", language: "en", tempo: "garbage" });
    expect(a.audioConfig.speakingRate).toBe(1.0);
    expect(b.audioConfig.speakingRate).toBe(1.0);
  });

  it("rejects missing or unsupported fields", () => {
    expect(() => buildGoogleTtsRequest({ voiceId: "v", language: "te" })).toThrow(/text/);
    expect(() => buildGoogleTtsRequest({ text: "x", language: "te" })).toThrow(/voiceId/);
    expect(() => buildGoogleTtsRequest({ text: "x", voiceId: "v", language: "zz" })).toThrow(/unsupported/);
    expect(() => buildGoogleTtsRequest({ text: "x", voiceId: "v" })).toThrow(/unsupported/);
  });
});

describe("base64ToArrayBuffer", () => {
  it("decodes a known base64 string", () => {
    // "hello" in base64
    const buf = base64ToArrayBuffer("aGVsbG8=");
    const bytes = new Uint8Array(buf);
    expect(bytes).toHaveLength(5);
    expect(bytes[0]).toBe(0x68); // 'h'
    expect(bytes[4]).toBe(0x6f); // 'o'
  });

  it("strips whitespace defensively", () => {
    const buf = base64ToArrayBuffer("aGVsbG8 =");
    expect(new Uint8Array(buf)).toHaveLength(5);
  });
});

describe("parseGoogleTtsResponse", () => {
  it("decodes the audioContent base64 into an ArrayBuffer", () => {
    const buf = parseGoogleTtsResponse({ audioContent: "aGVsbG8=" });
    expect(buf).toBeInstanceOf(ArrayBuffer);
    expect(buf.byteLength).toBe(5);
  });

  it("throws when audioContent is missing", () => {
    expect(() => parseGoogleTtsResponse({})).toThrow(/audioContent/);
    expect(() => parseGoogleTtsResponse({ audioContent: 42 })).toThrow(/audioContent/);
  });

  it("throws on empty body", () => {
    expect(() => parseGoogleTtsResponse(null)).toThrow(/empty/);
  });
});

describe("callGoogleTTS", () => {
  it("posts to the Google endpoint with key in query", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ audioContent: "aGVsbG8=" }),
    }));
    const out = await callGoogleTTS({
      apiKey: "AIza-test",
      text: "ఆరంభం",
      voiceId: "te-IN-Standard-A",
      language: "te",
      tempo: 0.92,
      fetchImpl,
    });
    expect(out).toBeInstanceOf(ArrayBuffer);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("https://texttospeech.googleapis.com/v1/text:synthesize");
    expect(url).toContain("key=AIza-test");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body);
    expect(body.voice.name).toBe("te-IN-Standard-A");
    expect(body.audioConfig.audioEncoding).toBe("MP3");
  });

  it("throws code=auth when apiKey is absent", async () => {
    await expect(callGoogleTTS({ text: "x", voiceId: "v", language: "en", fetchImpl: async () => ({}) })).rejects.toMatchObject({ code: "auth" });
  });

  it("throws code=auth on 401/403", async () => {
    const fetchImpl = async () => ({ ok: false, status: 403, text: async () => "forbidden" });
    await expect(callGoogleTTS({ apiKey: "k", text: "x", voiceId: "v", language: "en", fetchImpl })).rejects.toMatchObject({ code: "auth" });
  });

  it("throws code=rate on 429", async () => {
    const fetchImpl = async () => ({ ok: false, status: 429, text: async () => "quota" });
    await expect(callGoogleTTS({ apiKey: "k", text: "x", voiceId: "v", language: "en", fetchImpl })).rejects.toMatchObject({ code: "rate" });
  });

  it("throws code=parse on other 4xx/5xx", async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, text: async () => "boom" });
    await expect(callGoogleTTS({ apiKey: "k", text: "x", voiceId: "v", language: "en", fetchImpl })).rejects.toMatchObject({ code: "parse" });
  });

  it("throws code=timeout when fetch aborts", async () => {
    const fetchImpl = async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    };
    await expect(callGoogleTTS({ apiKey: "k", text: "x", voiceId: "v", language: "en", fetchImpl, timeoutMs: 5 })).rejects.toMatchObject({ code: "timeout" });
  });

  it("rejects when response lacks audioContent", async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({}) });
    // parseGoogleTtsResponse throws a plain Error without a `code` field;
    // the Worker maps it to upstream-tts/502 anyway.
    await expect(callGoogleTTS({ apiKey: "k", text: "x", voiceId: "v", language: "en", fetchImpl }))
      .rejects.toThrow(/audioContent/);
  });
});
