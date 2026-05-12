# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm install` — install dependencies (Node.js ≥18)
- `npm run dev` — Vite dev server at http://localhost:5173 (auto-opens)
- `npm run build` — production build to `dist/`
- `npm run preview` — serve the production build at :4173

For GitHub Pages deploys, set `VITE_BASE=/yatra/` (handled in `vite.config.js`). Leave unset for local / Vercel / Netlify.

There is no test runner, linter, or TypeScript configured. The code is plain JSX with hooks.

## Architecture

Yatra is a single-page React + MapLibre GL app that visualizes a journey between two points with 3D terrain, animated marker traversal, weather, and landmark "postcards." The whole UI is **driven by a `LocationConfig` object** — adding a new journey means dropping a config file in `src/config/` and registering it; no component changes needed.

### The extension point: `src/config/`

- `schema.js` — JSDoc `LocationConfig` type (identity, bounds, origin/destination, `routes[]`, `landmarks[]`, topography, region, culture, units). Read this before adding or changing config shape.
- `index.js` — registry mapping `id → config`. The location switcher in `App.jsx` enumerates this object.
- One file per location (e.g. `tirupati-tirumala.js`).

When changing the schema, update `schema.js`, every config file, and any consumers in `components/` / `services/` together — there is no type checker to catch drift.

### Runtime flow

1. `main.jsx` mounts `App.jsx`.
2. `App.jsx` holds the active `locationId` and renders `JourneyMap` with the resolved config.
3. `JourneyMap.jsx` is the orchestrator: owns animation state (play/pause/speed, current position along the route), selected route, basemap choice, and decides when a landmark crossing fires a `Postcard`.
4. `MapView.jsx` wraps MapLibre GL — applies basemap styles from `services/basemapStyles.js`, enables Mapzen Terrarium DEM for 3D terrain, draws routes/markers, and animates the moving marker.
5. Side components (`Header`, `Controls`, `ElevationProfile`, `SidePanels`, `Postcard`) are presentational; they read derived state from `JourneyMap` and the config's `culture.accentColor` themes them.

### Data sources (all browser-side, no API key)

- ESRI ArcGIS — basemap raster tiles (Topo / Imagery / Shaded Relief)
- AWS Mapzen Terrarium — RGB-encoded SRTM DEM for 3D terrain
- Open-Meteo — current weather (`services/weather.js`)

Bhuvan tiles are intentionally not used: no CORS headers. Don't add tile sources without verifying CORS.

### Utilities

- `utils/route.js` — waypoint interpolation and along-route distance; used by the animation loop and `ElevationProfile`.

## Conventions

- Plain JSX (no TypeScript), functional components + hooks, one concern per file.
- A single stylesheet `src/styles.css` drives the editorial topographic-atlas look (Cormorant Garamond / Manrope / JetBrains Mono). Per-location accent color comes from `culture.accentColor` via CSS variables — don't hardcode colors in components.
