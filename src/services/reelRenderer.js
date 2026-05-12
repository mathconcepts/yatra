/**
 * Offscreen reel renderer — drives a hidden MapLibre map to produce real
 * frames for MP4 export. Slice H replaces the placeholder gradient frames
 * with this so the exported video matches the live ReelPlayer surface.
 *
 * Design notes:
 *   - The map is mounted into a hidden 720×1280 div (off-screen, not
 *     display:none — display:none would skip WebGL rendering).
 *   - We use `preserveDrawingBuffer: true` so `canvas.transferToImageBitmap`
 *     (or createImageBitmap on the canvas) yields a fresh frame instead of
 *     the cleared default.
 *   - Frame capture is gated on `map.once('idle')` so we let terrain tiles
 *     and route lines actually render before snapshotting.
 *   - No React. The composer's encoder pipeline owns the lifecycle.
 *
 * Public API:
 *   const r = await createOffscreenReelRenderer(config);
 *   for (let i = 0; i < total; i++) {
 *     const bm = await r.captureFrame(i / total);
 *     frames.push(bm);
 *   }
 *   r.destroy();
 *
 * The renderer also exports a pure helper `cameraForT` so unit tests can
 * verify camera-plan interpolation without spinning up MapLibre.
 */

import maplibregl from "maplibre-gl";
import { makeMapStyle } from "./basemapStyles";
import { planCamera, sampleCameraPlan } from "./moodCamera";
import { interpolateRoute } from "../utils/route";

const RENDER_WIDTH = 720;
const RENDER_HEIGHT = 1280;

/**
 * Pure: compute the camera + map position for a given progress `t`.
 * Returns null when the config is missing routes/plan data.
 */
export function cameraForT(config, t) {
  const route = config?.routes?.[0];
  if (!route || !Array.isArray(route.waypoints) || route.waypoints.length < 2) return null;
  const plan = planCamera(config);
  if (!plan || plan.length === 0) return null;
  const pos = interpolateRoute(route.waypoints, t);
  const cam = sampleCameraPlan(plan, t);
  if (!pos || !cam) return null;
  return {
    center: [pos.lon, pos.lat],
    zoom: cam.zoom,
    pitch: cam.pitch,
    bearing: cam.bearing,
  };
}

/**
 * Spin up the offscreen renderer. Resolves once the style has loaded so
 * the very first captureFrame() call is fast.
 */
export async function createOffscreenReelRenderer(config, {
  width = RENDER_WIDTH,
  height = RENDER_HEIGHT,
  basemap,
  idleTimeoutMs = 1500,
} = {}) {
  if (typeof document === "undefined") {
    throw new Error("Offscreen renderer requires a DOM");
  }

  const container = document.createElement("div");
  container.style.cssText = `position:fixed;left:-9999px;top:0;width:${width}px;height:${height}px;pointer-events:none;`;
  container.setAttribute("aria-hidden", "true");
  document.body.appendChild(container);

  const styleName = basemap || config?.topography?.basemap || "imagery";
  const map = new maplibregl.Map({
    container,
    style: makeMapStyle(styleName),
    center: [
      (config.bounds.lonMin + config.bounds.lonMax) / 2,
      (config.bounds.latMin + config.bounds.latMax) / 2,
    ],
    zoom: config.topography?.zoom ?? 12.5,
    pitch: config.topography?.pitch ?? 45,
    bearing: config.topography?.bearing ?? -15,
    attributionControl: false,
    interactive: false,
    preserveDrawingBuffer: true,
  });

  await new Promise((resolve) => map.once("style.load", resolve));

  // Terrain (clamped 1.3 like Reels) + sky
  try {
    map.setTerrain({
      source: "terrain",
      exaggeration: Math.min(config.topography?.terrainExaggeration ?? 1.3, 1.3),
    });
  } catch { /* skip if source missing */ }

  // Route line.
  for (const route of (config.routes || [])) {
    const sid = `route-src-${route.id}`;
    if (!map.getSource(sid)) {
      map.addSource(sid, {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "LineString", coordinates: route.waypoints.map((w) => [w.lon, w.lat]) },
        },
      });
      map.addLayer({
        id: `route-line-${route.id}`,
        type: "line",
        source: sid,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": route.color || "#8a4528",
          "line-width": 4,
          "line-opacity": 0.95,
        },
      });
    }
  }

  // Wait for first idle so initial tiles paint before captureFrame.
  await _waitIdle(map, idleTimeoutMs);

  const captureFrame = async (t) => {
    const cam = cameraForT(config, t);
    if (cam) map.jumpTo(cam);
    await _waitIdle(map, idleTimeoutMs);
    const canvas = map.getCanvas();
    return await createImageBitmap(canvas);
  };

  const destroy = () => {
    try { map.remove(); } catch { /* */ }
    try { container.remove(); } catch { /* */ }
  };

  return { map, captureFrame, destroy };
}

function _waitIdle(map, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const t = setTimeout(finish, timeoutMs);
    map.once("idle", () => { clearTimeout(t); finish(); });
  });
}
