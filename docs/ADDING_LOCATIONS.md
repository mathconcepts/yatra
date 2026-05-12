# Adding a new location

This guide walks through extending Journey Atlas to a brand-new route in detail.

## The mental model

Everything visible in the UI is driven by a single JavaScript object — the `LocationConfig`. There is **no per-location component code**. To add a journey:

1. Find lat/lon/elevation for your origin, destination, waypoints, and landmarks
2. Write them into a config file
3. Register the config in `src/config/index.js`

The rendering, animation, postcards, weather, region info, and elevation profile all adapt automatically.

## Step-by-step: a hypothetical "Camino de Santiago — Sarria stage"

### 1. Gather coordinates

Use Google Maps (right-click → "What's here?"), OpenStreetMap, or a GPX file from a hiking site. You need:

- Origin & destination lat/lon and approximate elevation
- Waypoints — 5 to 12 points along each route is plenty (the line interpolates between them)
- Landmarks — places where you want a postcard to fire

### 2. Create `src/config/camino-sarria.js`

```js
const config = {
  id: "camino-sarria",
  title: "Sarria → Portomarín",
  subtitle: "The final 100 km of the Camino Francés",

  bounds: { latMin: 42.770, latMax: 42.890, lonMin: -7.660, lonMax: -7.420 },

  origin:      { name: "Sarria",      lat: 42.7800, lon: -7.4136, elev: 442 },
  destination: { name: "Portomarín",  lat: 42.8083, lon: -7.6147, elev: 350 },

  routes: [{
    id: "camino-frances",
    name: "Camino Francés",
    color: "#facc15",
    difficulty: "Moderate",
    stats: { distanceKm: 22.4, durationHr: 5 },
    waypoints: [
      { lat: 42.7800, lon: -7.4136, elev: 442 },
      { lat: 42.7855, lon: -7.4423, elev: 510 },
      { lat: 42.7920, lon: -7.4810, elev: 580 },
      { lat: 42.8030, lon: -7.5200, elev: 620 },
      { lat: 42.8083, lon: -7.6147, elev: 350 },
    ],
  }],

  landmarks: [
    { id: "barbadelo", name: "Iglesia de Santiago de Barbadelo",
      lat: 42.7878, lon: -7.4570, elev: 540,
      type: "shrine",
      blurb: "12th-century Romanesque church with a richly carved tympanum. Pilgrims pause here for the stamp on the credencial.",
      ritual: "Credencial stamp" },
    { id: "portomarin", name: "Portomarín — Igrexa de San Xoán",
      lat: 42.8083, lon: -7.6147, elev: 350,
      type: "destination",
      blurb: "The fortress-church relocated stone by stone when the valley was flooded. Marks 100 km to Santiago.",
      ritual: "Compostela stamp · 100 km marker" },
  ],

  topography: { basemap: "topo", zoom: 12, pitch: 40, terrainExaggeration: 1.3 },

  region: {
    country: "Spain", state: "Galicia", district: "Lugo",
    governingBody: "Xunta de Galicia · Camino de Santiago board",
    timeZone: "Europe/Madrid",
    advisories: [
      "Pilgrim's credencial recommended for stamps and albergue access",
      "Yellow arrows mark the route — no GPS needed",
      "Drinking fountains every 4-6 km",
    ],
  },

  culture: {
    accentColor: "#facc15",
    motif: "scallop shell",
    invocation: "Buen Camino",
    summary: "The final 100-km stretch of the Camino Francés, the minimum walking distance to qualify for a Compostela certificate in Santiago.",
  },

  units: { distance: "km", elevation: "m", temperature: "C" },
};

export default config;
```

### 3. Register it

```js
// src/config/index.js
import tirupatiTirumala from "./tirupati-tirumala";
import caminoSarria     from "./camino-sarria";

export const LOCATIONS = {
  [tirupatiTirumala.id]: tirupatiTirumala,
  [caminoSarria.id]:     caminoSarria,
};
```

### 4. Restart dev server (or save to trigger HMR)

The location switcher (top of page) now shows both. Pick "Sarria → Portomarín" and you'll see:

- The Galician landscape with real ESRI topo tiles
- Yellow route line (your `accentColor`)
- Romanesque church marker with a "Credencial stamp" ritual
- Live Galicia weather
- A postcard with the Iglesia de Santiago de Barbadelo story

No JSX edited, no rebuild. The schema is the API.
