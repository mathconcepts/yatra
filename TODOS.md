# TODOS

Per-component / per-skill todos, ordered by priority (P0 = blocker, P4 = nice-to-have).
Completed items move to the `## Completed` section at the bottom with the version they shipped in.

## Reels

### Slice 6b — OpenRailwayMap polyline import for Konkan
**Priority:** P3
**What:** Replace the 18-waypoint station-sequence path in `src/config/konkan-railway.js` with real rail-line geometry pulled from OpenRailwayMap via Overpass, simplified with Douglas-Peucker to ~2000 points.
**Why:** The current path is a straight-line station sequence — visually fine at vertical scale but inaccurate against the actual track curvature through the Western Ghats.
**Context:** v3.0 plan reviewer correction #5 called this out; deferred to post-v3.0 ship because the station path is good enough for the launch demo. Attribution (ODbL) committed to `docs/ATTRIBUTION.md` at the same time.
**Depends on:** —

### Live train positions (NTES / RailRadar)
**Priority:** P4
**What:** Optional Cloudflare Worker that scrapes Indian Railways NTES or RailRadar for live train positions on the Konkan line.
**Why:** Would let the Konkan reel show "where the train is right now."
**Context:** Plan P4 explicitly deferred — no SLA, maintenance burden, legal grey area on scraping rate.
**Depends on:** Bhuvan-proxy worker patterns (same Cloudflare Workers infra).

## Postcard polish

### Run the v3.0 corpus through `polish-postcards.mjs`
**Priority:** P3
**What:** With `ANTHROPIC_API_KEY` set, run `npm run polish` over the current 19 polish-eligible landmark blurbs. Review the resulting `polish-manifest.json` diff. Commit.
**Why:** v3.0 ships with hand-written drafts; the polish step is opt-in. Running it once tightens prose to ≤60 words while preserving all place names + numeric facts.
**Context:** `docs/POSTCARD-POLISH.md` explains the flow. Cost ≈ $0.05.
**Depends on:** —

## Bhuvan proxy

### Deploy `workers/bhuvan-proxy/` via Wrangler
**Priority:** P3
**What:** `wrangler login`, `wrangler secret put TOKEN_SECRET`, `wrangler secret put ALLOWED_ORIGIN`, `wrangler deploy`. Then set `VITE_BHUVAN_PROXY_URL` at build time.
**Why:** Until the worker is deployed, the TileSourceChain stops at OSM (no third fallback). Bhuvan stays a planned-but-inert tier.
**Context:** `workers/bhuvan-proxy/README.md` has the deploy + smoke-test recipe.
**Depends on:** Cloudflare account access.

## v3.4 deferred (from Wave C cuts)

### P4 — Split-screen vertical reels
**Priority:** P3
**What:** A new Reels variant that stacks two ReelPlayers as two 9:8 panels in a 9:16 frame, sharing progress. Useful for journey-vs-journey playback as a reel-format share.
**Why:** v3.4 ships journey compare on a wide Atlas map; this is its mobile/reels counterpart.
**Context:** Needs a `?surface=split` route taking two memory IDs. Reel rendering already encapsulated in ReelPlayer.

### Animated GIF export
**Priority:** P3
**What:** Add GIF format to exportRouter. Use gif.js (~30KB gzipped) or omggif. Render frames same as MP4, encode to palette-quantized GIF.
**Why:** WhatsApp + group chat default. MP4 doesn't auto-play in many chat clients; GIF does.
**Context:** `exportRouter.js validateFormat` already rejects "gif" — flip when implemented.

## Reels v3.1 (deferred from v3.0 plan)

### Memory composer surface
**Priority:** P2
**What:** UGC composer for "make your own memory reel" — A→B picker, GPX/Strava import, photo-drop, narration.
**Context:** Whole v3.1 roadmap. See `~/.gstack/projects/mathconcepts-yatra/root-main-v3-0-plan-20260512-144026.md` for the original split.

### WebCodecs + mp4-muxer render export
**Priority:** P2
**What:** Vertical 9:16 MP4 export from the browser. Reviewer correction locked WebCodecs + mp4-muxer as the path; canvas-record-stream rejected.

### AI scaffold with Nominatim verification
**Priority:** P2
**What:** "I went to Manali for a week" → LLM proposes 4–8-point reel scaffold; every place name verified against Nominatim/Photon before showing.

## Completed

### v3.0 Memory Reels Feed-First
**Completed:** v1.1.0 (2026-05-12)
- Slice 0.5 — Vitest bootstrap
- Slice 1 — SurfaceRouter + schema mode/cameraPlan
- Slice 2 — ReelPlayer + ReelFeed
- Slice 3 — MoodCameraEngine (terrain + rail) + ref-rAF interpolator
- Slice 4 — AutoCameraPill + manual override + 5 s auto-resume + haptic
- Slice 5 — TileSourceChain + Bhuvan proxy Worker scaffold
- Slice 6a — Srirangam, Yadagiri, Konkan journey configs (with rail-feature landmarks)
- Slice 6c — Postcard polish pipeline + eval + manifest CI verifier
- Slice 7 — Polished-text runtime fallback + reduced-motion + scrim
- Slice 8 — Perf probe (terrain auto-disable < 24 fps) + mobile terrain clamp
