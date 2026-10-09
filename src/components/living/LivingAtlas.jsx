import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { WEEKDAYS } from "../../services/schedule";
import {
  SPEEDS, localClock, engineClock, advance, shiftToWeekday, weekdayOf, clockLabel,
  parseLivingParams, livingState, atlasLink,
} from "../../services/livingClock";
import {
  summarize, summaryLine, journeyRows, movingNow, buildGeoJSON, sourcesLine,
} from "../../services/livingAtlas";
import { makeLivingStyle } from "../../services/livingStyle";

const ACCENT = "#ff9d3a";
const EMPTY = { type: "FeatureCollection", features: [] };

function addLayers(map) {
  map.addSource("la-lines", { type: "geojson", data: EMPTY });
  map.addSource("la-anchors", { type: "geojson", data: EMPTY });
  map.addSource("la-movers", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "la-line-full", type: "line", source: "la-lines", filter: ["==", ["get", "role"], "full"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ["get", "color"],
      "line-opacity": ["case", ["get", "dim"], 0.3, 0.85],
      "line-width": ["case", ["get", "sel"], 4, 2.5],
    },
  });
  map.addLayer({
    id: "la-line-served", type: "line", source: "la-lines", filter: ["==", ["get", "role"], "served"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "color"], "line-opacity": 0.95, "line-width": ["case", ["get", "sel"], 4, 3] },
  });
  map.addLayer({
    id: "la-anchors", type: "circle", source: "la-anchors",
    paint: {
      "circle-radius": ["case", ["get", "sel"], 8, 6], "circle-color": "#0d1a26",
      "circle-stroke-color": "#ede4d3", "circle-stroke-width": 2,
    },
  });
  map.addLayer({
    id: "la-mover-halo", type: "circle", source: "la-movers",
    paint: { "circle-radius": 16, "circle-color": ACCENT, "circle-opacity": 0.25 },
  });
  map.addLayer({
    id: "la-movers", type: "circle", source: "la-movers",
    paint: {
      "circle-radius": ["case", ["get", "sel"], 8, 6.5], "circle-color": ACCENT,
      "circle-stroke-color": "#f5ebd6", "circle-stroke-width": 2,
    },
  });
}

/**
 * Living Atlas, slice 1: every registered journey on one satellite map, the
 * clock as the primary control. Place-agnostic: the title counts, map bounds
 * and time zone all come from the `locations` registry.
 */
export default function LivingAtlas({ locations, onCancel, onOpenJourney }) {
  const summary = useMemo(() => summarize(locations), [locations]);
  const tz = summary.tz;

  const [view, setView] = useState(() => {
    const search = typeof window === "undefined" ? "" : window.location.search;
    return { ...parseLivingParams(search, localClock(new Date(), tz)), playing: false };
  });
  const [filter, setFilter] = useState("moving");
  const [selected, setSelected] = useState(() => Object.keys(locations)[0] ?? null);
  const [mapError, setMapError] = useState(null);

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const dataRef = useRef(null);
  const openRef = useRef(null);

  const { clock, live, speed, playing } = view;
  const rows = useMemo(() => journeyRows(locations, engineClock(clock)), [locations, clock]);
  const moving = movingNow(rows);
  const label = clockLabel(clock);
  const sel = rows.find((r) => r.id === selected) ?? rows[0];

  const stateForUrl = { clock, live, speed, mode: "day" };
  const open = (id) => {
    const href = atlasLink(id, stateForUrl);
    if (onOpenJourney) onOpenJourney(id, href);
    else window.location.assign(href);
  };
  openRef.current = open;

  /* tick: follow the wall clock when live, else advance when playing */
  useEffect(() => {
    const timer = setInterval(() => {
      setView((v) => {
        if (v.live) return { ...v, clock: localClock(new Date(), tz) };
        if (!v.playing) return v;
        return { ...v, clock: advance(v.clock, SPEEDS[v.speed] / 10) };
      });
    }, 100);
    return () => clearInterval(timer);
  }, [tz]);

  /* clock state lives in the URL (debounced), never in a store */
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const q = livingState({ clock, live, speed, mode: "day" });
        q.set("surface", "living-atlas");
        window.history.replaceState({}, "", `?${q.toString()}`);
      } catch { /* about:blank in tests */ }
    }, 400);
    return () => clearTimeout(timer);
  }, [clock, live, speed]);

  /* map: created once */
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    let map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: makeLivingStyle(),
        center: [0, 20], zoom: 2,
        attributionControl: { compact: true },
      });
    } catch (err) {
      setMapError(err?.message || "This device cannot draw the map.");
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      addLayers(map);
      const b = summary.bounds;
      if (b) map.fitBounds([[b.lonMin, b.latMin], [b.lonMax, b.latMax]], { padding: 60, duration: 0 });
      readyRef.current = true;
      if (dataRef.current) pushData(map, dataRef.current);
    });
    const click = (e) => {
      const id = e.features?.[0]?.properties?.journeyId;
      if (id) openRef.current(id);
    };
    for (const layer of ["la-movers", "la-anchors"]) {
      map.on("click", layer, click);
      map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
    }
    return () => { map.remove(); mapRef.current = null; readyRef.current = false; };
  }, [summary]);

  /* push fresh GeoJSON whenever the clock or selection moves */
  useEffect(() => {
    dataRef.current = buildGeoJSON(rows, sel?.id);
    if (readyRef.current && mapRef.current) pushData(mapRef.current, dataRef.current);
  }, [rows, sel?.id]);

  const shown = rows.filter((r) => filter === "all" || r.isMoving);
  const src = sel ? sourcesLine(sel) : null;
  const patch = (p) => setView((v) => ({ ...v, ...p }));
  const day = weekdayOf(clock.date);

  return (
    <div className="la-root" role="main" aria-label="Living Atlas">
      <div className="la-side">
        <section className="la-panel">
          <div className="la-kicker">Yatra · Living Atlas</div>
          <h1 className="la-title">Where The Journeys Are</h1>
          <div className="la-muted">{summaryLine(summary)}. Every position is read off a schedule.</div>
          {onCancel && (
            <div className="la-row">
              <button type="button" className="la-chip" onClick={onCancel}>← Back to the atlas</button>
            </div>
          )}
        </section>

        <section className="la-panel" aria-label="Clock">
          <div className="la-clock" aria-live="off">{label.hm}<small>:{label.s}</small></div>
          <div className="la-muted">
            <span className="la-accent">{moving} moving now</span> · {label.day} · {tz} · scheduled, not tracked
          </div>
          <div className="la-kicker">Move the clock</div>
          <div className="la-row">
            {WEEKDAYS.map((d, i) => (
              <button key={d} type="button" className="la-chip" aria-pressed={day === i}
                      onClick={() => patch({ clock: shiftToWeekday(clock, i), live: false })}>{d}</button>
            ))}
          </div>
          <input className="la-scrub" type="range" min="0" max="1439" step="1" aria-label="Move the clock"
                 value={Math.floor(clock.minutes)}
                 onChange={(e) => patch({ clock: { ...clock, minutes: Number(e.target.value) }, live: false, playing: false })} />
          <div className="la-row">
            <button type="button" className="la-chip" aria-pressed={playing && !live}
                    onClick={() => patch({ playing: !(playing && !live), live: false })}>
              {playing && !live ? "❚❚ Pause" : "▶ Play the day"}
            </button>
            {Object.keys(SPEEDS).map((s) => (
              <button key={s} type="button" className="la-chip" aria-pressed={speed === s}
                      onClick={() => patch({ speed: s })}>{s}</button>
            ))}
            <button type="button" className="la-chip" aria-pressed={live}
                    onClick={() => patch({ live: true, playing: false, clock: localClock(new Date(), tz) })}>● Live</button>
          </div>
        </section>

        <section className="la-panel" aria-label="Moving now">
          <div className="la-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div className="la-kicker">Moving now · {moving}</div>
            <div className="la-row">
              <button type="button" className="la-chip" aria-pressed={filter === "moving"} onClick={() => setFilter("moving")}>Moving</button>
              <button type="button" className="la-chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All {rows.length}</button>
            </div>
          </div>
          <div className="la-list">
            {shown.map((r) => (
              <button key={r.id} type="button" className="la-item" aria-pressed={sel?.id === r.id} onClick={() => setSelected(r.id)}>
                <span className="la-item-top"><span>{r.title}</span><span className="la-item-pct">{r.pct}%</span></span>
                <span className="la-item-sub">{r.sub}</span>
                <span className="la-bar"><span style={{ width: `${r.pct}%` }} /></span>
              </button>
            ))}
            {shown.length === 0 && (
              <div className="la-muted">Nothing is moving at this hour. Scrub the clock to find a departure.</div>
            )}
          </div>
        </section>
      </div>

      <div className="la-mapcol">
        <div className="la-map" ref={containerRef} role="img" aria-label="Satellite map of every registered journey">
          {mapError && <div className="la-muted" style={{ padding: 16 }}>Map unavailable: {mapError}</div>}
        </div>
        {sel && src && (
          <section className="la-panel" aria-label="Sources and method">
            <div className="la-kicker">Sources &amp; method · {sel.title}</div>
            <div className="la-muted">
              Route: {src.geometry}. {src.source ? (
                <>Schedule: {src.source.url
                  ? <a className="la-link" href={src.source.url} target="_blank" rel="noreferrer">{src.source.name}</a>
                  : src.source.name}.</>
              ) : null} {src.caveat}
            </div>
            <div className="la-muted">
              Imagery: Sentinel-2 cloudless © EOX IT Services GmbH (CC-BY 4.0), contains modified Copernicus Sentinel data.
            </div>
            <div className="la-row">
              <a className="la-chip" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}
                 href={atlasLink(sel.id, stateForUrl)}>Open {sel.title} in the Atlas →</a>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function pushData(map, data) {
  map.getSource("la-lines")?.setData(data.lines);
  map.getSource("la-anchors")?.setData(data.anchors);
  map.getSource("la-movers")?.setData(data.movers);
}
