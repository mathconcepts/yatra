import { useEffect, useRef, useState, useMemo } from "react";
import maplibregl from "maplibre-gl";
import { makeMapStyle } from "../../services/basemapStyles";
import { interpolateRoute } from "../../utils/route";
import { compareStats, unionBounds, summarizeJourney } from "../../services/compareJourneys";
import { listMemories } from "../../services/memoryStore";

const LOOP_SECONDS = 22;
const COLORS = ["#ff9d3a", "#3aa6ff"]; // saffron, sky — the two journeys

/**
 * Compare two journeys on one map (v3.4 Slice P).
 *
 * The user picks two journeys from a combined list of curated locations
 * + saved memories. Both routes render as colored lines, both markers
 * play in parallel against a shared progress. Side panel shows live
 * deltas. Atlas-style rendering — no Reels overlays.
 */
export default function CompareView({ locations, onCancel }) {
  const allChoices = useMemo(() => {
    const curated = Object.entries(locations || {}).map(([id, cfg]) => ({
      key: `curated:${id}`,
      label: cfg.title,
      config: cfg,
    }));
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

  const a = allChoices.find((c) => c.key === aKey)?.config;
  const b = allChoices.find((c) => c.key === bKey)?.config;
  const stats = useMemo(() => (a && b ? compareStats(a, b) : null), [a, b]);

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([null, null]);

  // Init map once, fit union bounds, add both routes.
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
          data: {
            type: "Feature",
            geometry: { type: "LineString", coordinates: route.waypoints.map((w) => [w.lon, w.lat]) },
          },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aKey, bKey]);

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

  // Move both markers to their progress positions.
  useEffect(() => {
    if (!a || !b) return;
    [a, b].forEach((cfg, i) => {
      const m = markersRef.current[i];
      if (!m) return;
      const pos = interpolateRoute(cfg.routes?.[0]?.waypoints || [], progress);
      if (pos) m.setLngLat([pos.lon, pos.lat]);
    });
  }, [progress, a, b]);

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
        <div className="compare-map" ref={containerRef} />
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
