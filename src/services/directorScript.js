/**
 * Director script generator. Calls the yatra-director Worker's /v1/script
 * endpoint, or returns a canned fixture when VITE_DIRECTOR_MOCK=1.
 *
 * Mock mode is the contributor's onboarding path: someone clones the
 * repo, runs npm install + npm run dev, picks Yadagiri/Devotional/Telugu,
 * and sees a real script render without ever needing an API key. The
 * full pipeline is gated on keys; the mock lets every step UP TO the
 * mux work end-to-end.
 *
 * Request shape MUST match workers/yatra-director/API.md. Both ends
 * import schemas from a shared file once the worker lives.
 */

import { detectPeakMoments } from "./peakMoments.js";
import { readUserSettings } from "./userSettings.js";
import { callAnthropicDirect } from "./anthropicDirectClient.js";
import { getSystemPrompt, extractSystemPrompt } from "./directorPrompts.js";

import yadagiriDevotionalTe from "../fixtures/directorScript.yadagiri.devotional.te.json";

const MOCK_FIXTURES = {
  "yadagiri-gutta:devotional:te": yadagiriDevotionalTe,
};

function isMockMode() {
  // Vite injects import.meta.env at build time.
  try {
    return import.meta.env?.VITE_DIRECTOR_MOCK === "1";
  } catch {
    return false;
  }
}

function getWorkerBase() {
  try {
    return import.meta.env?.VITE_DIRECTOR_WORKER_URL || "";
  } catch {
    return "";
  }
}

/**
 * Build the request payload from a Yatra location config. Reuses
 * detectPeakMoments so scenes ARE peak moments (no re-derivation).
 */
export function buildScriptRequest({ config, tone, language, personalContext = "" }) {
  const peaks = detectPeakMoments(config);
  const route = config.routes?.[0];
  const waypoints = route?.waypoints || [];
  const landmarks = (config.landmarks || []).map((l) => ({
    name: l.name,
    facts: l.curatedFacts || [], // future field; empty for now
    lat: l.lat,
    lon: l.lon,
  }));
  const distanceKm = route?.distanceKm ?? null;
  const elevations = waypoints.map((w) => w.elev).filter((e) => Number.isFinite(e));
  const elevationGainM =
    elevations.length > 1
      ? elevations.reduce((acc, e, i) => (i === 0 ? 0 : acc + Math.max(0, e - elevations[i - 1])), 0)
      : null;
  return {
    routeId: config.id,
    routeTitle: config.title,
    tone,
    language,
    peakMoments: peaks.map((p) => ({ t: p.t, kind: p.kind, label: p.label })),
    landmarks,
    distanceKm,
    elevationGainM,
    waypointCount: waypoints.length,
    personalContext: typeof personalContext === "string" ? personalContext.trim().slice(0, 500) : "",
  };
}

/**
 * Build an "AI-suggested default" personal note for a given route + tone.
 * Pure (no LLM call) so it's instant and free. The real LLM personalization
 * happens later, when the worker weaves this note into the narration.
 * The user is free to edit or replace the suggestion before directing.
 */
export function suggestPersonalNote({ config, tone }) {
  const title = config?.title || "this journey";
  const templates = {
    devotional: `A quiet return to ${title}. In the footsteps of those who walked before.`,
    explorer: `Tracing the trail to ${title}. Step by step, the path reveals itself.`,
    poetic: `${title}, held in the slow weather of memory.`,
    historical: `${title}. A path walked across generations.`,
  };
  return templates[tone] || templates.devotional;
}

/**
 * Fetch a directed script. Returns { scenes, meta }. Throws on transport
 * or schema failure; caller decides whether to retry only-this-stage.
 */
export async function generateScript({ config, tone, language, personalContext = "", signal, turnstileToken } = {}) {
  if (!config || !tone || !language) {
    throw new Error("generateScript requires {config, tone, language}");
  }

  const settings = readUserSettings();
  const body = buildScriptRequest({ config, tone, language, personalContext });

  // BYOK Anthropic: browser-direct to api.anthropic.com, bypassing our
  // Worker entirely. Trust model: user's long-lived bearer never touches
  // our infrastructure. See SECURITY.md "BYOK trust model".
  if (settings.anthropicKey && !isMockMode()) {
    const systemPrompt = getSystemPrompt(tone);
    return callAnthropicDirect({
      apiKey: settings.anthropicKey,
      systemPrompt,
      body,
      signal,
    });
  }

  if (isMockMode()) {
    const key = `${config.id}:${tone}:${language}`;
    const hit = MOCK_FIXTURES[key];
    if (hit) {
      // Simulate a small delay so the "Composing script" wait state is
      // visible in dev.
      await new Promise((r) => setTimeout(r, 400));
      return hit;
    }
    // Mock miss: synthesize a one-scene placeholder so the pipeline keeps
    // flowing for routes we haven't hand-authored yet.
    return {
      routeId: config.id,
      tone,
      language,
      scenes: [
        {
          id: "origin",
          tStart: 0,
          tEnd: 30,
          narration: `[mock] ${config.title}`,
          captionText: config.title,
          captionStyle: "headline",
        },
      ],
      meta: { scriptModel: "mock-fallback", totalDurationS: 30, wordCount: 0 },
    };
  }

  // Worker path (no BYOK Anthropic). Settings.workerUrl override wins
  // over the build-time env URL.
  const base = (settings.workerUrl && settings.workerUrl.trim()) || getWorkerBase();
  if (!base) {
    throw new Error(
      "VITE_DIRECTOR_WORKER_URL is not set. Set it in .env.local, override it in Settings, or run with VITE_DIRECTOR_MOCK=1 for the canned fixture path.",
    );
  }
  const headers = { "content-type": "application/json" };
  if (turnstileToken) headers["X-Yatra-Turnstile"] = turnstileToken;
  const res = await fetch(`${base.replace(/\/$/, "")}/v1/script`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(`/v1/script ${res.status}: ${detail.slice(0, 240)}`);
  }
  return res.json();
}

export const __internals = { MOCK_FIXTURES, isMockMode, getWorkerBase };
