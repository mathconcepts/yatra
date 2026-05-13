# Changelog

All notable changes to this project will be documented in this file.

## [1.5.2] - 2026-05-13 — QA pass on v1.5.1

User-reported issues from the second QA round.

### Fixed
- **Export menu overlapped the surface toggle stack.** Lifted `mapRef` into `App` so `SurfaceRouter` can render `AtlasExportMenu` inside the `.jm-surface-toggles` column. Removed the floating sibling rendering from `JourneyMap`. Export now sits as a clean 5th item in the column.
- **Compare view didn't include Srivari Mettu.** The dropdown listed each curated location once even when it had multiple routes. Now each route in a multi-route config gets its own dropdown option (e.g. "Tirupati → Tirumala · Alipiri Mettu" and "… · Srivari Mettu") via a per-route config projection.
- **PNG snapshot had no geographical context.** `exportPng` now accepts a `config` argument and composites an editorial caption strip: 80px dark header with title + subtitle, the rendered map below, and a 64px footer with route name, distance, duration, and total climb in meters. `AtlasExportMenu` passes the active config through.
- **Compare view had no split-screen mode.** Added an Overlay / Split toggle in the compare header. Split mode renders two stacked map panels, each with its own route + marker, sharing the progress slider. Panels are color-edged (saffron / sky) to reinforce which is A vs B.

### Other
- Cleaned up the duplicate `useMemo`-imported `summarizeJourney` reference in `CompareView.jsx`.

## [1.5.1] - 2026-05-13 — QA pass on v1.5.0

User-reported issues from the Atlas compare + universal export ship.

### Fixed
- **Atlas Snapshot PNG returned a blank image.** Root cause: MapLibre's WebGL context clears between frames; `canvas.toBlob` captured the cleared buffer. Added `preserveDrawingBuffer: true` to `MapView`'s map constructor. PNG snapshots now contain the rendered scene.
- **MP4 export failed with "Cannot call 'encode' on a closed codec".** The encoder's `error` callback was throwing synchronously, closing the encoder while the loop kept calling `encode()`. Replaced with an `encoderError` flag — the loop now checks `videoEncoder.state` + the flag and breaks cleanly. Errors surface as `Video encode failed: ${message}` instead of cryptic codec errors.
- **Export menu overlapped the surface toggle stack.** `.atlas-export` was rendered in document flow at the end of JourneyMap with no positioning, so it landed wherever the layout pushed it. Moved to `position: fixed; bottom: 16px; left: 192px` — sits just right of the toggle column with a 160px width.
- **GpxImporter only accepted a single file.** Now `<input multiple>` and the parser concatenates tracks in selection order. UI surface shows "Imported N points from M tracks." Adaptive simplification still caps the combined route at 500 points.
- **Atlas "Compare all" didn't visually indicate both routes were selected.** Both individual route tabs now highlight as "active" while in compare mode (boxShadow underline of each route's color), and the Compare All tab itself flips its label to "Comparing ✓". Lines were already rendering at full weight; the missing signal was just visual.

### Deferred (TODOS.md)
- Atlas Compare All — dual-marker playback (today: lines visible, marker still follows single route)
- Split-screen vertical compare (Reels-format compare for social share)

## [1.5.0] - 2026-05-13 — Compare + universal export (v3.4 Waves B + C, lean cut)

### Added
- `?surface=compare` — pick any two journeys (curated or saved memories) from dropdowns; both routes render simultaneously in saffron + sky, both markers play against a shared progress, side panel shows live distance / elevation / waypoint / landmark deltas. New `Compare` button in the Atlas toggle bar.
- Atlas **Compare all routes** tab — for any config with multiple routes (Tirupati's Alipiri + Srivari mettu), renders all routes at full weight simultaneously instead of one active + others faded.
- Universal export router `src/services/exportRouter.js` — `exportArtifact({format, aspect, canvas, config})` routes to PNG (canvas.toBlob snapshot) or MP4 at 9:16 / 1:1 / 16:9. Reuses the offscreen ReelRenderer + mp4Export pipeline. PNG fast-path snapshots the live MapLibre canvas with no re-render.
- Atlas **Export** dropdown — snapshot PNG of current view, or render MP4 at any of 3 aspects.
- Tests: 306/306 (+17 — compareJourneys ✕6, exportRouter ✕11).

### Deferred (tracked in TODOS.md)
- **P4 split-screen vertical reels** — needs `?surface=split` route; v3.4 ships the wide-Atlas compare instead.
- **Animated GIF export** — needs gif.js dep (~30KB); MP4 ships first.

### Fixed (drive-by)
- Removed a duplicate `surface === "memories"` branch in `SurfaceRouter.jsx` left over from a prior rebase.

## [1.4.0] - 2026-05-13 — Cadence wave (v3.3)

The "right view at the right moment" wave from the v3.3 CEO brainstorm.

### Added
- `src/services/cameraModes.js` — four camera modes wrap the mood-cadence plan: **default** (passthrough), **birdseye** (pitch 0, baseZoom-2), **chase** (pitch 72, baseZoom+1.2), **orbit** (bearing rotates 360° over the loop). Pure `applyCameraMode` runs after `sampleCameraPlan` in the rAF loop. UI pill at top-right of the reel.
- `src/services/moodCamera.js` — extended with `localSpeedFactor` (distance-per-t window, clamped 0..3) and `landmarkProximityFactor` (0..1 falloff 0.5km..3km from any landmark). `terrainHeuristic` now tightens zoom + tilts up near landmarks and damps pitch on fast straights. High-proximity beats get a 600ms hold.
- `src/services/peakMoments.js` — pure `detectPeakMoments(config)` scans waypoints + landmarks for origin, destination, steepest 100m+ climb, longest single segment, and each landmark crossing. Dedupes within ±2% t. Renders as scrubbable chips below the timeline; tap to jump to that progress.
- Tests: 289/289 (+31 — cameraModes ✕8, peakMoments ✕10, moodCamera adaptive ✕13).

## [1.3.0] - 2026-05-12 — Memory gallery + share URLs (v3.2)

Composed memories can now be saved locally and shared via URL — no backend, no upload.

### Added
- `src/services/memoryStore.js` — localStorage CRUD over a versioned schema (`yatra.memories.v1`). `sanitizeForStorage` strips blob-URL fields (`landmark.photoUrl`, `narrationUrl`) that wouldn't survive a reload; persistent media is tracked as a v3.3 polish item. Quota-exceeded path retries with a half-sized list before giving up.
- `src/services/shareLink.js` — pure base64url codec over a hand-compacted LocationConfig representation (short single-letter keys, `[lat,lon,elev]` tuples). 10-waypoint reel encodes to ~1-3 KB, full Konkan to ~6 KB, 500-point GPX to ~25-30 KB. Above 24 KB the encoder automatically drops waypoint elevations to save bytes.
- `src/components/memories/MemoryGallery.jsx` — grid surface for saved memories. Each card surfaces Open / Share / Delete. Share copies a `?surface=reels&memory=<base64>` URL to clipboard (falls back to `window.prompt` when clipboard access is denied).
- `MemoryComposer` — three actions after the form is ready: Preview reel, Save memory, Share link. Inline `aria-live` notice confirms each action.
- `SurfaceRouter` — accepts `memories` as a valid URL/storage override. URL-fragment routing: any incoming `?memory=…` is decoded on first paint and routed to reels with the shared config as the only reel.
- Tests: 258/258 (+23 — memoryStore ✕13, shareLink ✕10, surface-router +3).

## [1.2.1] - 2026-05-12 — v3.1 completion (live frames + audio + preview)

Closes the two items deferred from v1.2.0 plus an inline preview UX polish.

### Added
- `src/services/reelRenderer.js` — offscreen MapLibre renderer. Mounts a hidden 720×1280 `maplibregl.Map` (preserveDrawingBuffer: true, interactive: false), drops the route line, sets terrain (clamped 1.3), awaits idle, and exposes `captureFrame(t)` → `ImageBitmap`. Replaces v1.2.0's placeholder gradient in ExportPanel.
- `src/services/audioEncode.js` — `AudioEncoder` pipeline. `decodeAudioBlob()` decodes the narration WebM/Opus blob via `AudioContext.decodeAudioData`. `encodeAacFromBuffer()` interleaves PCM channels into AAC LC frames (1024 samples, 128 kbps, `mp4a.40.2`) and emits chunks to a callback. `framesForBuffer()` is pure and unit-tested.
- `encodeMp4` (v1.2.0) now invokes the audio path when narration is present — decodes first, configures the muxer audio track to match the actual `numberOfChannels` / `sampleRate`, then mixes AAC chunks via `muxer.addAudioChunk`. Audio-decode failures fall back to video-only silently.
- `ExportPanel` renders an inline `<video>` of the encoded MP4 before the download link, so users can review without leaving the composer.
- Tests: 235/235 (+15 — `cameraForT` ✕6, `audioEncode` ✕9).

## [1.2.0] - 2026-05-12 — Memory Composer ship

**v3.1 Memory Composer** lands as **v1.2.0**. The composer surface (`?surface=composer` or the new "Compose memory" button on Atlas) turns Yatra from a curated-reel viewer into a UGC platform: pick A→B from a Nominatim-backed autocomplete, drop a GPX file, drop photos with EXIF GPS, record narration, and export a 9:16 MP4 via WebCodecs + mp4-muxer.

### Added (v3.1 Slices A–G)
- `src/components/composer/` — full composer scaffold: `MemoryComposer.jsx` (form + state), `composer-state.js` (pure reducer + projection to LocationConfig), `PlacePicker.jsx`, `GpxImporter.jsx`, `PhotoDrop.jsx`, `NarrationRecorder.jsx`, `ExportPanel.jsx`, `AiScaffoldInput.jsx`.
- `src/services/geocoder.js` — Nominatim client with hourly cache, abort-aware fetch, defensive parsing, swappable fetcher for tests.
- `src/services/gpx.js` — zero-dependency GPX parser + Douglas-Peucker simplifier. Caps imports at 500 points.
- `src/services/exif.js` — zero-dependency EXIF GPS extractor (walks JPEG APP1 / TIFF IFDs). Returns `{lat, lon}` or `null`.
- `src/services/mp4Export.js` — WebCodecs `VideoEncoder` + `mp4-muxer` pipeline. Feature-detects, frame-plans, encodes H.264 AVC1 MP4 at 720×1280, 30 fps. Yields per-second so the encoder queue doesn't blow up on Pixel-class hardware.
- `src/services/aiScaffold.js` — free-text → candidate place names → Nominatim-verified waypoints. Sentence-start verb stripping, importance floor 0.35, narrative ordering.
- `SurfaceRouter` accepts `composer` as a valid URL/storage override. Atlas surface gains a "Compose memory" toggle alongside "Reels mode".
- Tests: 220/220 (+74 — composer-state ✕12, surface-router ✕2, geocoder ✕16, route-builder ✕6, gpx ✕8, exif ✕7, mp4-export ✕10, ai-scaffold ✕13).
- Dependencies: `mp4-muxer ^5.2.2`.

### Deferred to TODOS
- ExportPanel currently renders a placeholder gradient + title card per frame; wiring it to the live MapLibre canvas needs cross-surface frame capture (next slice).
- Audio path is video-only for the initial release; narration is preserved as a sibling URL until the `AudioEncoder` plumbing lands.
- LLM-based extract for `aiScaffold` (multi-word lowercase places, semantic dedupe). Today's heuristic handles capitalized proper nouns.

## [1.1.0] - 2026-05-12 — Memory Reels ship 🎬

**v3.0 Memory Reels feed-first** lands as **v1.1.0**. Tirupati's atlas stays unchanged on desktop; portrait viewports and `?surface=reels` get the new vertical surface with mood-cadence cinematography, manual-override pill, and three additional curated Indian journeys.

### Added (this PR — Slice 8 only)
- `src/services/perfProbe.js` — pure FPS scorer (`scoreFrames`) + runtime sampler (`startProbe`). Median frame-time over 5 s of playback; if median > 41 ms (≈ 24 fps) and at least 30 samples collected, the verdict is `shouldDisableTerrain: true`.
- `MapView` opt-in `enablePerfProbe` prop. Reels surface turns it on; if Pixel-6a-class hardware can't sustain 24 fps, `map.setTerrain(null)` for the rest of the session — better to drop to 2D than ship visible jank.
- `MapView` opt-in `mobileTerrainCap` prop. Reels surface passes `1.3` so the Tirupati 1.5 default gets clamped on portrait viewports. Atlas is unaffected.
- `clampTerrain` helper for the terrain-exaggeration clamp.
- Tests: 13 new — `scoreFrames` median/p95/threshold semantics (8) + `clampTerrain` cap behavior (5).

### Changed (since v1.0.10)
- `README.md` describes the v1.1.0 vertical surface + four curated journeys.
- `TODOS.md` created with deferred items: Slice 6b OpenRailwayMap polyline import, live train positions, Bhuvan proxy deploy, and the full v3.1 roadmap (composer, WebCodecs export, AI scaffold).

### v3.0 ship summary (cumulative across slices 0.5 – 8)
- Vertical 9:16 Reels surface with aspect-ratio routing (URL + `localStorage` override)
- 4 curated India journeys (Tirupati, Srirangam → Trichy, Yadagiri Hill, Konkan Railway)
- Mood-cadence camera with two strategies (terrain elevation-driven, rail event-density-driven)
- Manual override pill with 5 s no-touch auto-resume + 30 ms haptic
- Tile fallback chain (ESRI → OSM → Bhuvan-via-Cloudflare-Worker)
- Bhuvan proxy Worker scaffold with HMAC tokens, HTML-200 error detection, 60 s error cache
- Postcard polish pipeline + manifest + CI verifier (opt-in; v3.0 ships with hand-written prose)
- Reduced-motion + accessibility wins (`prefers-reduced-motion`, ARIA slider, ≥ 44 pt touch targets)
- Runtime FPS probe + terrain auto-disable for low-end Android
- 146 tests across 13 files; CI runs `npm test` + `polish:check` on every push

## [1.0.10] - 2026-05-12

### Added
- `src/services/polishedPostcards.js` — runtime lookup that prefers polished text from `polish-manifest.json` when present, otherwise falls back to the hand-written `landmark.blurb`. Vite inlines the manifest at build time, so this is a free lookup at runtime with zero behaviour change when the manifest is empty (v3.0 starting state).
- Reels postcards now read `polishedBlurb(config.id, landmark.id) || landmark.blurb`. Once the corpus is polished by the Slice 6c pipeline, every reel surfaces the tightened prose automatically — no per-config wiring needed.
- `@media (prefers-reduced-motion: reduce)` stanza in `styles.css`: drops the postcard entrance animation, the auto-camera-pill flash, and the countdown decay. Functional state stays identical; only the motion softens. Honors WCAG 2.1 SC 2.3.3.
- Stronger gradient scrim behind the reel title overlay so text reads cleanly over the imagery basemap (Konkan / Yadagiri).
- Tests: 3 new — polished-text returns from manifest, returns null for missing pair, returns null for nullish args.

## [1.0.9] - 2026-05-12

### Added
- **Postcard polish pipeline** (`scripts/polish-postcards.mjs`) — build-time Node ESM driver that runs Claude over hand-written landmark `blurb`s to tighten prose to ≤60 words while preserving every place name and numeric fact. Religious carve-out: skips `shrine` and `destination`-with-`ritual` landmarks. Idempotent via per-landmark draft + prompt hashes — re-running with no changes is free.
- **Strict polish prompt** (`scripts/lib/postcard-prompt.mjs`) — model pin `claude-sonnet-4-7`, temp 0, system prompt versioned via `PROMPT_VERSION` so version bumps invalidate every entry.
- **Eval gate** (`scripts/lib/proper-noun-diff.mjs`) — pure function that extracts capitalised tokens, ignores sentence-initial caps + a stop list of function words and pronouns. Polish is REJECTED if it introduces any proper noun not in the draft.
- **`scripts/lib/should-polish.mjs`** — religious carve-out predicate (P3-revised from the v3.0 autoplan): shrines and ritual destinations stay hand-curated.
- **Manifest** (`polish-manifest.json`) — stores `{draftHash, polishedHash, polished, model, temp, promptVersion, promptHash, timestamp}` per landmark.
- **CI manifest verifier** (`scripts/check-postcard-manifest.mjs`) — runs on every push: asserts polishedHash matches the polished text, draft still hashes to the manifest's `draftHash` (catches "draft edited but polish not re-run"), no new proper nouns vs current draft, ≤60 words.
- **`docs/POSTCARD-POLISH.md`** — full pipeline docs: how to run, what CI checks, religious carve-out rationale, cost estimate, prompt versioning.
- **npm scripts**: `polish:dry`, `polish`, `polish:check`.
- Tests: 26 new — `extractProperNouns` semantics (sentence-initial / function-word / pronoun filtering), `diffNewProperNouns`, `wordCount`, `shouldPolish` religious carve-out matrix (10 cases), `postcard-prompt` invariants.

### Changed
- `.github/workflows/test.yml` now runs `npm test` + `polish:check` on every push and PR. Empty manifest passes trivially — this is the v3.0 starting state.

### Notes
- The pipeline ships with `polish-manifest.json` empty. Each curated journey still ships fully hand-written. Run `npm run polish` locally with `ANTHROPIC_API_KEY` set when you want LLM-tightened prose; review the diff in the manifest; commit.
- Cost estimate: ~$0.05 for a full v3.0 corpus (19 polish-eligible landmarks).

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
