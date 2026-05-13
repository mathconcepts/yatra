/**
 * Shared request/response schemas for the yatra-director Worker.
 *
 * Imported by BOTH the Worker (workers/yatra-director/src/index.js) and
 * the React client (src/services/directorScript.js can adopt this later
 * for symmetric validation). The contract lives here, not duplicated in
 * two places.
 *
 * Plain JS validators — zero deps — so this can run in both a Worker
 * (no node_modules) and in the Vite client bundle. If we ever need a
 * heavier validator, swap to Zod and keep the export names stable.
 */

export const TONES = ["devotional", "explorer", "poetic", "historical"];
export const LANGUAGES = ["en", "hi", "te", "ta"];
export const PEAK_KINDS = ["origin", "destination", "landmark", "steepest", "longest"];

/** Validate a /v1/script request. Returns [] on success, [errors] on fail. */
export function validateScriptRequest(body) {
  const errs = [];
  if (!body || typeof body !== "object") return ["body must be a JSON object"];
  if (typeof body.routeId !== "string" || !body.routeId) errs.push("routeId: required string");
  if (typeof body.routeTitle !== "string" || !body.routeTitle) errs.push("routeTitle: required string");
  if (!TONES.includes(body.tone)) errs.push(`tone: one of ${TONES.join(", ")}`);
  if (!LANGUAGES.includes(body.language)) errs.push(`language: one of ${LANGUAGES.join(", ")}`);
  if (!Array.isArray(body.peakMoments) || body.peakMoments.length < 1 || body.peakMoments.length > 8) {
    errs.push("peakMoments: 1-8 entries");
  } else {
    for (let i = 0; i < body.peakMoments.length; i++) {
      const p = body.peakMoments[i];
      if (typeof p.t !== "number" || p.t < 0 || p.t > 1) errs.push(`peakMoments[${i}].t: number in [0,1]`);
      if (!PEAK_KINDS.includes(p.kind)) errs.push(`peakMoments[${i}].kind: one of ${PEAK_KINDS.join(", ")}`);
      if (typeof p.label !== "string") errs.push(`peakMoments[${i}].label: string`);
    }
  }
  if (body.landmarks !== undefined && !Array.isArray(body.landmarks)) {
    errs.push("landmarks: array if present");
  }
  if (body.distanceKm !== undefined && body.distanceKm !== null && typeof body.distanceKm !== "number") {
    errs.push("distanceKm: number or null");
  }
  if (body.elevationGainM !== undefined && body.elevationGainM !== null && typeof body.elevationGainM !== "number") {
    errs.push("elevationGainM: number or null");
  }
  if (typeof body.waypointCount !== "number") errs.push("waypointCount: number");
  return errs;
}

/** Validate a /v1/script response. Mirrors the worker's contract. */
export function validateScriptResponse(body) {
  const errs = [];
  if (!body || typeof body !== "object") return ["response must be a JSON object"];
  if (typeof body.routeId !== "string") errs.push("routeId: string");
  if (!TONES.includes(body.tone)) errs.push("tone");
  if (!LANGUAGES.includes(body.language)) errs.push("language");
  if (!Array.isArray(body.scenes) || body.scenes.length < 1) errs.push("scenes: nonempty array");
  else {
    for (let i = 0; i < body.scenes.length; i++) {
      const s = body.scenes[i];
      if (typeof s.id !== "string") errs.push(`scenes[${i}].id`);
      if (typeof s.tStart !== "number") errs.push(`scenes[${i}].tStart`);
      if (typeof s.tEnd !== "number") errs.push(`scenes[${i}].tEnd`);
      if (s.tEnd <= s.tStart) errs.push(`scenes[${i}]: tEnd must exceed tStart`);
      if (typeof s.narration !== "string") errs.push(`scenes[${i}].narration`);
      if (typeof s.captionText !== "string") errs.push(`scenes[${i}].captionText`);
    }
  }
  if (!body.meta || typeof body.meta !== "object") errs.push("meta: required object");
  return errs;
}

/** Build an RFC-7807 problem document. */
export function problem({ slug, title, status, detail, cause, fix, requestId }) {
  return {
    type: `https://yatra/errors/${slug}`,
    title,
    status,
    detail,
    cause,
    fix,
    requestId,
  };
}
