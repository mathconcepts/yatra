# Director Personalization — Tiers 2 and 3

Generated 2026-05-13, alongside the Tier 1 shipping commit.

Tier 1 (personalized script via free-form prompt + AI-suggested default +
localStorage memory) shipped in this commit. This doc captures the design
for Tier 2 (chaptered video, multi-language, multi-clip export) and Tier 3
(split-screen rendering, voice cloning) so a future weekend can pick any
slice off the shelf without re-deriving the architecture.

Status: DRAFT. Not yet implemented. Each section is sized for one focused
session.

---

## Tier 2a — Multi-language export in one run

**User intent:** one click renders Telugu + Hindi + English MP4s
back-to-back without the user re-picking each time.

**Effort:** ~half day.

**Design.**

1. Add a `languages: string[]` field to `runDirectorPipeline` (defaults to
   `[language]` for backward compat). Replaces the single `language`
   field; UI passes either one or many.
2. New surface element in `DirectorView`: a chip group "Also generate
   in:" shown after the primary language pick. Each chip is the language
   icon; toggling adds to the multi-render set.
3. Pipeline loop: for each language, run script → TTS → mix → encode.
   Frames are rendered ONCE (no map cost per language); only audio +
   captions vary. This is the key efficiency move: the heavy WebGL frame
   pass costs the same whether you produce 1 or 4 reels.
4. Result shape: `{ artifacts: [{ language, mp4Url, postcardUrl }] }`.
   DirectorView renders a horizontal strip of preview thumbnails, one
   per language.
5. Cost: Claude script is ~$0.001/call, Google TTS is ~$0.01/call (or
   $0 within free tier). Four languages = ~$0.04/render total.
6. Cache key: extend `idempotencyCache.js` so each language gets its own
   cache slot (the route+tone hash is the same; only language varies).

**Open questions for implementation day:**
- UX for the "render in progress" state when N languages are queued: a
  vertical progress list, or a single bar with the active language
  highlighted?
- Should the user be able to mid-render cancel just one language without
  killing the whole set? Probably yes — the abort signal needs to be
  per-language not global.

**Tests:** pure helper that splits a single-language pipeline into N;
integration test that mocks generate + synthesize and confirms 4 outputs
share the same frame plan.

---

## Tier 2b — Chaptered video with visible scene cuts

**User intent:** the reel today blends scenes smoothly; user wants hard
cuts so each peak moment feels like a deliberate shot, not a pan.

**Effort:** ~1 day.

**Design.**

1. `sceneComposer.js` already has `findActiveScene` and
   `progressInScene`. Today the frame pass interpolates camera between
   scenes (`reelRenderer.js`). For chaptered mode, suppress interpolation
   at scene boundaries: snap camera to the new scene's start frame.
2. Add a `transitionStyle: "blend" | "cut" | "fade"` field to the tone
   palette. `cut` is the new default for explorer + historical; `blend`
   stays default for devotional + poetic.
3. Add a 4-frame fade-to-black between cut scenes (~133ms at 30 fps).
   This is the cinematic "shot transition" feel.
4. Caption burn-in: today captions cross-fade in/out across scene
   boundaries. In `cut` mode they should snap with the cut (zero
   overlap) so each chapter has its own caption that lives and dies
   inside the chapter.

**Open questions:**
- Should chapter cuts get an audio dip too (200ms dip on the music bed
  so cuts feel "respected")? Yes per intuition; needs a small mixer
  addition.

**Tests:** pure transition planner that returns the frame indices where
cuts happen; visual regression is hard in jsdom — defer to manual QA.

---

## Tier 2c — Multi-clip export (each scene as its own MP4)

**User intent:** instead of one 30s reel, get N short clips (one per
scene, ~5s each) so the user can rearrange in Instagram Stories or
WhatsApp.

**Effort:** ~1 day.

**Design.**

1. `runDirectorPipeline` gains an `outputMode: "single" | "perScene"`
   field. `perScene` runs the encoder N times, slicing the frame buffer
   per scene.
2. The frame buffer is already segmented by scene timing via
   `scenesToAudioTiming`. Slicing is `frames.slice(startFrame, endFrame)`.
   Audio gets sliced via `AudioBuffer.copyFromChannel` into a
   per-scene buffer.
3. UI: a toggle "Export as: one reel | clips per scene" below the CTA.
   Per-scene shows a strip of N download buttons.
4. Postcard frame: only generated once (from the first scene), shared
   across all clips.

**Open question:** clip naming. `yatra-yadagiri-scene-01.mp4`? Include
the scene id? Include language? Probably `yatra-{routeId}-{language}-{sceneId}.mp4`.

**Tests:** pure scene-to-frame-range helper; encoder is mocked.

---

## Tier 3a — Split-screen rendering

**User intent:** dry-season vs monsoon Tirumala stacked into one 9:16
reel, with one narration spanning both halves. Like the Compare surface
but rendered into one MP4.

**Effort:** ~3 days. The most architecturally invasive of all the
personalization tiers.

**Design.**

1. New service: `splitScreenComposer.js`. Takes two `routes` (or two
   basemap palettes of the same route) and a `splitMode: "horizontal" |
   "vertical" | "diagonal"`.
2. Frame pass: render TWO frames per timestep, composite into one
   9:16 frame via canvas `drawImage` with the chosen split geometry.
   Costs ~2x the WebGL time of single-route — the audio + script + mux
   pass stays the same.
3. `reelRenderer.js` needs a new mode `splitScreen`. The renderer
   today binds one MapLibre instance; for split it needs two. Each map
   instance is heavy (~80MB GPU memory); render them in series, not
   parallel, to stay within mobile memory budgets.
4. Narration: one script spans both. The system prompt needs a new
   section: "When two routes/seasons are provided, narrate the
   *contrast* — what is preserved across them, what is changed."
5. UI: a "Compare in Director" button on the Compare surface that
   routes its current pair into Director with a `splitMode` preset.

**Open questions:**
- Memory: a Pixel 6a-class device has ~4GB total. Two MapLibre instances
  + frame buffer + encoder could OOM. Need to add a memory budget check
  and fall back to single-screen with a clear error.
- Audio: does the split-screen reel get two ambient layers (one per
  route's landmarks) or one? Probably one (the dominant route's), or
  the music bed only.

**Tests:** the composer pure function (frame-blend math); the rest is
integration.

---

## Tier 3b — Voice cloning via ElevenLabs

**User intent:** user records 30s of their own voice; the Telugu / Hindi
/ Tamil narration is generated in their voice.

**Effort:** ~2 days. Requires paid ElevenLabs plan (~$22/mo) and a new
Worker route.

**Design.**

1. New Worker route: `POST /v1/voice-clone`. Body is the 30s recording
   (audio/webm, ~200KB). The Worker forwards to ElevenLabs
   `/v1/voices/add` and returns the `voice_id`.
2. Voice IDs are stored in localStorage under
   `yatra.director.clonedVoiceId.<language>`. One voice per language
   because ElevenLabs voice clones are trained per language.
3. New route: `POST /v1/tts?voiceId=...` already accepts a voiceId. The
   Worker switches provider based on voiceId prefix: Google for builtins
   (`te-IN-Wavenet-A`), ElevenLabs for clones (`el_xxx`).
4. UI: a "Use my voice" button on the language chips. Tapping triggers
   the in-browser recorder (existing `audioEncode.js` has the recorder
   primitives). After 30s, posts to `/v1/voice-clone`, stores the id,
   sets the language's TTS to use the clone.
5. Religious safety unchanged: the script generation isn't affected.
   Voice cloning is a pure TTS layer swap.

**Cost reality:**
- ElevenLabs starter ($5/mo): 30k chars/mo, 10 voice clones. ~10
  multilingual renders.
- ElevenLabs creator ($22/mo): 100k chars/mo, 30 voice clones. Enough
  for monthly side-project pace.
- Voice clone training: free per clone, one-time.
- Per-clone-render: ~$0.30 per multilingual reel (4 languages × ~600
  chars × ElevenLabs rate). 10x Google.

**Open questions:**
- Cloned voice quality in Telugu / Tamil is the entire moat. ElevenLabs
  trained voices in Indic scripts are good in English-flavor; pure
  Devanagari/Telugu/Tamil quality is uneven. **Validate first with $5
  before building the UI.** Record 30s in Telugu, clone it, generate a
  test narration. If a relative cringes, the feature is dead.
- Consent model: in-app text "your voice will be sent to ElevenLabs and
  stored on their servers; you can delete the clone at any time" plus a
  link to the delete action.
- Voice clone deletion: a "Forget my voice" button in settings calls
  `DELETE /v1/voices/{id}`. Required for GDPR-style consent.

**Tests:** Worker route schema + mocking ElevenLabs SDK; the in-browser
recorder is hard to unit-test, defer to manual.

---

## Implementation order recommendation

If you have one weekend, pick **Tier 2a (multi-language)**. Highest
delight-per-effort: one click → 4 reels, near-zero added cost (free tier
absorbs it), and the WhatsApp moment becomes "send the one in their
language" rather than "send English."

Tier 2b (chaptered) is taste-driven and low-risk; defer until you've
seen what tone palette your audience actually likes.

Tier 2c (multi-clip) is a Stories-specific feature; defer until Yatra
has a Stories audience.

Tier 3a (split-screen) is the most cinematic but the biggest engineering
lift. Worth it only after Tier 1+2a have proven the audience wants more.

Tier 3b (voice cloning) is the one that genuinely changes what Yatra
*is*. But it requires the $22/mo plan and a quality validation before
any code is worth writing. **The first $5 you spend should be on a Telugu
voice clone, not on code.**
