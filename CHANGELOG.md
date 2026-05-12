# Changelog

All notable changes to this project will be documented in this file.

## [1.0.8] - 2026-05-12

### Added
- **Srirangam → Trichy** (`src/config/srirangam-trichy.js`) — Sri Vaishnava river-island pilgrimage. 9.5 km foot+road from Ranganathaswamy temple to the Rock Fort, low elevation (78–95 m), 5 landmarks including Amma Mandapam ghat, Cauvery bridge, Teppakulam tank.
- **Yadagiri Hill** (`src/config/yadagirigutta.js`) — Telangana hill pilgrimage to Sri Lakshmi Narasimha Swamy. 3.2 km mixed road + foot, 485 → 720 m elevation gain, 5 landmarks including the Pancha Narasimha cave, Rajagopuram (carved from black Krishna-shila granite), and the 2022-reconsecrated sanctum.
- **Konkan Railway** (`src/config/konkan-railway.js`) — Mumbai CST → Mangaluru Junction, 738 km, `mode: "rail"` + `cameraStrategy: "rail"` to engage the rail mood-cadence preset built in Slice 3. 18 station/feature waypoints, 8 landmarks including the Karbude tunnel (6.5 km), Panval Nadi viaduct, Sharavati bridge, Roha (where the Konkan division begins).
- Tests: 27 new — required-field shape per config (×4), waypoints stay inside declared bounds, region/culture metadata present, rail-specific config validates mode + strategy + rail-feature landmark presence, elevation profile sanity per topography type.

### Changed
- `src/config/index.js` registers all four locations. The location switcher in the Atlas surface now lists Tirupati, Srirangam, Yadagiri Hill, and Konkan Railway. The Reels surface paginates through all four with the existing ↓/↑ swipe and keyboard navigation.

## [1.0.7] - 2026-05-12

### Added
- `src/services/tileSourceChain.js` — pure state machine that decides when to swap the active basemap raster source after sustained tile failures. Configurable threshold (default 3) + sliding window (default 4 s). `recordFailure`, `tryFlush`, `reset`, `activeSource` exported.
- `src/services/basemapStyles.js` — `tilesForSource(name)` factory returning tile URL patterns for `esri`, `osm`, `bhuvan-proxy`. Bhuvan only activates when `VITE_BHUVAN_PROXY_URL` is set at build time.
- `workers/bhuvan-proxy/` — Cloudflare Worker scaffold:
  - `src/index.ts` — proxies Bhuvan WMS, mints HMAC-signed 60 s tokens, validates upstream `content-type` is `image/*` to catch HTML-200 errors, caches failures 60 s, full CORS.
  - `wrangler.toml`, `package.json`, `README.md` — deploy instructions + smoke test.
- `MapView` learns an opt-in `enableTileChain` prop. When true, installs the chain on map init, subscribes to `error` events scoped to `basemap`, atomic-swaps via `source.setTiles([...])` at `moveend` to avoid mid-pan flicker.
- `ReelPlayer` passes `enableTileChain` so vertical reels benefit from the fallback. Atlas does not pass it — its behaviour is unchanged.
- Tests: 17 new — chain state machine (10) + basemap-styles source factory (7).

### Notes
- Reviewer corrections #3 and #4 from the v3.0 plan landed in this slice:
  - **#3** — debounced source swap at `moveend` (not mid-gesture), threshold-based via the sliding-window chain
  - **#4** — Worker uses `transformRequest`-friendly HMAC token, not Turnstile-per-tile (which breaks MapLibre's `<source tiles:[...]>` flow). HTML-200 errors are detected by `content-type` validation and cached 60 s to avoid hammering Bhuvan during outages.
- The Worker is not deployed from this PR. Deploy via `wrangler deploy` from `workers/bhuvan-proxy/`, set `VITE_BHUVAN_PROXY_URL` at build time, and the chain picks up the third fallback automatically.

## [1.0.6] - 2026-05-12

### Added
- `AutoCameraPill` component — visible top-right pill that surfaces the mood-cadence override state. Two visible states (auto / manual) plus a 5-second countdown bar that drains via pure CSS in manual mode. Tap any time to flip state immediately. Touch target ≥ 44 pt, aria-label + aria-pressed wired.
- **Manual override state machine** in `ReelPlayer`:
  - User drag / pitch / rotate / wheel on the map → enters manual; rAF loop suppresses `map.jumpTo` so the user's camera position is preserved.
  - 5 s of no input → returns to auto with a 30 ms haptic tap (where supported).
  - Tap the pill: flip immediately (force-resume from manual, or take manual control from auto).
- **Progress-bar scrub** — clicking or touching the progress bar jumps progress to that point and enters manual mode (so the camera doesn't snap away from the user's scrub). The progress bar is now an ARIA `slider`.
- Tests: 7 new — pill label / aria-pressed / aria-label per mode, click fires callback, scoped class names, countdown bar present only in manual mode.

### Changed
- `ReelPlayer` rAF loop now gates `map.jumpTo` on `interactionModeRef.current === "auto"`. Manual mode leaves the user's pan/pitch alone; auto resumes from current state without snap-back.
- MapLibre user-input events (`dragstart`, `pitchstart`, `rotatestart`, `wheel`) are attached in `onMapReady` and drive the manual-mode transition. Programmatic `jumpTo` calls do not trigger these events, so the auto path stays clean.

## [1.0.5] - 2026-05-12

### Added
- `src/services/moodCamera.js` — pure mood-cadence camera engine. Two strategies:
  - **`terrainHeuristic`** — elevation-driven. Steep sections → higher pitch + tighter zoom; flat → lower pitch + wider zoom. Outputs 8 evenly-spaced `CameraStep`s with `t`, `zoom`, `pitch`, `bearing`.
  - **`railHeuristic`** — event-density-driven. Counts rail-feature landmarks (`bridge`, `tunnel`, `station`, `river-crossing`, `viaduct`) within 10 km of the current position; density drives pitch (22–50) and zoom; lower baseline pitch so the route reads as scenic parallel motion. High-density moments hold 0.8 s.
  - **`planCamera(config)`** strategy router: explicit `cameraStrategy` > `mode === "rail"` > terrain default. A baked `config.cameraPlan` is used verbatim if present.
  - **`sampleCameraPlan(plan, t)`** — linear interpolation between adjacent steps, clamps at the ends.
- `MapView` now accepts an optional `onMapReady(map)` callback so external camera drivers can take the MapLibre handle.
- Tests: 28 new — `clamp`, `profileStats`, `localSlope`, terrain heuristic across flat/steep/rolling/degenerate profiles, rail heuristic with dense / empty / non-rail landmarks, `planCamera` routing, `sampleCameraPlan` interpolation + bounds.

### Changed
- `ReelPlayer` now drives the camera via a **ref-held rAF loop** that calls `map.jumpTo()` directly — no React state on the per-frame path. Marker position + progress bar still update via React but throttled to ~5 fps (200 ms). This is reviewer correction #5 from the v3.0 autoplan: keep React out of the hot path so Pixel 6a stays above 24 fps on terrain + overlay composition.
- Tirupati reel now exhibits real mood-cadence playback: pitch tightens on the steep climb toward the temple, bearing sweeps gently for visual variety, camera tracks the marker along the route.

## [1.0.4] - 2026-05-12

### Added
- `ReelPlayer` component — single vertical 9:16 reel with MapLibre 3D terrain, auto-playing marker traversal of the active route, Cormorant Garamond title overlay, and a postcard caption that follows the nearest landmark.
- `ReelFeed` component — swipe-paginated container for the Reels surface. Touch swipe (≥60 px), keyboard `ArrowUp`/`ArrowDown`/`PageUp`/`PageDown`, on-screen up/down arrows, position indicator, and an "Atlas" back button. `Escape` returns to the Atlas surface.
- `clampIndex()` pure helper exported from `ReelFeed` for direct unit testing.
- Tests: 10 new — `clampIndex` coverage, `ReelFeed` keyboard navigation, edge bounds, Atlas-back wiring, empty-state rendering.

### Changed
- `SurfaceRouter` now lazy-loads `ReelFeed` instead of the Slice 1 placeholder. The Reels chunk is verified separate from the desktop bundle (`ReelFeed-*.js`, 3.65 kB / 1.46 kB gzipped).
- The Reels surface is no longer a stub: on portrait viewports the user lands directly in a vertical reel of the current journey, with the marker animating along the route every 20 seconds.

### Removed
- `ReelsPlaceholder.jsx` — replaced by `ReelFeed`. The Slice 1 stub is no longer needed.

## [1.0.3] - 2026-05-12

### Added
- `SurfaceRouter` component routes between the existing landscape Atlas and the new vertical Reels surface based on viewport aspect ratio (`portrait || min-dim < 768` → Reels). User choice persists in URL (`?surface=reels|atlas`) and `localStorage`. Resize listener is debounced 250ms.
- `pickSurface(w, h, urlOverride, stored)` exported as a pure function for direct testing.
- `ReelsPlaceholder` component as the v3.0 Slice 1 stub for the Reels surface. Slice 2 replaces it with the real `ReelFeed` + `ReelPlayer`.
- "Reels mode" floating button on the Atlas surface to opt in manually.
- `LocationConfig.mode` (foot / road / rail / mixed) and `LocationConfig.cameraPlan` as optional schema fields for future v3.0 surfaces. Existing configs are unaffected.
- Tests: 14 new (pure-function decision matrix for `pickSurface`, atlas-render integration, P9 regression on the Tirupati config).

### Changed
- `App.jsx` now wraps the existing Atlas view in `SurfaceRouter`. Desktop users see the same Tirupati journey they always have.
- The Reels bundle is code-split out of the desktop entry chunk via dynamic `import()` — `ReelsPlaceholder-*.js` ships as its own asset and only loads when the Reels surface is requested.

## [1.0.2] - 2026-05-12

### Added
- Test framework: Vitest + jsdom + `@testing-library/react` + `@testing-library/jest-dom` matchers.
- `npm test` (single run) and `npm run test:watch` (watch mode) scripts.
- `test/` directory with global setup (`test/setup.js`) and a smoke test that proves the runner + jsdom + matchers all work end-to-end.
- `.github/workflows/test.yml` — CI runs the test suite on every push and pull request.
- `TESTING.md` — testing philosophy, conventions, and coverage expectations.
- `## Testing` section in `CLAUDE.md` so AI assistants follow project test conventions.

### Changed
- `vite.config.js` — added a Vitest config block (jsdom environment, globals, setup file, `test/**` include pattern). Dev/build behaviour unchanged.

## [1.0.1] - 2026-05-12

### Added
- `CLAUDE.md` — project guidance for AI coding tools, listing available gstack skills and skill-routing rules.
- `.claude/hooks/check-gstack.sh` + `.claude/settings.json` — team-mode enforcement hook that blocks skill usage when gstack is not installed globally. Each developer is prompted to install gstack the first time they run an AI session in this repo.

### Changed
- Project now requires the [gstack](https://github.com/garrytan/gstack) skill set for AI-assisted work. Contributor onboarding documented in `CLAUDE.md`.

## [1.0.0] - prior

- Initial release. Tirumala–Tirupati journey atlas with MapLibre 3D terrain, real-time weather, and editorial postcards.
