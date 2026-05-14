/**
 * Tour-mode script request builder.
 *
 * Yatra Director ships two modes:
 *   1. "point-to-point" — the existing flow. A trail with waypoints from
 *      an origin to a destination. Landmarks are emitted as peakMoments
 *      along the trail. directorScript.buildScriptRequest handles this.
 *   2. "tour" — NEW (Yatra v1.8). The user picks N landmarks within one
 *      location and the film visits each as a scene. There is no implicit
 *      trail between them; each POI is the focus.
 *
 * Tour-mode peakMoments map differently:
 *   - First scene: tour intro at the location's geographic center
 *   - One scene per chosen POI, in the order the user picked them
 *   - Last scene: tour outro at the geographic center (or the last POI)
 *
 * Coverage selector (UI in DirectorView) determines the timing weight
 * per POI:
 *   - "equal":      every POI gets the same time slice
 *   - "weighted":   per-POI weight 0..1; normalized to sum=1
 *   - "single":     one POI consumes nearly the whole duration; others
 *                    are 1-2s flyovers
 *
 * The Worker's /v1/script handler doesn't need to know about tours —
 * this module produces the same shape directorScript does (peakMoments
 * + landmarks + meta), but with synthetic peakMoments derived from POI
 * ordering instead of waypoint geometry.
 */

import { detectPeakMoments } from "./peakMoments.js";

/**
 * Pure: resolve a tour's POI ids against the location's landmarks[].
 * Returns the matching landmarks in tour order; missing ids are dropped
 * silently so a hand-edited config can't crash the build.
 */
export function resolveTourPois(config, tourId) {
  if (!config || !Array.isArray(config.tours)) return [];
  const tour = config.tours.find((t) => t.id === tourId);
  if (!tour) return [];
  const byId = new Map((config.landmarks || []).map((l) => [l.id, l]));
  return tour.pois.map((id) => byId.get(id)).filter(Boolean);
}

/**
 * Pure: normalize per-POI weights to sum to 1.
 *
 * `weights` is one of:
 *   - undefined / null / "equal"        → all POIs equal
 *   - "single:<poiId>"                  → that POI gets 0.80, others share 0.20
 *   - { [poiId]: number }               → user-supplied; normalized
 *
 * Returns a Map<poiId, weight 0..1> with poiIds in tour order.
 */
export function normalizeCoverage(pois, weights) {
  const out = new Map();
  if (!Array.isArray(pois) || pois.length === 0) return out;

  if (typeof weights === "string" && weights.startsWith("single:")) {
    const target = weights.slice("single:".length);
    const others = pois.filter((p) => p.id !== target);
    const otherShare = others.length > 0 ? 0.20 / others.length : 0;
    for (const p of pois) {
      out.set(p.id, p.id === target ? 0.80 : otherShare);
    }
    // If target wasn't in the list, fall through to equal.
    if (!pois.some((p) => p.id === target)) {
      return normalizeCoverage(pois, "equal");
    }
    return out;
  }

  if (weights && typeof weights === "object") {
    let sum = 0;
    for (const p of pois) {
      const w = Number(weights[p.id]);
      if (Number.isFinite(w) && w > 0) sum += w;
    }
    if (sum > 0) {
      for (const p of pois) {
        const w = Number(weights[p.id]);
        out.set(p.id, Number.isFinite(w) && w > 0 ? w / sum : 0);
      }
      return out;
    }
    // All weights zero/invalid → fall through to equal
  }

  // Equal split.
  const share = 1 / pois.length;
  for (const p of pois) out.set(p.id, share);
  return out;
}

/**
 * Pure: filter a POI list to the subset the user kept selected.
 *
 * `selection` is one of:
 *   - undefined / null            → all POIs (no filter)
 *   - Set<poiId> | Array<poiId>   → keep only those, in original order
 *
 * Empty selection collapses to "all" rather than blocking the render
 * (the wizard's canAdvance check enforces ≥1 selection upstream).
 */
export function applyPoiSubset(pois, selection) {
  if (!Array.isArray(pois) || pois.length === 0) return [];
  if (selection == null) return pois;
  const ids = selection instanceof Set ? selection : new Set(selection);
  if (ids.size === 0) return pois;
  return pois.filter((p) => ids.has(p.id));
}

/**
 * Pure: turn ordered POIs + coverage weights + total duration into the
 * peakMoments array the Director prompt expects. Each POI becomes a
 * chip at the midpoint of its allocated time slice (so the worker's
 * scene planner can place it naturally).
 *
 * Output shape matches detectPeakMoments(): [{ t, kind, label }, ...].
 */
export function buildTourPeakMoments({ pois, weights, totalDurationS }) {
  if (!Array.isArray(pois) || pois.length === 0) return [];
  const coverage = normalizeCoverage(pois, weights);
  const out = [];
  let cursorT = 0;
  for (const p of pois) {
    const slice = coverage.get(p.id) || 0;
    const midT = Math.min(1, cursorT + slice / 2);
    out.push({
      t: Number(midT.toFixed(3)),
      kind: "tour-stop",
      label: p.name,
      poiId: p.id,
      durationS: Math.max(2, Number((slice * totalDurationS).toFixed(2))),
    });
    cursorT += slice;
  }
  return out;
}

/**
 * Pure: build the /v1/script request body for tour mode.
 *
 * The output is the same shape as directorScript.buildScriptRequest
 * (so the Worker handler stays mode-agnostic), with:
 *   - peakMoments derived from the tour POI order + coverage weights
 *   - landmarks restricted to the chosen tour's POIs
 *   - meta.mode = "tour" so the prompt can branch its narration craft
 */
export function buildTourScriptRequest({
  config,
  tourId,
  tone,
  language,
  personalContext = "",
  coverageWeights,
  poiSubset,             // Set<id> | Array<id> | null — which POIs to keep
  totalDurationS = 30,
}) {
  const allPois = resolveTourPois(config, tourId);
  const pois = applyPoiSubset(allPois, poiSubset);
  const tour = (config?.tours || []).find((t) => t.id === tourId) || null;
  const peakMoments = buildTourPeakMoments({ pois, weights: coverageWeights, totalDurationS });
  const landmarks = pois.map((p) => ({
    id: p.id,
    name: p.name,
    facts: p.subTemplate?.curatedFacts || (p.blurb ? [p.blurb] : []),
    lat: p.lat,
    lon: p.lon,
    narrationHint: p.subTemplate?.narrationHint || "",
    aliases: p.subTemplate?.aliases || [],
  }));
  return {
    routeId: config.id,
    routeTitle: tour ? `${config.title} — ${tour.name}` : config.title,
    tone,
    language,
    mode: "tour",
    tourId: tour?.id || null,
    tourName: tour?.name || null,
    peakMoments,
    landmarks,
    totalDurationS,
    distanceKm: tour?.stats?.distanceKm ?? null,
    elevationGainM: null,
    waypointCount: 0,
    personalContext: typeof personalContext === "string" ? personalContext.trim().slice(0, 500) : "",
  };
}

// Re-export point-to-point detector so callers can pick either flow.
export { detectPeakMoments };
