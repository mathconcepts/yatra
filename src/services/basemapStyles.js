/**
 * MapLibre style factories.
 *
 * All sources are CORS-enabled and key-free. Bhuvan WMS (ISRO India) does
 * not currently expose CORS headers from the browser; we use ESRI World
 * Topo Map as the rendering equivalent since it shows real contour lines,
 * roads, and place names for India at high zoom levels.
 */

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
