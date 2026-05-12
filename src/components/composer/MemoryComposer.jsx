import { useReducer, useCallback, useEffect, useState } from "react";
import {
  composerReducer,
  initialComposerState,
  COMPOSER_ACTIONS,
  isReadyToPreview,
  toLocationConfig,
} from "./composer-state";
import { interpolateLineWaypoints } from "./route-builder";
import PlacePicker from "./PlacePicker";
import GpxImporter from "./GpxImporter";
import PhotoDrop from "./PhotoDrop";
import NarrationRecorder from "./NarrationRecorder";
import ExportPanel from "./ExportPanel";
import AiScaffoldInput from "./AiScaffoldInput";
import { saveMemory } from "../../services/memoryStore";
import { encodeMemoryUrl } from "../../services/shareLink";

/**
 * Memory Composer — Slice A scaffold (v3.1).
 *
 * Form-driven builder for "make your own memory reel". Slice A wires the
 * surface, the state reducer, title + mode inputs, and a Preview button
 * gated on isReadyToPreview. Future slices fill in:
 *   B — A→B picker (Nominatim geocoder)
 *   C — GPX import
 *   D — Photo drop (EXIF GPS → landmarks)
 *   E — Narration (MediaRecorder)
 *   F — WebCodecs MP4 export
 *   G — AI free-text scaffold (Nominatim-verified)
 *
 * The composer never renders a map itself — when ready, it projects state
 * to a LocationConfig-shaped object and ReelPlayer takes over.
 */
export default function MemoryComposer({ onPreview, onCancel }) {
  const [state, dispatch] = useReducer(composerReducer, initialComposerState);

  const setTitle = useCallback((v) => dispatch({ type: COMPOSER_ACTIONS.SET_TITLE, payload: v }), []);
  const setMode = useCallback((v) => dispatch({ type: COMPOSER_ACTIONS.SET_MODE, payload: v }), []);
  const setOrigin = useCallback((v) => dispatch({ type: COMPOSER_ACTIONS.SET_ORIGIN, payload: v }), []);
  const setDestination = useCallback((v) => dispatch({ type: COMPOSER_ACTIONS.SET_DESTINATION, payload: v }), []);

  // Tracks whether the user imported a GPX file. Once they have, we stop
  // auto-overwriting waypoints from the A→B endpoints.
  const [gpxImported, setGpxImported] = useState(false);

  // When both endpoints are set (and no GPX is loaded), auto-interpolate a
  // 10-point great-circle-ish path so the composer is immediately previewable.
  useEffect(() => {
    if (gpxImported) return;
    if (!state.origin || !state.destination) return;
    const wps = interpolateLineWaypoints(state.origin, state.destination, 10);
    dispatch({ type: COMPOSER_ACTIONS.SET_WAYPOINTS, payload: wps });
  }, [state.origin, state.destination, gpxImported]);

  const handleScaffold = useCallback(({ waypoints }) => {
    if (!waypoints || waypoints.length < 2) return;
    const wps = waypoints.map((w) => ({ lat: w.lat, lon: w.lon, elev: 0 }));
    dispatch({ type: COMPOSER_ACTIONS.SET_WAYPOINTS, payload: wps });
    setGpxImported(true); // suppress the A→B auto-interpolator
    if (!state.origin) {
      const first = waypoints[0];
      dispatch({ type: COMPOSER_ACTIONS.SET_ORIGIN, payload: { name: first.name, lat: first.lat, lon: first.lon } });
    }
    if (!state.destination) {
      const last = waypoints[waypoints.length - 1];
      dispatch({ type: COMPOSER_ACTIONS.SET_DESTINATION, payload: { name: last.name, lat: last.lat, lon: last.lon } });
    }
    waypoints.slice(1, -1).forEach((w) => {
      dispatch({ type: COMPOSER_ACTIONS.ADD_LANDMARK, payload: { name: w.name, lat: w.lat, lon: w.lon, blurb: w.name } });
    });
  }, [state.origin, state.destination]);

  const handleGpxImport = useCallback((pts, name) => {
    dispatch({ type: COMPOSER_ACTIONS.SET_WAYPOINTS, payload: pts });
    setGpxImported(true);
    // Promote endpoints from the GPX if user hasn't picked any.
    if (!state.origin && pts.length > 0) {
      dispatch({ type: COMPOSER_ACTIONS.SET_ORIGIN, payload: { name: `${name || "Track"} start`, lat: pts[0].lat, lon: pts[0].lon } });
    }
    if (!state.destination && pts.length > 1) {
      const last = pts[pts.length - 1];
      dispatch({ type: COMPOSER_ACTIONS.SET_DESTINATION, payload: { name: `${name || "Track"} end`, lat: last.lat, lon: last.lon } });
    }
    if (name && !state.title) {
      dispatch({ type: COMPOSER_ACTIONS.SET_TITLE, payload: name });
    }
  }, [state.origin, state.destination, state.title]);

  const handlePreview = () => {
    const cfg = toLocationConfig(state);
    if (cfg && typeof onPreview === "function") onPreview(cfg);
  };

  const [savedNotice, setSavedNotice] = useState(null);
  const handleSave = () => {
    const cfg = toLocationConfig(state);
    if (!cfg) return;
    const entry = saveMemory(cfg);
    setSavedNotice(entry ? "Saved to My memories." : "Couldn't save (storage full?).");
    setTimeout(() => setSavedNotice(null), 2500);
  };

  const [shareNotice, setShareNotice] = useState(null);
  const handleShare = async () => {
    const cfg = toLocationConfig(state);
    if (!cfg) return;
    const enc = encodeMemoryUrl(cfg);
    if (!enc) { setShareNotice("Could not encode."); return; }
    const url = `${window.location.origin}${window.location.pathname}?surface=reels&memory=${enc}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareNotice("Share URL copied to clipboard.");
    } catch {
      window.prompt("Copy this share URL:", url);
      setShareNotice("URL ready above.");
    }
    setTimeout(() => setShareNotice(null), 2500);
  };

  const ready = isReadyToPreview(state);

  return (
    <div className="composer">
      <header className="composer-header">
        <h1 className="composer-title">Compose a memory</h1>
        <button type="button" className="composer-cancel" onClick={onCancel} aria-label="Cancel and return">×</button>
      </header>

      <form className="composer-form" onSubmit={(e) => e.preventDefault()}>
        <label className="composer-field">
          <span className="composer-label">Title</span>
          <input
            type="text"
            value={state.title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A week in Manali"
            maxLength={80}
          />
        </label>

        <fieldset className="composer-field composer-mode">
          <legend className="composer-label">Mode</legend>
          {["road", "rail", "trail", "mixed"].map((m) => (
            <label key={m} className="composer-radio">
              <input
                type="radio"
                name="mode"
                value={m}
                checked={state.mode === m}
                onChange={() => setMode(m)}
              />
              <span>{m}</span>
            </label>
          ))}
        </fieldset>

        <div className="composer-route-pickers" data-testid="composer-route-picker">
          <PlacePicker
            label="Start"
            value={state.origin}
            onPick={setOrigin}
            placeholder="e.g. Manali"
          />
          <PlacePicker
            label="End"
            value={state.destination}
            onPick={setDestination}
            placeholder="e.g. Rohtang Pass"
          />
        </div>

        <GpxImporter onImport={handleGpxImport} />

        <PhotoDrop
          onLandmark={(lm) => dispatch({ type: COMPOSER_ACTIONS.ADD_LANDMARK, payload: lm })}
        />

        <NarrationRecorder
          onRecorded={(u) => dispatch({ type: COMPOSER_ACTIONS.SET_NARRATION, payload: u })}
        />

        <AiScaffoldInput onScaffold={handleScaffold} />

        <ExportPanel
          config={ready ? toLocationConfig(state) : null}
          narrationUrl={state.narrationUrl}
        />

        <div className="composer-summary" aria-live="polite">
          {ready
            ? <span className="composer-ready">Ready to preview.</span>
            : <span className="composer-not-ready">Add title, origin, and destination to enable preview.</span>}
        </div>

        <div className="composer-actions">
          <button
            type="button"
            className="composer-preview"
            onClick={handlePreview}
            disabled={!ready}
          >
            Preview reel
          </button>
          <button
            type="button"
            className="composer-preview"
            onClick={handleSave}
            disabled={!ready}
          >
            Save memory
          </button>
          <button
            type="button"
            className="composer-preview"
            onClick={handleShare}
            disabled={!ready}
          >
            Share link
          </button>
        </div>
        {savedNotice && <p className="composer-hint composer-saved">{savedNotice}</p>}
        {shareNotice && <p className="composer-hint composer-saved">{shareNotice}</p>}
      </form>
    </div>
  );
}
