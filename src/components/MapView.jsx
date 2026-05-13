import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { makeMapStyle, tilesForSource } from "../services/basemapStyles";
import {
  createChain,
  recordFailure as chainRecordFailure,
  tryFlush as chainTryFlush,
} from "../services/tileSourceChain";
import { clampTerrain, startProbe } from "../services/perfProbe";

/**
 * MapLibre GL JS wrapper. Handles:
 *   · raster basemap tiles
 *   · 3D terrain (Mapzen Terrarium DEM)
 *   · route lines (one per route, active highlighted)
 *   · landmark markers (custom HTML)
 *   · live "current position" marker (smoothly moved on prop change)
 *
 * The component does NOT recreate the map on prop changes — only updates.
 */
export default function MapView({
  config,
  basemap,
  activeRouteId,
  currentPos,
  isJourneyActive,
  onLandmarkClick,
  onMapReady,
  enableTileChain = false,
  enablePerfProbe = false,
  mobileTerrainCap,        // optional number, e.g. 1.3 — clamps terrainExaggeration
  freeCamera = false,      // skip maxBounds — Reels surface needs unconstrained pitch
  compareRoutes = false,   // show all routes equally weighted (Atlas v3.4 P7)
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const landmarkMarkersRef = useRef({});
  const currentMarkerRef = useRef(null);
  const isStyleLoadedRef = useRef(false);

  /* ─── initialise map ONCE ─────────────────────────────────────────── */
  useEffect(() => {
    if (mapRef.current) return;

    const center = [
      (config.bounds.lonMin + config.bounds.lonMax) / 2,
      (config.bounds.latMin + config.bounds.latMax) / 2,
    ];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: makeMapStyle(basemap),
      center,
      zoom: config.topography.zoom ?? 12.5,
      pitch: config.topography.pitch ?? 50,
      bearing: config.topography.bearing ?? -25,
      ...(freeCamera ? {} : {
        maxBounds: [
          [config.bounds.lonMin - 0.08, config.bounds.latMin - 0.08],
          [config.bounds.lonMax + 0.08, config.bounds.latMax + 0.08],
        ],
      }),
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    mapRef.current = map;

    map.on("style.load", () => {
      // 3D terrain — vertical Reels surface clamps exaggeration via
      // mobileTerrainCap (reviewer correction #5: Pixel 6a perf budget).
      const baseExag = config.topography.terrainExaggeration ?? 1.8;
      const exag = typeof mobileTerrainCap === "number"
        ? clampTerrain(baseExag, mobileTerrainCap)
        : baseExag;
      try {
        map.setTerrain({
          source: "terrain",
          exaggeration: exag,
        });
      } catch (e) { console.warn("Terrain setup failed:", e); }

      // soft sky for 3D pitch
      try {
        map.setSky({
          "sky-color": "#1a2a3d",
          "horizon-color": "#5a6878",
          "fog-color": "#1a2a3d",
          "sky-horizon-blend": 0.5,
          "horizon-fog-blend": 0.5,
          "fog-ground-blend": 0.5,
        });
      } catch (_) { /* older maplibre versions */ }

      addOverlays();
      isStyleLoadedRef.current = true;
      if (enableTileChain) installTileChain(map);
      if (enablePerfProbe) installPerfProbe(map);
      // External camera drivers (e.g. ReelPlayer's mood-cadence loop) get
      // the map handle here. Called once per init.
      if (typeof onMapReady === "function") onMapReady(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      isStyleLoadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── tile source chain: ESRI → OSM → Bhuvan (proxy) ───────────────
     Opt-in via `enableTileChain` so the Atlas surface stays unchanged.
     The chain watches for raster tile errors and, after threshold
     crossings, swaps the basemap source's tile URLs in-place via
     `setTiles()` so we don't have to rebuild the style. */
  function installTileChain(map) {
    let chain = createChain();
    const onError = (e) => {
      // Only count raster tile errors. MapLibre fires many `error`
      // events; we care about the ones with a tile + source = 'basemap'.
      if (!e || !e.tile || e.sourceId !== "basemap") return;
      chain = chainRecordFailure(chain, performance.now());
      // If we crossed threshold and the map is currently idle, swap
      // immediately. Otherwise leave it pending until moveend.
      if (chain.pendingSwap && !map.isMoving()) trySwap();
    };
    const trySwap = () => {
      const { state, swapped } = chainTryFlush(chain);
      chain = state;
      if (!swapped) return;
      const next = chain.sources[chain.activeIndex];
      const tiles = tilesForSource(next);
      const src = map.getSource("basemap");
      if (tiles && src && typeof src.setTiles === "function") {
        src.setTiles(tiles);
      }
    };
    map.on("error", onError);
    map.on("moveend", trySwap);
  }

  /* ─── runtime FPS probe ────────────────────────────────────────────
     Reviewer correction #5: sample frame-time over the first 5 s of
     reel playback. If median > 41 ms (≈ 24 fps), disable terrain for
     the rest of the session — better to drop to 2D than ship jank on
     a Pixel 6a. Opt-in via `enablePerfProbe`. */
  function installPerfProbe(map) {
    const probe = startProbe();
    const stopAt = window.setTimeout(() => {
      const verdict = probe.stop();
      if (verdict.shouldDisableTerrain) {
        try { map.setTerrain(null); } catch { /* maplibre version skew */ }
        // eslint-disable-next-line no-console
        console.info(
          `[perfProbe] median ${verdict.medianMs.toFixed(1)}ms over ${verdict.sampleCount} frames — terrain disabled for session`,
        );
      }
    }, 5000);
    map.once("remove", () => window.clearTimeout(stopAt));
  }

  /* ─── helpers: add / update overlay sources & layers ──────────────── */
  function addOverlays() {
    const map = mapRef.current;
    if (!map) return;

    // Routes
    config.routes.forEach((route) => {
      const sid = `route-src-${route.id}`;
      if (map.getSource(sid)) return;
      map.addSource(sid, {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: route.waypoints.map((w) => [w.lon, w.lat]),
          },
        },
      });
      const isActive = route.id === activeRouteId;
      // glow
      map.addLayer({
        id: `route-glow-${route.id}`,
        type: "line",
        source: sid,
        paint: {
          "line-color": route.color,
          "line-width": isActive ? 14 : 8,
          "line-opacity": isActive ? 0.25 : 0.1,
          "line-blur": 4,
        },
      });
      // main
      map.addLayer({
        id: `route-line-${route.id}`,
        type: "line",
        source: sid,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": route.color,
          "line-width": isActive ? 4.5 : 2.5,
          "line-opacity": isActive ? 1 : 0.55,
          "line-dasharray": isActive ? [1, 0] : [2, 1.5],
        },
      });
    });

    // Landmark markers
    config.landmarks.forEach((lm) => {
      if (landmarkMarkersRef.current[lm.id]) return;
      const el = document.createElement("div");
      el.className = `jm-marker jm-marker-${lm.type}`;
      el.innerHTML = `
        <div class="jm-marker-dot"></div>
        <div class="jm-marker-label">${escapeHtml(lm.name)}</div>
      `;
      el.style.setProperty("--accent", config.culture.accentColor);
      el.addEventListener("click", () => onLandmarkClick?.(lm));

      const marker = new maplibregl.Marker({ element: el, anchor: "left" })
        .setLngLat([lm.lon, lm.lat])
        .addTo(map);
      landmarkMarkersRef.current[lm.id] = marker;
    });

    // Endpoint city labels
    [config.origin, config.destination].forEach((p, i) => {
      const id = `endpoint-${i}`;
      if (landmarkMarkersRef.current[id]) return;
      const el = document.createElement("div");
      el.className = "jm-endpoint-label";
      el.textContent = p.name.toUpperCase();
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([p.lon, p.lat])
        .addTo(map);
      landmarkMarkersRef.current[id] = marker;
    });
  }

  /* ─── react to basemap change ─────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    isStyleLoadedRef.current = false;
    map.setStyle(makeMapStyle(basemap));
    // Style change wipes our overlays; the style.load handler re-adds them.
  }, [basemap]);

  /* ─── react to active route change (recolor / re-weight) ──────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isStyleLoadedRef.current) return;
    config.routes.forEach((route) => {
      // compareRoutes = all routes equally weighted (P7).
      const isActive = compareRoutes || route.id === activeRouteId;
      const mainId = `route-line-${route.id}`;
      const glowId = `route-glow-${route.id}`;
      if (map.getLayer(mainId)) {
        map.setPaintProperty(mainId, "line-width", isActive ? 4.5 : 2.5);
        map.setPaintProperty(mainId, "line-opacity", isActive ? 1 : 0.55);
        map.setPaintProperty(mainId, "line-dasharray", compareRoutes ? [1, 0] : (isActive ? [1, 0] : [2, 1.5]));
      }
      if (map.getLayer(glowId)) {
        map.setPaintProperty(glowId, "line-width", isActive ? 14 : 8);
        map.setPaintProperty(glowId, "line-opacity", isActive ? 0.25 : 0.1);
      }
    });
  }, [activeRouteId, config.routes, compareRoutes]);

  /* ─── react to current position change (move marker) ──────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!isJourneyActive) {
      if (currentMarkerRef.current) {
        currentMarkerRef.current.remove();
        currentMarkerRef.current = null;
      }
      return;
    }
    if (!currentPos) return;

    if (!currentMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "jm-current-marker";
      el.style.setProperty("--accent", config.culture.accentColor);
      el.innerHTML = `<div class="jm-pulse"></div><div class="jm-dot"></div>`;
      currentMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([currentPos.lon, currentPos.lat])
        .addTo(map);
    } else {
      currentMarkerRef.current.setLngLat([currentPos.lon, currentPos.lat]);
    }
  }, [currentPos, isJourneyActive, config.culture.accentColor]);

  return <div ref={containerRef} className="jm-map-canvas" />;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
