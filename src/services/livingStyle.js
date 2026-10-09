/**
 * Region-level basemap for the Living Atlas: Sentinel-2 cloudless from EOX
 * (CC-BY 4.0, key-free). The Journey band keeps its own imagery in MapView;
 * the full imagery ladder is slice 2.
 */
export const EOX_ATTRIBUTION =
  'Sentinel-2 cloudless &copy; <a href="https://s2maps.eu" target="_blank" rel="noreferrer">EOX IT Services GmbH</a> (CC-BY 4.0), contains modified Copernicus Sentinel data';

export function makeLivingStyle() {
  return {
    version: 8,
    sources: {
      eox: {
        type: "raster",
        tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg"],
        tileSize: 256,
        maxzoom: 13,
        attribution: EOX_ATTRIBUTION,
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#07111a" } },
      { id: "eox", type: "raster", source: "eox", paint: { "raster-brightness-max": 0.85 } },
    ],
  };
}
