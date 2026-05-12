import { useEffect, useRef, useState } from "react";
import MapView from "../MapView";
import { interpolateRoute } from "../../utils/route";

const TICK_MS = 33; // ~30 fps animation tick

/**
 * A single vertical reel. Renders MapView at portrait aspect inside a
 * 9:16 viewport, plays an auto-loop of the journey marker traversing
 * the active route, and surfaces a Cormorant caption card at the
 * bottom. Slice 3 will replace the linear playhead with a mood-cadence
 * camera plan; for Slice 2 the camera holds the journey's default
 * framing and only the marker moves.
 */
export default function ReelPlayer({ config }) {
  const route = config.routes?.[0];
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const rafRef = useRef(null);
  const startedAtRef = useRef(null);
  const speedSecondsRef = useRef(20); // 20 s per loop

  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    const tick = (now) => {
      if (cancelled) return;
      if (startedAtRef.current == null) startedAtRef.current = now - progress * speedSecondsRef.current * 1000;
      const elapsed = (now - startedAtRef.current) / 1000;
      const next = (elapsed / speedSecondsRef.current) % 1;
      setProgress(next);
      rafRef.current = window.setTimeout(() => requestAnimationFrame(tick), TICK_MS);
    };
    rafRef.current = window.setTimeout(() => requestAnimationFrame(tick), TICK_MS);
    return () => {
      cancelled = true;
      clearTimeout(rafRef.current);
      startedAtRef.current = null;
    };
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentPos = route ? interpolateRoute(route.waypoints, progress) : null;

  // Pick the nearest landmark to the current position to drive the caption card.
  const activeLandmark = (() => {
    if (!currentPos || !config.landmarks?.length) return null;
    let best = config.landmarks[0];
    let bestD = Infinity;
    for (const lm of config.landmarks) {
      const d = Math.hypot(lm.lat - currentPos.lat, lm.lon - currentPos.lon);
      if (d < bestD) { bestD = d; best = lm; }
    }
    return best;
  })();

  const togglePlay = () => {
    setPlaying((p) => {
      if (p) startedAtRef.current = null;
      return !p;
    });
  };

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
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
