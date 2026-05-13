# Director (AI Cinematographer) — pipeline

Single-file pipeline overview. A year from now, **start here** when you
return to this code.

```
?surface=director  →  DirectorView.jsx
                        ├─ tonePalettes/                  (taste lives here)
                        │   ├─ schema.js                  (validator; loud-fails on missing field)
                        │   ├─ devotional.js              (concrete: saffron #8a4528, Tiro/Mandali/Catamaran, slow fade 800ms)
                        │   ├─ explorer.js                (stub inheriting devotional shape)
                        │   ├─ poetic.js                  (stub)
                        │   └─ historical.js              (stub)
                        ├─ directorScript.generateScript({config, tone, language})
                        │   ├─ MOCK_MODE  → fixtures/directorScript.*.json
                        │   └─ live       → POST /v1/script  → workers/yatra-director/
                        ├─ directorTTS.synthesize(scenes, palette, language)    [planned]
                        │   ├─ MOCK_MODE  → window.speechSynthesis
                        │   └─ live       → POST /v1/tts     → workers/yatra-director/
                        ├─ directorAudio.mix(narration, palette)               [planned]
                        │   └─ OfflineAudioContext: narration + music bed + ambient
                        │      gated by landmarkProximityFactor (moodCamera.js)
                        ├─ reelRenderer.captureFrame(t, config)                (existing)
                        │   └─ + colorGrade(canvas, palette.color.lut)         [planned, per-frame canvas pass]
                        ├─ captionBurnIn(frame, scene, palette)                [planned]
                        │   └─ per-line burned-in captions (Instagram mutes by default)
                        └─ mp4Export.encodeMp4(frames, audio)                  (existing)
                            └─ first frame = postcard cover from exportPostcard()  [planned]
```

## Where things are

| Concern | File |
|--|--|
| Surface entry | `src/components/director/DirectorView.jsx` |
| Tone palettes | `src/services/tonePalettes/` |
| Script generator | `src/services/directorScript.js` |
| Worker contract | `workers/yatra-director/API.md` |
| Worker security model | `workers/yatra-director/SECURITY.md` |
| Shared schemas | `workers/yatra-director/schemas.js` |
| Mock fixtures | `src/fixtures/directorScript.*.json` |
| Design doc (history) | `~/.gstack/projects/mathconcepts-yatra/*-design-*.md` |

## What's done (v0 scaffold)

- Tone palette schema + validator + concrete Devotional palette
- Director surface with tone / route / language picker
- `directorScript` service with mock mode + Yadagiri Telugu Devotional fixture
- Worker stub: `/v1/script` echo, CORS allowlist, RFC-7807 errors
- Worker contract (`API.md`) and security checklist (`SECURITY.md`)

## What's next (per design doc Step 2+)

1. Worker: enforce Turnstile, rate-limit DO, R2 idempotency cache, daily $ ceiling, kill switch
2. Worker: real Claude Haiku call with `prompts/devotional.md` hot-reloadable
3. `/v1/tts` (ElevenLabs Telugu, then English/Hindi/Tamil)
4. `directorAudio.js` with OfflineAudioContext mixing
5. `colorGrade.js` per-frame canvas LUT pass in `reelRenderer.js` `captureFrame`
6. `captionBurnIn.js` integrated into the same compositor
7. `exportPostcard()` extending `exportRouter.js` with the tone ornament + Indic title
8. MP4 mux end-to-end → success criterion: 30s Yadagiri Telugu reel forwarded on WhatsApp
