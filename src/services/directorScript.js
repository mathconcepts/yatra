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

import { detectPeakMoments, selectRouteVariant } from "./peakMoments.js";
import { readUserSettings } from "./userSettings.js";
import { callAnthropicDirect } from "./anthropicDirectClient.js";
import { callOpenRouterDirect } from "./openRouterDirectClient.js";
import { getSystemPrompt, extractSystemPrompt } from "./directorPrompts.js";
import { buildTourScriptRequest } from "./tourScript.js";

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
export function buildScriptRequest({ config, tone, language, personalContext = "", routeVariantId }) {
  const peaks = detectPeakMoments(config, routeVariantId);
  const route = selectRouteVariant(config, routeVariantId);
  const waypoints = route?.waypoints || [];
  // Filter landmarks to those geographically near the selected route
  // variant. Srivari Mettu (2.1km steep ascent) shouldn't see the
  // Alipiri-path landmarks 8km away. We keep landmarks within ~1km of
  // any waypoint on the chosen trail.
  const landmarks = (config.landmarks || [])
    .filter((l) => isNearRoute(l, waypoints))
    .map((l) => ({
      name: l.name,
      facts: l.curatedFacts || l.facts || [],
      lat: l.lat,
      lon: l.lon,
    }));
  const distanceKm = route?.stats?.distanceKm ?? route?.distanceKm ?? null;
  const elevations = waypoints.map((w) => w.elev).filter((e) => Number.isFinite(e));
  const elevationGainM =
    elevations.length > 1
      ? elevations.reduce((acc, e, i) => (i === 0 ? 0 : acc + Math.max(0, e - elevations[i - 1])), 0)
      : null;
  return {
    routeId: config.id,
    routeTitle: route?.name ? `${config.title} — ${route.name}` : config.title,
    routeVariantId: route?.id || null,
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

function isNearRoute(landmark, waypoints, thresholdKm = 1) {
  if (!landmark || !Array.isArray(waypoints) || waypoints.length === 0) return false;
  if (!Number.isFinite(landmark.lat) || !Number.isFinite(landmark.lon)) return false;
  for (const wp of waypoints) {
    if (haversineKm(landmark, wp) <= thresholdKm) return true;
  }
  return false;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
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
export async function generateScript({
  config, tone, language, personalContext = "",
  routeVariantId, mode = "point-to-point", tourId,
  coverageWeights, poiSubset, totalDurationS,
  signal, turnstileToken,
} = {}) {
  if (!config || !tone || !language) {
    throw new Error("generateScript requires {config, tone, language}");
  }

  const settings = readUserSettings();
  // Tour mode and point-to-point mode produce the SAME request shape
  // for the Worker. Both modules expose mode/peakMoments/landmarks/meta.
  // Worker prompt branches on `body.mode`.
  const body = mode === "tour" && tourId
    ? buildTourScriptRequest({ config, tourId, tone, language, personalContext, coverageWeights, poiSubset, totalDurationS })
    : buildScriptRequest({ config, tone, language, personalContext, routeVariantId });

  // BYOK dispatch order (highest specificity → lowest):
  //   1. OpenRouter — explicit choice of model. User picked a specific
  //      provider/model slug; honor it.
  //   2. Anthropic direct — single-provider BYOK.
  //   3. Worker / mock — fallback paths below.
  // All three end with the same {scenes, meta} shape.
  if (settings.openRouterKey && !isMockMode()) {
    const systemPrompt = getSystemPrompt(tone);
    return callOpenRouterDirect({
      apiKey: settings.openRouterKey,
      model: settings.openRouterModel || undefined,
      systemPrompt,
      body,
      signal,
    });
  }
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
    // Mock miss: synthesize a real multi-scene script from the request
    // body so the user sees landmarks + captions on screen even without
    // a Worker. This is intentionally rich — the v1.6 placeholder was a
    // single scene that hid landmark visibility.
    await new Promise((r) => setTimeout(r, 250));
    return buildMockScenesFromBody(body, totalDurationS || 30);
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

/**
 * Pure: turn a /v1/script request body (built by buildScriptRequest OR
 * buildTourScriptRequest) into a realistic multi-scene mock script.
 *
 * Tour mode: one scene per tour-stop peakMoment, with the curated facts
 * baked into the narration. The renderer surfaces narration AND
 * captionText, so even when MP4 audio is silent (dev MOCK) the viewer
 * sees the landmark name + a 1-line description on screen.
 *
 * Point-to-point: one scene per peakMoment chip (origin, destination,
 * each landmark, steepest climb / longest stretch markers). Scenes are
 * evenly spaced over `totalDurationS`. Captions use the landmark blurb
 * trimmed to ~12 words.
 *
 * Exported for tests + reuse.
 */
export function buildMockScenesFromBody(body, totalDurationS = 30) {
  const peaks = Array.isArray(body?.peakMoments) ? body.peakMoments : [];
  const landmarksById = new Map((body?.landmarks || []).map((l) => [l.id || l.name, l]));
  const isTour = body?.mode === "tour";

  if (peaks.length === 0) {
    return {
      routeId: body?.routeId || "unknown",
      tone: body?.tone || "devotional",
      language: body?.language || "en",
      scenes: [
        {
          id: "title",
          tStart: 0,
          tEnd: totalDurationS,
          narration: body?.routeTitle || "A journey",
          captionText: body?.routeTitle || "A journey",
          captionStyle: "headline",
        },
      ],
      meta: { scriptModel: "mock-fallback", totalDurationS, wordCount: 1 },
    };
  }

  let scenes;
  if (isTour) {
    // Tour mode: each peak already has its own durationS. Honor them.
    let cursor = 0;
    scenes = peaks.map((p, i) => {
      const lm = landmarksById.get(p.poiId) || {};
      const dur = Math.max(2, Number(p.durationS) || totalDurationS / peaks.length);
      const tStart = cursor;
      const tEnd = Math.min(totalDurationS, cursor + dur);
      cursor = tEnd;
      const fact = lm.facts?.[0] || lm.narrationHint || "";
      const narration = fact
        ? `${p.label}. ${truncWords(fact, 18)}`
        : `${p.label}.`;
      return {
        id: p.poiId || `stop-${i}`,
        tStart: round1(tStart),
        tEnd: round1(tEnd),
        narration,
        captionText: p.label,
        captionStyle: i === 0 ? "headline" : "subtitle",
      };
    });
    // If rounding left a tail, extend the last scene to total.
    if (scenes.length > 0) scenes[scenes.length - 1].tEnd = totalDurationS;
  } else {
    // Point-to-point: evenly space peaks across the duration.
    const n = peaks.length;
    const slice = totalDurationS / n;
    scenes = peaks.map((p, i) => {
      const lm = (body.landmarks || []).find((l) => l.name === p.label) || {};
      const fact = lm.facts?.[0] || "";
      const narration = fact
        ? `${p.label}. ${truncWords(fact, 16)}`
        : `${p.label}.`;
      return {
        id: p.kind === "origin" || p.kind === "destination" ? p.kind : `peak-${i}`,
        tStart: round1(i * slice),
        tEnd: round1((i + 1) * slice),
        narration,
        captionText: p.label,
        captionStyle: (p.kind === "origin" || p.kind === "destination") ? "headline" : "subtitle",
      };
    });
  }

  return {
    routeId: body?.routeId || "unknown",
    tone: body?.tone || "devotional",
    language: body?.language || "en",
    scenes,
    meta: {
      scriptModel: "mock-fallback",
      totalDurationS,
      wordCount: scenes.reduce((a, s) => a + s.narration.split(/\s+/).length, 0),
      via: isTour ? "mock-tour" : "mock-pp",
    },
  };
}

function truncWords(s, n) {
  if (typeof s !== "string") return "";
  const words = s.trim().split(/\s+/);
  if (words.length <= n) return s.trim();
  return words.slice(0, n).join(" ") + "…";
}

function round1(n) { return Math.round(n * 10) / 10; }

export const __internals = { MOCK_FIXTURES, isMockMode, getWorkerBase };
