import { useEffect, useRef, useState, useMemo } from "react";
import maplibregl from "maplibre-gl";
import { makeMapStyle } from "../../services/basemapStyles";
import { interpolateRoute } from "../../utils/route";
import { compareStats, unionBounds } from "../../services/compareJourneys";
import { listMemories } from "../../services/memoryStore";

const LOOP_SECONDS = 22;
const COLORS = ["#ff9d3a", "#3aa6ff"]; // saffron, sky

/**
 * Compare two journeys (v3.4 Slice P + v1.5.2 split-screen).
 *
 * Two view modes:
 *   - overlay (default): one map, both routes + markers in saffron + sky
 *   - split: two stacked maps, one journey each, shared progress slider
 *
 * Routes within a curated config are expanded into separate dropdown
 * options so users can pick e.g. Tirupati Alipiri vs Tirupati Srivari.
 */
export default function CompareView({ locations, onCancel }) {
  const allChoices = useMemo(() => {
    const curated = [];
    Object.entries(locations || {}).forEach(([id, cfg]) => {
      const routes = cfg.routes || [];
      if (routes.length <= 1) {
        curated.push({ key: `curated:${id}`, label: cfg.title, config: cfg });
      } else {
        routes.forEach((r) => {
          curated.push({
            key: `curated:${id}:${r.id}`,
            label: `${cfg.title} · ${r.name}`,
            config: { ...cfg, routes: [r] },
          });
        });
      }
    });
    const saved = listMemories().map((m) => ({
      key: `memory:${m.savedId}`,
      label: `★ ${m.config.title}`,
      config: m.config,
    }));
    return [...curated, ...saved];
  }, [locations]);

  const [aKey, setAKey] = useState(allChoices[0]?.key || "");
  const [bKey, setBKey] = useState(allChoices[1]?.key || allChoices[0]?.key || "");
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [view, setView] = useState("overlay"); // "overlay" | "split"

  const a = allChoices.find((c) => c.key === aKey)?.config;
  const b = allChoices.find((c) => c.key === bKey)?.config;
  const stats = useMemo(() => (a && b ? compareStats(a, b) : null), [a, b]);

  // Progress loop.
  useEffect(() => {
    if (!playing) return;
    let raf;
    let last = performance.now();
    const tick = (t) => {
      const dt = (t - last) / 1000;
      last = t;
      setProgress((p) => {
        const next = p + dt / LOOP_SECONDS;
        return next >= 1 ? 0 : next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  if (allChoices.length < 2) {
    return (
      <div className="compare">
        <header className="compare-header">
          <h1 className="memories-title">Compare</h1>
          <button type="button" className="composer-cancel" onClick={onCancel}>×</button>
        </header>
        <p className="memories-empty">Need at least 2 journeys (curated + saved) to compare.</p>
      </div>
    );
  }

  return (
    <div className="compare">
      <header className="compare-header">
        <h1 className="memories-title">Compare journeys</h1>
        <div className="compare-view-toggle" role="group" aria-label="Compare view">
          <button
            type="button"
            className={view === "overlay" ? "active" : ""}
            onClick={() => setView("overlay")}
          >Overlay</button>
          <button
            type="button"
            className={view === "split" ? "active" : ""}
            onClick={() => setView("split")}
          >Split</button>
        </div>
        <button type="button" className="composer-cancel" onClick={onCancel}>×</button>
      </header>

      <div className="compare-pickers">
        <label>
          <span className="composer-label" style={{ color: COLORS[0] }}>Route A</span>
          <select value={aKey} onChange={(e) => setAKey(e.target.value)}>
            {allChoices.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        <label>
          <span className="composer-label" style={{ color: COLORS[1] }}>Route B</span>
          <select value={bKey} onChange={(e) => setBKey(e.target.value)}>
            {allChoices.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
      </div>

      <div className="compare-main">
        {view === "overlay" ? (
          <OverlayMap a={a} b={b} progress={progress} />
        ) : (
          <div className="compare-split">
            <SingleMap key={`a-${aKey}`} config={a} color={COLORS[0]} progress={progress} label="A" />
            <SingleMap key={`b-${bKey}`} config={b} color={COLORS[1]} progress={progress} label="B" />
          </div>
        )}
        {stats && (
          <aside className="compare-stats">
            <CompareRow label="Distance" a={`${stats.a.distanceKm} km`} b={`${stats.b.distanceKm} km`} delta={`${stats.deltas.distanceKm >= 0 ? "+" : ""}${stats.deltas.distanceKm} km`} />
            <CompareRow label="Elevation gain" a={`${stats.a.elevationGainM} m`} b={`${stats.b.elevationGainM} m`} delta={`${stats.deltas.elevationGainM >= 0 ? "+" : ""}${stats.deltas.elevationGainM} m`} />
            <CompareRow label="Waypoints" a={stats.a.waypoints} b={stats.b.waypoints} delta={`${stats.deltas.waypoints >= 0 ? "+" : ""}${stats.deltas.waypoints}`} />
            <CompareRow label="Landmarks" a={stats.a.landmarks} b={stats.b.landmarks} delta={`${stats.deltas.landmarks >= 0 ? "+" : ""}${stats.deltas.landmarks}`} />
            <CompareRow label="Mode" a={stats.a.mode} b={stats.b.mode} delta="" />
          </aside>
        )}
      </div>

      <div className="compare-controls">
        <button type="button" className="composer-preview" onClick={() => setPlaying((p) => !p)}>
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          onChange={(e) => setProgress(Number(e.target.value) / 1000)}
          className="compare-scrub"
          aria-label="Scrub journey progress"
        />
        <span className="compare-progress">{Math.round(progress * 100)}%</span>
      </div>
    </div>
  );
}

function CompareRow({ label, a, b, delta }) {
  return (
    <div className="compare-row">
      <span className="compare-label">{label}</span>
      <span className="compare-a">{a}</span>
      <span className="compare-b">{b}</span>
      <span className="compare-delta">{delta}</span>
    </div>
  );
}

/* ─── overlay map: both routes on one canvas ────────────────────────── */
function OverlayMap({ a, b, progress }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([null, null]);

  useEffect(() => {
    if (!a || !b || mapRef.current) return;
    const u = unionBounds([a, b]);
    if (!u) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: makeMapStyle("topo"),
      bounds: [[u.lonMin, u.latMin], [u.lonMax, u.latMax]],
      fitBoundsOptions: { padding: 60 },
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.on("style.load", () => {
      [a, b].forEach((cfg, i) => {
        const id = `cmp-route-${i}`;
        const route = cfg.routes?.[0];
        if (!route) return;
        map.addSource(id, {
          type: "geojson",
          data: { type: "Feature", geometry: { type: "LineString", coordinates: route.waypoints.map((w) => [w.lon, w.lat]) } },
        });
        map.addLayer({
          id: `cmp-line-${i}`,
          type: "line",
          source: id,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": COLORS[i], "line-width": 4, "line-opacity": 0.9 },
        });
      });
      [a, b].forEach((cfg, i) => {
        const el = document.createElement("div");
        el.className = `cmp-marker cmp-marker-${i}`;
        el.style.setProperty("--cmp-color", COLORS[i]);
        const wp = cfg.routes?.[0]?.waypoints?.[0];
        if (!wp) return;
        markersRef.current[i] = new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([wp.lon, wp.lat])
          .addTo(map);
      });
    });
    return () => {
      try { map.remove(); } catch { /* */ }
      mapRef.current = null;
      markersRef.current = [null, null];
    };
  }, [a, b]);

  useEffect(() => {
    if (!a || !b) return;
    [a, b].forEach((cfg, i) => {
      const m = markersRef.current[i];
      if (!m) return;
      const pos = interpolateRoute(cfg.routes?.[0]?.waypoints || [], progress);
      if (pos) m.setLngLat([pos.lon, pos.lat]);
    });
  }, [progress, a, b]);

  return <div className="compare-map" ref={containerRef} />;
}

/* ─── single map: one journey, for split view ───────────────────────── */
function SingleMap({ config, color, progress, label }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!config || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: makeMapStyle(config.topography?.basemap || "topo"),
      bounds: [[config.bounds.lonMin, config.bounds.latMin], [config.bounds.lonMax, config.bounds.latMax]],
      fitBoundsOptions: { padding: 40 },
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.on("style.load", () => {
      const route = config.routes?.[0];
      if (!route) return;
      map.addSource("sm-route", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: route.waypoints.map((w) => [w.lon, w.lat]) } },
      });
      map.addLayer({
        id: "sm-line",
        type: "line",
        source: "sm-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": color, "line-width": 4, "line-opacity": 0.95 },
      });
      const el = document.createElement("div");
      el.className = "cmp-marker";
      el.style.setProperty("--cmp-color", color);
      const wp = route.waypoints[0];
      markerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([wp.lon, wp.lat])
        .addTo(map);
    });
    return () => {
      try { map.remove(); } catch { /* */ }
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [config, color]);

  useEffect(() => {
    if (!config) return;
    const m = markerRef.current;
    if (!m) return;
    const pos = interpolateRoute(config.routes?.[0]?.waypoints || [], progress);
    if (pos) m.setLngLat([pos.lon, pos.lat]);
  }, [progress, config]);

  return (
    <div className="compare-split-panel" style={{ "--panel-color": color }}>
      <span className="compare-split-label">{label} · {config?.title}</span>
      <div className="compare-map compare-map-split" ref={containerRef} />
    </div>
  );
}
