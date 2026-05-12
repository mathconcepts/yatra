import { useEffect, useMemo, useState } from "react";

import Header           from "./Header";
import MapView          from "./MapView";
import Controls         from "./Controls";
import ElevationProfile from "./ElevationProfile";
import Postcard         from "./Postcard";
import SidePanels       from "./SidePanels";

import { fetchWeather }      from "../services/weather";
import { interpolateRoute, distanceKm } from "../utils/route";

const ANIM_SECONDS_PER_FULL_RUN = 17;  // base; divided by speed
const LANDMARK_TRIGGER_KM = 0.4;       // within 400 m → postcard

export default function JourneyMap({ config }) {
  const [basemap,  setBasemap]   = useState(config.topography.basemap);
  const [routeId,  setRouteId]   = useState(config.routes[0].id);
  const [progress, setProgress]  = useState(0);
  const [playing,  setPlaying]   = useState(false);
  const [speed,    setSpeed]     = useState(1);
  const [weather,  setWeather]   = useState(null);
  const [postcard, setPostcard]  = useState(null);
  const [seen,     setSeen]      = useState(new Set());

  const route = config.routes.find((r) => r.id === routeId);
  const acc   = config.culture.accentColor;

  /* fetch weather once per location */
  useEffect(() => {
    let cancelled = false;
    fetchWeather(config.destination.lat, config.destination.lon).then((w) => {
      if (!cancelled) setWeather(w);
    });
    return () => { cancelled = true; };
  }, [config.destination.lat, config.destination.lon]);

  /* animation loop */
  useEffect(() => {
    if (!playing) return;
    let raf, last = performance.now();
    const tick = (t) => {
      const dt = (t - last) / 1000;
      last = t;
      setProgress((p) => {
        const next = p + dt * (1 / ANIM_SECONDS_PER_FULL_RUN) * speed;
        if (next >= 1) { setPlaying(false); return 1; }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  const here = useMemo(
    () => interpolateRoute(route.waypoints, progress),
    [route, progress]
  );

  /* postcard trigger when within range of an unseen landmark */
  useEffect(() => {
    if (!playing) return;
    const near = config.landmarks.find((lm) => {
      if (seen.has(lm.id)) return false;
      return distanceKm(lm, here) < LANDMARK_TRIGGER_KM;
    });
    if (near) {
      setSeen((prev) => new Set(prev).add(near.id));
      setPostcard(near);
    }
  }, [here, playing, config.landmarks, seen]);

  /* reset state on route or location change */
  useEffect(() => {
    setProgress(0);
    setPlaying(false);
    setSeen(new Set());
    setPostcard(null);
  }, [routeId, config.id]);

  /* allow clicking a landmark marker to open its postcard */
  function handleLandmarkClick(lm) {
    setPostcard(lm);
  }

  function handlePlayToggle() {
    if (progress >= 1) { setProgress(0); setSeen(new Set()); }
    setPlaying((p) => !p);
  }
  function handleReset() {
    setProgress(0);
    setPlaying(false);
    setSeen(new Set());
    setPostcard(null);
  }

  return (
    <div className="jm-app">
      <Header
        config={config}
        basemap={basemap} onBasemapChange={setBasemap}
        activeRouteId={routeId} onRouteChange={setRouteId}
      />

      <div className="jm-grid">
        <div>
          <div className="jm-map-wrap">
            <MapView
              config={config}
              basemap={basemap}
              activeRouteId={routeId}
              currentPos={here}
              isJourneyActive={playing || progress > 0}
              onLandmarkClick={handleLandmarkClick}
            />
            <Controls
              playing={playing}
              progress={progress}
              speed={speed}
              accentColor={acc}
              onPlayToggle={handlePlayToggle}
              onSpeedChange={setSpeed}
              onReset={handleReset}
            />
          </div>

          <ElevationProfile
            route={route}
            progress={progress}
            origin={config.origin}
            destination={config.destination}
            accentColor={acc}
          />
        </div>

        <SidePanels
          config={config}
          weather={weather}
          here={here}
          progress={progress}
          route={route}
        />
      </div>

      <Postcard
        data={postcard}
        accentColor={acc}
        onClose={() => setPostcard(null)}
      />
    </div>
  );
}
