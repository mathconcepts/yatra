/**
 * MapLibre style factories.
 *
 * All sources are CORS-enabled and key-free. Bhuvan WMS (ISRO India) does
 * not currently expose CORS headers from the browser; the v3.0 fallback
 * chain proxies Bhuvan via a Cloudflare Worker (see workers/bhuvan-proxy)
 * that adds CORS headers and rejects HTML-200 error responses. Until the
 * Worker is deployed, Bhuvan stays inert — ESRI is still the primary.
 */

/**
 * URL for the Bhuvan proxy Worker. Override at build time via
 * `VITE_BHUVAN_PROXY_URL=...` to point at your deployed Worker. When
 * unset, Bhuvan source factory returns `null` so the chain skips it.
 */
const BHUVAN_PROXY_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_BHUVAN_PROXY_URL) || "";

// AWS terrain tiles — RGB-encoded SRTM, free, CORS-enabled.
// Same DEM data Bhuvan uses upstream. Required for 3D terrain.
const TERRAIN_SOURCE = {
  type: "raster-dem",
  tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
  tileSize: 256,
  encoding: "terrarium",
  maxzoom: 15,
  attribution: "Terrain &copy; Mapzen / Amazon AWS",
};

const BASEMAP_SOURCES = {
  topo: {
    type: "raster",
    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"],
    tileSize: 256,
    maxzoom: 19,
    attribution: "Tiles &copy; Esri — Topographic",
  },
  imagery: {
    type: "raster",
    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
    tileSize: 256,
    maxzoom: 19,
    attribution: "Tiles &copy; Esri — Imagery (Maxar / DigitalGlobe)",
  },
  relief: {
    type: "raster",
    tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}"],
    tileSize: 256,
    maxzoom: 13,
    attribution: "Tiles &copy; Esri — Shaded Relief",
  },
};

export function makeMapStyle(basemap) {
  return {
    version: 8,
    sources: {
      basemap: BASEMAP_SOURCES[basemap] || BASEMAP_SOURCES.topo,
      terrain: TERRAIN_SOURCE,
    },
    layers: [
      { id: "basemap", type: "raster", source: "basemap" },
    ],
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  };
}

export const BASEMAP_LABELS = {
  topo: "ESRI Topo · contours + roads",
  imagery: "ESRI Imagery · Maxar satellite",
  relief: "ESRI Shaded Relief · hillshade",
};

/**
 * Build the tile URL set for a named source in the chain. Returns
 * `null` when the source cannot be configured (e.g. Bhuvan with no
 * proxy URL set). Used by `tileSourceChain` consumers to populate
 * `source.setTiles([...])` on a swap.
 */
export function tilesForSource(name) {
  switch (name) {
    case "esri":
      return [BASEMAP_SOURCES.topo.tiles[0]];
    case "osm":
      return [
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      ];
    case "bhuvan-proxy":
      if (!BHUVAN_PROXY_URL) return null;
      // The proxy mints a signed token via transformRequest, but the
      // baseline URL still needs to point at a valid endpoint. The
      // Worker accepts an unsigned dev path for smoke testing.
      return [`${BHUVAN_PROXY_URL.replace(/\/$/, "")}/tile/{z}/{x}/{y}.png`];
    default:
      return null;
  }
}
