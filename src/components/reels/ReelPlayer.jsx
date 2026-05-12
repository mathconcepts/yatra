import { useEffect, useMemo, useRef, useState } from "react";
import MapView from "../MapView";
import { interpolateRoute } from "../../utils/route";
import { planCamera, sampleCameraPlan } from "../../services/moodCamera";

const LOOP_SECONDS = 22;          // one full traversal
const REACT_UPDATE_MS = 200;      // React re-render cadence for marker + UI

/**
 * Single vertical 9:16 reel.
 *
 * Slice 3 split: the **camera** is driven by a ref-held rAF loop that
 * calls MapLibre directly (no React on the hot path). The **marker
 * position** + progress bar update at ~5 fps via throttled React state,
 * which is plenty for a single DOM-marker move and a thin progress fill.
 *
 * This is reviewer correction #5 from the v3.0 plan: keep React out of
 * the per-frame camera path so Pixel 6a stays above 24 fps even with
 * terrain + overlays composited at portrait aspect.
 */
export default function ReelPlayer({ config }) {
  const route = config.routes?.[0];
  const plan = useMemo(() => planCamera(config), [config]);

  // refs — NOT React state. The rAF loop reads/writes these directly.
  const mapRef = useRef(null);
  const progressRef = useRef(0);
  const playingRef = useRef(true);
  const startedAtRef = useRef(null);
  const rafIdRef = useRef(null);

  // The only React state on the hot path: a tick counter bumped at
  // REACT_UPDATE_MS cadence so marker / progress UI re-render.
  const [, setTick] = useState(0);
  const lastTickRef = useRef(0);

  // Play / pause is React state because the play button needs to reflect
  // it visually. The rAF loop reads the ref mirror to avoid stale closures.
  const [playing, setPlaying] = useState(true);
  useEffect(() => { playingRef.current = playing; }, [playing]);

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

      // Drive the camera DIRECTLY via MapLibre — no React render involved.
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

      // Throttled React tick — moves marker + progress bar.
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

  const currentPos = route ? interpolateRoute(route.waypoints, progressRef.current) : null;

  // Nearest landmark, recomputed only at the React tick cadence (so on the
  // hot rAF path this never runs).
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

  const togglePlay = () => setPlaying((p) => !p);

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
          onMapReady={(map) => { mapRef.current = map; }}
        />
      </div>

      <div className="reel-overlay-top">
        <span className="reel-eyebrow">{config.subtitle || config.region?.state}</span>
        <h2 className="reel-title">{config.title}</h2>
      </div>

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
          onClick={togglePlay}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <div className="reel-progress" aria-hidden="true">
          <div
            className="reel-progress-fill"
            style={{ width: `${Math.round(progressRef.current * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
