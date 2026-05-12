/**
 * Memory Composer state — pure reducer + initial state shape.
 *
 * The composer builds a LocationConfig-shaped object slice-by-slice as the
 * user fills out the form. Once "Preview reel" is hit the draft is passed
 * to ReelPlayer just like a curated journey.
 *
 * State shape:
 *   {
 *     title:        string,
 *     origin:       { name, lat, lon } | null,
 *     destination:  { name, lat, lon } | null,
 *     waypoints:    Array<{lat,lon,elev?}>,     // from GPX or A→B interpolation
 *     landmarks:    Array<{id,name,lat,lon,blurb,photo?}>,
 *     narrationUrl: string | null,              // blob: URL from MediaRecorder
 *     mode:         "road" | "rail" | "trail" | "mixed",
 *     status:       "draft" | "ready" | "exporting",
 *     errors:       Array<string>,
 *   }
 *
 * The reducer is the single mutation point. Tests exercise every action.
 */

export const COMPOSER_ACTIONS = {
  SET_TITLE: "SET_TITLE",
  SET_ORIGIN: "SET_ORIGIN",
  SET_DESTINATION: "SET_DESTINATION",
  SET_WAYPOINTS: "SET_WAYPOINTS",
  ADD_LANDMARK: "ADD_LANDMARK",
  REMOVE_LANDMARK: "REMOVE_LANDMARK",
  SET_NARRATION: "SET_NARRATION",
  SET_MODE: "SET_MODE",
  SET_STATUS: "SET_STATUS",
  ADD_ERROR: "ADD_ERROR",
  CLEAR_ERRORS: "CLEAR_ERRORS",
  RESET: "RESET",
};

export const initialComposerState = {
  title: "",
  origin: null,
  destination: null,
  waypoints: [],
  landmarks: [],
  narrationUrl: null,
  mode: "road",
  status: "draft",
  errors: [],
};

export function composerReducer(state, action) {
  switch (action.type) {
    case COMPOSER_ACTIONS.SET_TITLE:
      return { ...state, title: String(action.payload || "") };
    case COMPOSER_ACTIONS.SET_ORIGIN:
      return { ...state, origin: action.payload || null };
    case COMPOSER_ACTIONS.SET_DESTINATION:
      return { ...state, destination: action.payload || null };
    case COMPOSER_ACTIONS.SET_WAYPOINTS:
      return { ...state, waypoints: Array.isArray(action.payload) ? action.payload : [] };
    case COMPOSER_ACTIONS.ADD_LANDMARK: {
      const lm = action.payload;
      if (!lm || typeof lm.lat !== "number" || typeof lm.lon !== "number") return state;
      const id = lm.id || `lm-${state.landmarks.length + 1}`;
      return { ...state, landmarks: [...state.landmarks, { ...lm, id }] };
    }
    case COMPOSER_ACTIONS.REMOVE_LANDMARK:
      return { ...state, landmarks: state.landmarks.filter((l) => l.id !== action.payload) };
    case COMPOSER_ACTIONS.SET_NARRATION:
      return { ...state, narrationUrl: action.payload || null };
    case COMPOSER_ACTIONS.SET_MODE: {
      const valid = ["road", "rail", "trail", "mixed"];
      return valid.includes(action.payload) ? { ...state, mode: action.payload } : state;
    }
    case COMPOSER_ACTIONS.SET_STATUS: {
      const valid = ["draft", "ready", "exporting"];
      return valid.includes(action.payload) ? { ...state, status: action.payload } : state;
    }
    case COMPOSER_ACTIONS.ADD_ERROR:
      return { ...state, errors: [...state.errors, String(action.payload || "")] };
    case COMPOSER_ACTIONS.CLEAR_ERRORS:
      return { ...state, errors: [] };
    case COMPOSER_ACTIONS.RESET:
      return initialComposerState;
    default:
      return state;
  }
}

/**
 * Pure: is the composer state ready to preview? Needs title + origin +
 * destination + at least one waypoint (which can be derived from O+D).
 */
export function isReadyToPreview(state) {
  if (!state) return false;
  if (!state.title || !state.title.trim()) return false;
  if (!state.origin || !state.destination) return false;
  if (state.waypoints.length < 2) return false;
  return true;
}

/**
 * Pure: project composer state into a LocationConfig-shaped object that
 * ReelPlayer can render. Returns null when not ready.
 */
export function toLocationConfig(state) {
  if (!isReadyToPreview(state)) return null;
  const lats = state.waypoints.map((w) => w.lat);
  const lons = state.waypoints.map((w) => w.lon);
  const pad = 0.02;
  return {
    id: `composer-draft-${Date.now()}`,
    title: state.title.trim(),
    subtitle: "Memory in progress",
    bounds: {
      latMin: Math.min(...lats) - pad,
      latMax: Math.max(...lats) + pad,
      lonMin: Math.min(...lons) - pad,
      lonMax: Math.max(...lons) + pad,
    },
    origin: { ...state.origin, elev: state.origin.elev ?? 0 },
    destination: { ...state.destination, elev: state.destination.elev ?? 0 },
    mode: state.mode,
    routes: [{
      id: "composer-route",
      name: state.title.trim(),
      color: "#8a4528",
      difficulty: "Easy",
      stats: { distanceKm: 0, durationHr: 0 },
      waypoints: state.waypoints.map((w) => ({ lat: w.lat, lon: w.lon, elev: w.elev ?? 0 })),
    }],
    landmarks: state.landmarks.map((l) => ({
      id: l.id,
      name: l.name || "Landmark",
      lat: l.lat, lon: l.lon, elev: l.elev ?? 0,
      type: "milestone",
      blurb: l.blurb || "",
    })),
    topography: { basemap: "imagery", zoom: 11, pitch: 35, bearing: -15, terrainExaggeration: 1.2 },
    region: { country: "—", state: "—", district: "—", governingBody: "—", timeZone: "UTC", advisories: [] },
    culture: { accentColor: "#8a4528", motif: "memory", invocation: "", summary: "" },
    units: { distance: "km", elevation: "m", temperature: "C" },
  };
}
