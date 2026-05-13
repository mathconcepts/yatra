# Changelog

All notable changes to this project will be documented in this file.

## [1.6.7] - 2026-05-13 — AI Cinematographer Step 7: end-to-end pipeline (DirectorView ships a real MP4)

The glue commit. DirectorView's "Direct this journey" button now runs the full chain:
script → TTS → audio mix → director-mode renderer → MP4 encode → postcard cover. Click,
wait ~30 seconds, get a downloadable MP4 + downloadable postcard PNG.

### Added
- **`src/services/directorPipeline.js`**:
  - `framePlanForDuration(durationS, fps)` — pure frame-count math.
  - `scenesToAudioTiming(scenes)` — pure scene-starts + total-duration extractor.
  - `runDirectorPipeline({config, palette, language, ...})` — orchestrator. Calls `generateScript` → `synthesizeScenes` → `mixDirectorAudio` → `createOffscreenReelRenderer({directorMode})` → `encodeMp4` → `exportPostcard`. Returns `{mp4Url, postcardUrl, scenes, mode, audioBuffer, frameCount, durationS}`. Emits per-stage progress events. Every dependency is injected; the production caller in DirectorView wires real modules, tests inject fakes.

### Changed
- **`src/components/director/DirectorView.jsx`** — now runs the full pipeline on click. New result UI: download links for MP4 and postcard PNG, collapsed scene list under a `<details>`, real progress messages per stage ("Composing the script", "Recording the voice", "Color-grading the map", "Cutting the film", "Printing the postcard"). Cancel button replaces the CTA mid-run via `AbortController`. Lazy-loads `reelRenderer` + `mp4Export` so first paint stays fast.
- `OfflineAudioContext` wired in as the production `createAudioBuffer` factory when the host supports it; pipeline degrades cleanly without it.

### Tests
- 14 new tests in `test/director-pipeline.test.js`: frame-plan math, scene-timing extraction, full orchestrator walk with progress events captured, directorMode payload passed to renderer, first-frame-as-postcard-hero passthrough, abort mid-render, input validation, missing-dep rejection, empty-script handling, no-audio-buffer fallback. Total: 484/484.

### What's silent and why
The MP4 still has no audio embedded. `directorAudio` produced and returned an `AudioBuffer`, and the pipeline validated its shape and timing. Embedding it into the MP4 needs a small `encodeMp4` surface change (accept `audioBuffer` alongside `audioBlob`); that lands in v1.6.8 alongside the first real TTS pass. Today: silent video + cover postcard ready to share. The MP4 file you download right now will play in QuickTime; the audio is the only thing missing.

### State of the lake
Every pure-code piece of the AI Cinematographer has landed. The remaining gates are operational, not code:
1. TTS quality validation ($5 ElevenLabs sample to a relative — your job)
2. Worker hardening (Turnstile + DO + KV + R2 + killswitch) before any public deploy
3. AudioBuffer → MP4 wiring (~30 lines, ships in v1.6.8)

## [1.6.6] - 2026-05-13 — AI Cinematographer Step 6: directorTTS (silent / tone / live providers)

The TTS service layer per the design doc — produces one `Float32Array` of narration audio
per scene, ready for `directorAudio.mixDirectorAudio` to assemble into the master narration
channel. Three providers; default is `silent` when `VITE_DIRECTOR_MOCK=1`.

### Added
- **`src/services/directorTTS.js`** with:
  - `synthesizeSilence(durationS, sampleRate)` — exact-length zero channel.
  - `synthesizeTone(durationS, sampleRate, {freq, amp})` — 220 Hz sine with 30ms cosine fades for audible pipeline checks without paying for TTS.
  - `buildTtsRequest({scene, palette, language})` — pure /v1/tts request assembler; rejects unknown languages or missing voice ids.
  - `alignToSceneDuration(samples, durationS, sampleRate)` — pad or truncate audio to fit the scene slot exactly so master-timeline math stays clean even when providers return imprecise lengths.
  - `synthesizeSceneLive(scene, {workerBase, fetchImpl, decodeAudio, ...})` — POST to Worker `/v1/tts`, decode bytes via injected `decodeAudio` (production wraps `AudioContext.decodeAudioData`), align to scene duration.
  - `synthesizeScenes({scenes, palette, language, sampleRate, mode, workerBase, fetchImpl, decodeAudio})` — orchestrator. Mode auto-detects (`silent` when `VITE_DIRECTOR_MOCK=1`, else `live`). Returns `{tracks, mode}` — `tracks` is `Float32Array[]` aligned to scene order, drop-in for `mixDirectorAudio({sceneTracks, sceneStartsS})`.
  - `sceneStarts(scenes)` — convenience for the mixer's `sceneStartsS` arg.

### Why silent is the default
The autoplan CEO review said Indic TTS quality is the entire moat and must be validated with a $5 ElevenLabs sample before more code is worth writing. Until that validation happens, the pipeline ships silent — honest about what it is. `tone` mode is the audible cousin for timing sanity checks without paying for TTS.

### Tests
- 24 new tests covering: silence/tone math (length, fade endpoints, amplitude scaling), peak detection that avoids periodic-signal zero-crossings, request assembly (4 languages + rejection), scene-duration alignment (longer/shorter/null inputs), live provider (correct POST body, scene-duration padding, worker-error propagation, missing-dep rejection), orchestrator routing across silent/tone/live, missing workerBase failure, input validation. Total: 470/470.

### Not yet
- `synthesizeScenes` is not yet called by `DirectorView`. One glue commit (script → TTS → mixer → composeFrame → mp4Export → exportPostcard cover) wires the full pipeline.

## [1.6.5] - 2026-05-13 — AI Cinematographer Step 5: exportPostcard (the WhatsApp preview artifact)

The most-shareable artifact per byte. Stills survive WhatsApp compression where MP4s get
crushed; OG preview thumbnails carry 80% of the in-feed storytelling before anyone taps
play. The postcard render is also the canonical first frame of every Director MP4, so the
same function works as standalone PNG export and as a video frame.

### Added
- **`src/services/exportPostcard.js`** with three pure helpers plus an orchestrator:
  - `formatStatsLine({distanceKm, durationHr, elevGainM, language})` — localized stats. Distance/duration formatting is locale-aware; unit suffixes translate (km → కిమీ / किमी / கி.மீ). Digits stay Latin for cross-script feed legibility.
  - `layoutPostcard({width, height, palette})` — region rectangles for hero (55%), title (18%), subtitle (12%), ornament (15%). Insets scale proportionally to canvas height.
  - `drawPostcard(ctx, {sourceFrame, palette, language, title, statsLine})` — paints parchment background, draws hero (source frame or palette gradient placeholder), typesets title with `fontForLanguage`, draws subtitle stats, draws ornament rule + accent label.
  - `exportPostcard({sourceCanvas, config, palette, language})` — orchestrator that creates a 9:16 canvas (720×1280 default), renders, returns blob URL. Production wires real `document.createElement('canvas')`, `canvas.toBlob`, `URL.createObjectURL`; tests inject fakes.

### Tests
- 22 new tests in `test/export-postcard.test.js`: stats formatting (4 languages, edge cases, fallbacks), layout regions (no overlap, proportional scaling, input validation), drawing (background, hero, title font selection per language, gradient placeholder fallback, ornament), end-to-end orchestrator (blob URL, climb computation from origin/destination, source-canvas passthrough, encode failure). Total: 444/444.

### Not yet
- `exportPostcard` is not yet wired into `exportRouter.exportArtifact` or `DirectorView`'s download button. That single-line glue commit waits until DirectorView has a render to share.
- The mandala SVG ornament referenced in `devotional.js` (`palette.ornament.asset`) is not yet shipped; the postcard currently uses a saffron rule + label. SVG ornament lands when the visual design is locked.

## [1.6.4] - 2026-05-13 — AI Cinematographer Step 4: Worker calls real Claude

`/v1/script` now calls Anthropic Claude Haiku 4.5 with the curated Devotional system prompt
when `ANTHROPIC_API_KEY` is provisioned via `wrangler secret put`. When the key is absent
(dev or first-deploy verification), the Worker falls back to the stub-echo shape so the
network path still works end-to-end without coupling deploys to key provisioning.

### Added
- **`workers/yatra-director/claudeClient.js`** — pure parts (`extractSystemPrompt`, `buildUserPrompt`, `parseClaudeResponse`) plus the thin `callClaude` fetch wrapper. 15-second timeout with AbortController. Errors carry a `code` field (`auth | rate | timeout | parse`) so the Worker maps them onto RFC-7807 status codes (502/503/504).
- **`workers/yatra-director/prompts/devotional.md`** — human-editable source-of-truth for the Devotional system prompt. Includes religious-safety constraints from the autoplan CEO review ("never invent deity attribution, never invent Vaishnava/Shaiva conflations beyond curated facts").
- **`workers/yatra-director/src/prompts.js`** — JS-bundle mirror of the .md prompts. Sync-by-hand for now; future `scripts/sync-prompts.mjs` automates it.
- Worker `handleScript`: validates tone has a wired prompt, calls Claude when key present, falls back to stub when not. Errors from `callClaude` map to upstream-claude RFC-7807 problem responses with appropriate status codes.

### Tests
- 23 new tests in `test/claude-client.test.js`: prompt extraction, user-prompt assembly (peak moment formatting, curated-facts safety messaging, empty-landmarks handling), response parsing (JSON, fenced JSON, schema validation, error paths), `callClaude` integration (auth/rate/timeout/parse error mapping, multi-block text joining). Total: 422/422.

### Deploy gate (unchanged)
Worker still NOT deploy-ready. `SECURITY.md` checklist (Turnstile, rate-limit DO, KV daily ceiling, R2 cache, kill switch) is the gate. The Claude integration is wired but unguarded.

## [1.6.3] - 2026-05-13 — AI Cinematographer Step 3: audio mixer (OfflineAudioContext-ready)

The directorAudio.js mixer per the autoplan eng review's call: all math in Float32Array
land so it's unit-testable, with a thin orchestrator that touches OfflineAudioContext
through an injected `createBuffer`. Production passes
`new OfflineAudioContext(1, length, sr).createBuffer.bind(ctx)`; tests pass a fake.

### Added
- **`src/services/directorAudio.js`** with pure primitives:
  - `dbfsToGain(dbfs)` — handles 0, -6, -Infinity, NaN cleanly.
  - `mixInto(out, source, {outOffset, gain, gainEnvelope})` — additive mix with clip to [-1, 1].
  - `mixWithEqualPowerFade(out, source, {fadeSamples, ...})` — sin/cos endpoints land exactly at 0; for scene-boundary narration crossfade.
  - `sidechainEnvelope(narration, {threshold, floorGain, attackMs, releaseMs, sampleRate})` — running-RMS windowed gate + one-pole attack/release. Music/ambient gain dips when narration is loud, recovers when silent.
  - `ambientEnvelope(proximity, rule)` — gates ambient (temple bell, wind) by per-sample landmarkProximityFactor; linear interpolation between rule.gateAt → rule.peakAt.
  - `loopToLength(source, lengthSamples)` — extend music beds to full render length.
  - `concatenateNarration({sceneTracks, sceneStartsS, sampleRate, lengthSamples, crossfadeMs})` — assemble scene-by-scene TTS into a master narration channel.
  - `mixDirectorAudio({sampleRate, durationS, sceneTracks, musicBed, ambientSources, proximityChannel, palette, createBuffer})` — orchestrator. Returns the AudioBuffer ready for the existing `encodeAacFromBuffer` path in audioEncode.js.

### Tests
- 27 new tests covering dB→gain, additive mix + clip, equal-power crossfade endpoints, sidechain attack/release, ambient gate/peak/saturate, music ducking under narration, ambient gated by proximity ramp, input validation. Total: 398/398.

### What's wired vs not
- Mixer is the **pipeline-final shape** — it produces what `encodeAacFromBuffer` already expects.
- It is **not yet called** by `DirectorView`. That landing comes next, when `/v1/tts` is real and narration buffers exist to feed it.
- The OfflineAudioContext call site that wraps this is a 4-line factory; deferred to the same commit that wires TTS so we don't introduce a dead call path.

## [1.6.2] - 2026-05-13 — AI Cinematographer Step 2b: wire compositor into reelRenderer (opt-in)

Low-risk opt-in wiring of the v1.6.1 compositor into the existing offscreen reel renderer.
Existing call sites unchanged — when `directorMode` is absent (everywhere today), `captureFrame`
returns the raw map snapshot exactly as before. When `directorMode` is provided, every frame
is graded + caption-burned before encoding.

### Added
- **`wrapCaptureWithDirector(captureFrame, {scenes, palette, language, durationS, ...})`** in `src/services/reelRenderer.js`. Pure factory; dependencies (`createCanvas`, `createBitmap`, optional `composeFn`) injected for testability. Reuses one working canvas across all frames in a render. Clamps `t` to `[0, 1]` and maps to absolute seconds via `durationS`.
- **`directorMode` option** on `createOffscreenReelRenderer(config, {directorMode})`. When set, the rendered `captureFrame` is wrapped. Production passes browser `createImageBitmap` + a real HTMLCanvasElement factory.

### Tests
- 6 new tests in `test/reel-renderer.test.js` covering: wrapper output shape, canvas reuse across frames, t→seconds mapping + clamping, error propagation from the underlying capture, and input validation. Total: 371/371.

### What this unblocks
The Director surface can now ask the renderer for graded+captioned frames in one call. Next step (audio mixing + Worker Claude wiring) plugs into this without touching the renderer again.

## [1.6.1] - 2026-05-13 — AI Cinematographer Step 2a: per-frame compositor (color grade + caption burn-in)

Two of the auto-decided items from /autoplan land as pure helpers, fully tested in jsdom.
Both wire into the eventual MP4 render path between `reelRenderer.captureFrame` and the
WebCodecs encoder. Reels live preview and the postcard cover frame share the same code.

### Added
- **`src/services/colorGrade.js`** — per-frame 4x4 color-matrix LUT applied via ImageData. Identity fast-path is a no-op so tones without tint pay nothing. Replaces the original design doc's wrong "color LUT applied to map tiles via basemap variants" plan that the eng review caught (raster tiles can't be tinted via style filters; CSS filters don't land in WebGL framebuffer captures).
- **`src/services/captionBurnIn.js`** — per-line burned-in captions with safe-zone-aware layout for 9:16 export (220px top inset, 320px bottom Instagram gutter). Per-language font selection (Telugu → Mandali, Hindi → Tiro Devanagari, Tamil → Catamaran, English/fallback → Fraunces). Greedy word wrap that shrinks font (not text) when long Indic place names overflow. Fade-in/fade-out opacity envelope from the palette.
- **`src/services/sceneComposer.js`** — wraps per-frame work: `composeFrame(ctx, {sourceFrame, scenes, t, palette, language})` draws the source frame, runs the LUT, finds the active scene, burns its caption. `skipGrade` / `skipCaption` options so Reels can reuse the same code for live preview and postcards can reuse for cover frames.

### Tests
- `test/color-grade.test.js`, `test/caption-burn-in.test.js`, `test/scene-composer.test.js` — 49 new tests, all green. Total suite: 366/366.

## [1.6.0] - 2026-05-13 — AI Cinematographer Step 1: Director scaffold + tone palettes + Worker contract

First commit of the AI Cinematographer per the office-hours design doc at
`~/.gstack/projects/mathconcepts-yatra/root-claude-install-gstack-RXXAr-design-20260513-133915.md`.
Reviewed via `/autoplan` (CEO + Design + Eng + DX subagents); user accepted B-straight
direction and the auto-decided security baseline.

### Added
- **`src/services/tonePalettes/`** — the taste layer. `schema.js` validator loud-fails on missing fields. `devotional.js` ships concrete values: saffron `#8a4528` + parchment `#f4ede1` baseline; Indic font stack (Tiro Devanagari Hindi / Mandali Telugu / Catamaran Tamil) — Cormorant Garamond has zero Indic glyph coverage so it's no longer the fallback for Indic text. 4x4 color-matrix LUT, per-line burned-in captions (Instagram autoplays muted; sound-off viewers cannot otherwise see narration). Explorer / Poetic / Historical inherit Devotional's shape as stubs.
- **`src/services/directorScript.js`** — script generator with `VITE_DIRECTOR_MOCK=1` mode. Returns a hand-authored Telugu Devotional Yadagiri fixture so contributors can render end-to-end without any API key. Live mode posts to the Cloudflare Worker's `/v1/script`. Reuses `detectPeakMoments` so scenes ARE peak moments.
- **`src/components/director/DirectorView.jsx`** — new `?surface=director` route. Tone picker first (4 palettes), then route, then language chips (en/hi/te/ta, defaults to device locale). One "Direct this journey" button. v0 renders the returned scenes as a text list; TTS + audio mixing + map render + MP4 mux land in later commits.
- **`workers/yatra-director/`** — Cloudflare Worker scaffold with `API.md` (versioned `/v1/script`, RFC-7807 error shape, Turnstile + rate-limit + idempotency contract), `SECURITY.md` (pre-deploy checklist, rotation cadence, leak playbook, ~$0.72 multilingual-render cost analysis with the $7,200-scraper-loop risk made explicit), shared `schemas.js` imported by both Worker and client, stub `src/index.js` that echoes a one-scene placeholder so the network path is exercised before Claude is wired in. Worker is NOT deploy-ready — auto-decided security controls (Turnstile, Durable Object rate-limit, KV daily ceiling, kill switch, R2 cache) exist as TODO markers gated by the SECURITY.md checklist.
- **`src/components/director/README.md`** — single-file pipeline overview; the year-from-now-start-here doc.
- **`src/fixtures/directorScript.yadagiri.devotional.te.json`** — hand-authored Telugu narration for Yadagiri, 5 scenes / 30s.

### Changed
- `SurfaceRouter.jsx` adds `director` to `VALID_SURFACES`, lazy-loads `DirectorView`, and wires a toggle button. Full registry refactor (recommended by the DX reviewer) deferred to a follow-up commit to keep this diff scoped.
- `package.json` → 1.6.0.

### Auto-decided baseline (locked, even though not yet enforced in stub)
1. Worker security: Turnstile + signed token + per-IP DO rate-limit + KV daily ceiling + R2 idempotency cache + env kill switch. Documented in `SECURITY.md` as the deploy gate.
2. Color LUT applies per-frame in `colorGrade.js` (planned), NOT via raster basemap variants — `preserveDrawingBuffer` captures the WebGL framebuffer, not styled DOM, so CSS filters would not land in the MP4.
3. Audio mixing path = `OfflineAudioContext` → single `AudioBuffer` → existing `encodeAacFromBuffer`. LUFS language dropped (Web Audio has no LUFS meter); target peak/RMS dBFS.
4. `VITE_DIRECTOR_MOCK=1` + `window.speechSynthesis` fallback so the feature is testable without any API key.
5. Per-line burned-in captions (not scene-boundary) — Instagram autoplay-muted is the dominant feed reality.

## [1.5.4] - 2026-05-13 — Reels layout cleanup + Export bulletproof

### Fixed
- **Reels orbit / bird's-eye out of sync** with traversed path. The manual-mode auto-recenter (v1.5.2) eased the camera back to the marker every 800ms, fighting non-default camera modes. Now gated on `cameraMode === "default"` — bird/chase/orbit own the framing without interference.
- **Reels basemap + camera-mode pills overlapped** on narrow viewports. Restructured into a single top control strip: basemap + camera-mode pill groups in a row at top-left, wrapping when narrow. Pause/recenter live in a separate top-right toolbar.
- **Atlas Export menu still hidden behind buttons.** v1.5.3 used absolute positioning (relative to `.atlas-export`) which sometimes failed depending on stacking context. Switched to fixed positioning (`bottom: 16px; left: 192px; z-index: 999`) with an opaque `#0d1a26` background — floats above everything regardless of parent z-index.

## [1.5.3] - 2026-05-13 — QA pass on v1.5.2

### Fixed
- **Atlas Export dropdown opened upward and overlapped the toggle column.** Moved the menu to open to the RIGHT of the Export button (`left: 100%; bottom: 0`) so it no longer covers Compose memory / My memories / Compare / Reels mode. Background bumped to 98% opacity + z-index 200.
- **Compare view had no basemap selector.** Added a Topo / Imagery / Relief pill to the Compare header that drives both overlay and split views. Defaults to Topo.
- **Split-view basemaps inherited each config's default**, so a Tirupati + Yadagiri compare showed one topo + one imagery panel without user choice. Now both panels honor the single shared basemap selection.

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
