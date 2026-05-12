# Yatra ✦ The Journey Atlas

[![Deploy to GitHub Pages](https://github.com/USERNAME/yatra/actions/workflows/deploy.yml/badge.svg)](https://github.com/USERNAME/yatra/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

> *Yatra* (यात्रा) — Sanskrit for pilgrimage, journey, or sacred passage.

An extensible location-journey visualizer with real terrain tiles, real-time weather, and milestone storytelling. Built as a sample for **Tirupati → Tirumala**, but the entire UI is driven by a single `LocationConfig` object — drop a new config file into `src/config/` and it works for any pilgrimage, trek, road trip, or route.

## Features

- **Real basemap tiles** — ESRI World Topo, Imagery (Maxar satellite), or Shaded Relief, switchable live
- **3D terrain** — AWS / Mapzen Terrarium DEM (same SRTM data Bhuvan derives from)
- **Animated journey simulation** — marker traverses the selected route at 1×/2×/4× speed
- **Real-time data** —
  - *Geographical*: live lat/lon/elevation as the marker moves
  - *Physical*: current weather at summit via Open-Meteo
  - *Political*: country/state/district, governing body, local advisories
- **"Postcards from the Path"** — animated parchment cards spring in with cultural context at each landmark crossing
- **Elevation profile** with current position tracker
- **Editorial topographic-atlas aesthetic** — Cormorant Garamond display, Manrope body, JetBrains Mono for data

## Quick start

Requires **Node.js 18+**.

```bash
npm install
npm run dev
```

Then open <http://localhost:5173>.

To build for production:

```bash
npm run build
npm run preview    # serves the production build at :4173
```

The build output lands in `dist/` — host it on any static server (Vercel, Netlify, GitHub Pages, S3, your own nginx).

---

## Project structure

*"Yatra" — Sanskrit for pilgrimage, journey, or sacred passage.*


```
yatra/
├── index.html              · Vite entry HTML
├── package.json            · dependencies
├── vite.config.js          · Vite + React plugin
├── public/                 · static assets
└── src/
    ├── main.jsx            · React entry point
    ├── App.jsx             · top-level location switcher + JourneyMap
    ├── styles.css          · single editorial stylesheet
    │
    ├── config/             ★ THE EXTENSION POINT ★
    │   ├── schema.js               · JSDoc type definitions
    │   ├── tirupati-tirumala.js    · sample location
    │   └── index.js                · registry — import your locations here
    │
    ├── components/
    │   ├── JourneyMap.jsx          · orchestrator (state, animation, postcards)
    │   ├── MapView.jsx             · MapLibre GL wrapper (3D terrain, markers, routes)
    │   ├── Header.jsx              · title + basemap & route tabs
    │   ├── Controls.jsx            · play / pause / speed / reset
    │   ├── ElevationProfile.jsx    · SVG cross-section
    │   ├── SidePanels.jsx          · weather / position / political / route stats
    │   └── Postcard.jsx            · the delight feature
    │
    ├── services/
    │   ├── basemapStyles.js        · MapLibre style factories
    │   └── weather.js              · Open-Meteo client
    │
    └── utils/
        └── route.js                · route interpolation & distance
```

---

## Adding a new location

Three steps, all in `src/config/`.

### 1. Create `src/config/<your-location>.js`

```js
/** @type {import("./schema").LocationConfig} */
const config = {
  id: "manali-rohtang",
  title: "Manali → Rohtang",
  subtitle: "Over the pass",

  bounds: { latMin: 32.20, latMax: 32.40, lonMin: 77.10, lonMax: 77.30 },
  origin:      { name: "Manali",  lat: 32.2432, lon: 77.1892, elev: 2050 },
  destination: { name: "Rohtang", lat: 32.3725, lon: 77.2475, elev: 3978 },

  routes: [{ id: "main", name: "NH-3 / Atal Tunnel road",
             color: "#3b82f6", difficulty: "Moderate",
             stats: { distanceKm: 51, durationHr: 2 },
             waypoints: [/* ... */] }],

  landmarks: [/* ... */],

  topography: { basemap: "imagery", zoom: 12, pitch: 55, terrainExaggeration: 1.5 },
  region:     { country: "India", state: "Himachal Pradesh", /* ... */ },
  culture:    { accentColor: "#06b6d4", invocation: "जय हो", summary: "..." },
  units:      { distance: "km", elevation: "m", temperature: "C" },
};

export default config;
```

The full schema is documented in `src/config/schema.js` (JSDoc — your editor will autocomplete it).

### 2. Register it in `src/config/index.js`

```js
import tirupatiTirumala  from "./tirupati-tirumala";
import manaliRohtang     from "./manali-rohtang";  // ← add

export const LOCATIONS = {
  [tirupatiTirumala.id]: tirupatiTirumala,
  [manaliRohtang.id]:    manaliRohtang,            // ← add
};
```

### 3. That's it

The location switcher (top of the page) automatically lists all registered locations. The map re-centers, the postcards adapt, the accent color drives the whole theme.

---

## The LocationConfig schema (the variables)

| Group | Field | Purpose |
|---|---|---|
| **identity** | `id`, `title`, `subtitle` | Display + registry key |
| **bounds** | `latMin`/`latMax`, `lonMin`/`lonMax` | Map extent + camera bounds |
| **endpoints** | `origin`, `destination` | Start & end places |
| **routes[]** | `id`, `name`, `color`, `difficulty`, `stats`, `waypoints` | One or more paths between endpoints |
| **landmarks[]** | `id`, `name`, `lat`/`lon`/`elev`, `type`, `blurb`, `ritual` | POIs that fire postcards |
| **topography** | `basemap`, `zoom`, `pitch`, `bearing`, `terrainExaggeration` | Initial map view |
| **region** | `country`, `state`, `district`, `governingBody`, `timeZone`, `advisories[]` | Political layer |
| **culture** | `accentColor`, `motif`, `invocation`, `summary` | Theming + storytelling |
| **units** | `distance`, `elevation`, `temperature` | Display preferences |

---

## Dependencies

| Package | Purpose | Why this one |
|---|---|---|
| `react`, `react-dom` | UI framework | Standard |
| `maplibre-gl` | Map renderer | Open-source, WebGL 3D terrain, no API key, free fork of Mapbox |
| `vite` | Build & dev server | Fast HMR, modern ESM, zero config |
| `@vitejs/plugin-react` | React + Fast Refresh | Standard |

**External data sources** (all free, CORS-enabled, no API key):

- **ESRI ArcGIS Online** — basemap raster tiles (World Topo Map, World Imagery, World Shaded Relief)
- **AWS / Mapzen Terrarium** — 3D elevation tiles (RGB-encoded SRTM 30 m)
- **Open-Meteo** — current weather conditions

> **Note on Bhuvan**: ISRO's Bhuvan portal (bhuvan-vec2.nrsc.gov.in) does not currently expose CORS headers, so browser-side fetches are blocked. ESRI World Topo Map is used as the rendering equivalent — it shows real contour lines, roads, and Indian place names. The numeric elevation data comes from the same SRTM DEM that Bhuvan itself derives from.

---

## Troubleshooting

- **Map looks blank for a few seconds** — tiles are streaming in from ESRI; usually 1–3 s on first load. After that they're cached.
- **3D terrain doesn't appear** — check the browser console for WebGL warnings. Some older GPUs / browsers fall back to 2D automatically.
- **Weather card stuck on "Fetching…"** — Open-Meteo may be rate-limiting or down. The rest of the app keeps working.
- **CORS error on tiles** — only if you've added a tile source that doesn't allow it. ESRI / OpenTopoMap / OpenStreetMap all do; Bhuvan / older corporate tile servers may not.

## License

MIT — do what you like.
