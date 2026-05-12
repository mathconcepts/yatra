import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapView from "../MapView";
import { interpolateRoute } from "../../utils/route";
import { planCamera, sampleCameraPlan } from "../../services/moodCamera";
import AutoCameraPill from "./AutoCameraPill";

const LOOP_SECONDS = 22;          // one full traversal
const REACT_UPDATE_MS = 200;      // React re-render cadence for marker + UI
const AUTO_RESUME_MS = 5000;      // 5 s no-touch → auto resumes
const HAPTIC_MS = 30;             // tap-tick haptic on resume

/**
 * Single vertical 9:16 reel.
 *
 * Camera is driven by a ref-held rAF loop that calls MapLibre directly
 * (Slice 3, reviewer correction #5). Slice 4 adds the manual-override
 * state machine wired to MapLibre's user-input events:
 *
 *   auto  ── user drags / pitches / rotates / wheels the map ──▶ manual
 *   manual ── 5 s of no input ──▶ auto (with 30 ms haptic on resume)
 *   either ── user taps the AutoCameraPill ──▶ flips immediately
 *
 * While in manual mode the rAF loop still runs (progress ref still
 * advances, marker still updates) but `map.jumpTo` is suppressed — the
 * user keeps whatever camera state they panned/pitched to. When auto
 * resumes, the loop picks up from the current state with no snap-back.
 */
export default function ReelPlayer({ config }) {
  const route = config.routes?.[0];
  const plan = useMemo(() => planCamera(config), [config]);

  // Refs — NOT React state. The rAF loop reads/writes these directly.
  const mapRef = useRef(null);
  const progressRef = useRef(0);
  const playingRef = useRef(true);
  const startedAtRef = useRef(null);
  const rafIdRef = useRef(null);
  const interactionModeRef = useRef("auto");
  const manualTimerRef = useRef(null);

  // React state on the cool path: tick (throttled UI), play (button label),
  // interactionMode (pill label), manualKey (restarts the pill's CSS countdown).
  const [, setTick] = useState(0);
  const lastTickRef = useRef(0);
  const [playing, setPlaying] = useState(true);
  const [interactionMode, setInteractionMode] = useState("auto");
  const [manualKey, setManualKey] = useState(0);

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { interactionModeRef.current = interactionMode; }, [interactionMode]);

  const enterManual = useCallback(() => {
    clearTimeout(manualTimerRef.current);
    setManualKey((k) => k + 1);
    setInteractionMode("manual");
    manualTimerRef.current = setTimeout(() => {
      setInteractionMode("auto");
      try {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(HAPTIC_MS);
        }
      } catch { /* unsupported — fine */ }
    }, AUTO_RESUME_MS);
  }, []);

  const togglePill = useCallback(() => {
    if (interactionModeRef.current === "manual") {
      clearTimeout(manualTimerRef.current);
      setInteractionMode("auto");
    } else {
      // Pinning to manual until next interaction or pill-tap.
      enterManual();
    }
  }, [enterManual]);

  // Camera + marker rAF loop. Mounts once; reads refs.
  useEffect(() => {
    if (!route) return;
    const wps = route.waypoints;
    let cancelled = false;

    const loop = (now) => {
      if (cancelled) return;
      if (!playingRef.current) {
        startedAtRef.current = null;
        rafIdRef.current = requestAnimationFrame(loop);
        return;
      }
      if (startedAtRef.current == null) {
        startedAtRef.current = now - progressRef.current * LOOP_SECONDS * 1000;
      }
      const elapsed = (now - startedAtRef.current) / 1000;
      const t = (elapsed / LOOP_SECONDS) % 1;
      progressRef.current = t;

      // Drive the camera ONLY in auto mode — leaves the user's pan/pitch
      // alone in manual.
      if (interactionModeRef.current === "auto") {
        const map = mapRef.current;
        if (map && plan.length > 0) {
          const pos = interpolateRoute(wps, t);
          const cam = sampleCameraPlan(plan, t);
          if (cam && pos) {
            map.jumpTo({
              center: [pos.lon, pos.lat],
              zoom: cam.zoom,
              pitch: cam.pitch,
              bearing: cam.bearing,
            });
          }
        }
      }

      if (now - lastTickRef.current > REACT_UPDATE_MS) {
        lastTickRef.current = now;
        setTick((n) => n + 1);
      }

      rafIdRef.current = requestAnimationFrame(loop);
    };

    rafIdRef.current = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafIdRef.current);
      startedAtRef.current = null;
    };
  }, [plan, route]);

  // Clean up the manual-mode timer on unmount.
  useEffect(() => () => clearTimeout(manualTimerRef.current), []);

  const handleMapReady = useCallback((map) => {
    mapRef.current = map;
    // dragstart / pitchstart / rotatestart only fire on user gestures,
    // not on programmatic map.jumpTo. Wheel zoom also opts in.
    const onUserInput = () => enterManual();
    map.on("dragstart", onUserInput);
    map.on("pitchstart", onUserInput);
    map.on("rotatestart", onUserInput);
    map.on("wheel", onUserInput);
  }, [enterManual]);

  const handleProgressScrub = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    if (clientX == null) return;
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    progressRef.current = x / rect.width;
    startedAtRef.current = null; // loop re-syncs on next frame
    enterManual();
    setTick((n) => n + 1);
  };

  const currentPos = route ? interpolateRoute(route.waypoints, progressRef.current) : null;

  const activeLandmark = useMemo(() => {
    if (!currentPos || !config.landmarks?.length) return null;
    let best = config.landmarks[0];
    let bestD = Infinity;
    for (const lm of config.landmarks) {
      const d = Math.hypot(lm.lat - currentPos.lat, lm.lon - currentPos.lon);
      if (d < bestD) { bestD = d; best = lm; }
    }
    return best;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPos?.lat, currentPos?.lon, config.landmarks]);

  return (
    <div className="reel">
      <div className="reel-map">
        <MapView
          config={config}
          basemap={config.topography?.basemap || "topo"}
          activeRouteId={route?.id}
          currentPos={currentPos}
          isJourneyActive={playing}
          onLandmarkClick={() => {}}
          onMapReady={handleMapReady}
        />
      </div>

      <div className="reel-overlay-top">
        <span className="reel-eyebrow">{config.subtitle || config.region?.state}</span>
        <h2 className="reel-title">{config.title}</h2>
      </div>

      <AutoCameraPill
        mode={interactionMode}
        manualKey={manualKey}
        onToggle={togglePill}
      />

      {activeLandmark && (
        <div className="reel-postcard" role="region" aria-label="Landmark postcard">
          <div className="reel-postcard-name">{activeLandmark.name}</div>
          <p className="reel-postcard-body">{activeLandmark.blurb}</p>
          {activeLandmark.ritual && (
            <div className="reel-postcard-ritual">{activeLandmark.ritual}</div>
          )}
        </div>
      )}

      <div className="reel-controls">
        <button
          type="button"
          className="reel-play"
          aria-label={playing ? "Pause reel" : "Play reel"}
          aria-pressed={playing}
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <div
          className="reel-progress"
          role="slider"
          aria-label="Scrub through journey"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressRef.current * 100)}
          onClick={handleProgressScrub}
          onTouchStart={handleProgressScrub}
        >
          <div
            className="reel-progress-fill"
            style={{ width: `${Math.round(progressRef.current * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
