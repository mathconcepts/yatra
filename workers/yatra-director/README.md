# yatra-director

Cloudflare Worker that proxies paid APIs (Anthropic Claude for script
generation; ElevenLabs/OpenAI for TTS) for Yatra's AI Cinematographer.

This directory is **not** part of the Vite build. It deploys independently
via `wrangler`. The React client talks to this Worker via the URL in
`VITE_DIRECTOR_WORKER_URL`.

## Start here

1. Read `API.md` — the request/response contract.
2. Read `SECURITY.md` — what must be true before deploying.
3. `npm install`, copy `wrangler.toml.example` to `wrangler.toml`, fill account id.
4. `wrangler secret put TURNSTILE_SECRET_KEY` and `ANTHROPIC_API_KEY`.
5. `npm run dev` — local Worker on `http://localhost:8787`.
6. In the Vite client, set `.env.local`:
   ```
   VITE_DIRECTOR_WORKER_URL=http://localhost:8787
   VITE_DIRECTOR_MOCK=0
   ```
   Or keep `VITE_DIRECTOR_MOCK=1` to bypass the Worker entirely and use
   the canned fixture at `src/fixtures/directorScript.yadagiri.devotional.te.json`.

## Status

Currently a **stub**. `/v1/script` echoes a one-scene placeholder. No
upstream API calls happen yet. Auto-decided security controls
(Turnstile, rate-limit, kill switch, R2 idempotency cache) exist as TODO
markers in `src/index.js` — see `SECURITY.md` for the enforcement
checklist that gates first deploy.

## Pipeline (where this fits)

```
DirectorView.jsx
   └─ directorScript.generateScript() ──► (this Worker) /v1/script ──► Claude Haiku
   └─ directorTTS.synthesize()       ──► (this Worker) /v1/tts    ──► ElevenLabs / OpenAI
   └─ directorAudio.mix()                                              (OfflineAudioContext in browser)
   └─ reelRenderer.captureFrame() + colorGrade()                       (browser canvas)
   └─ captionBurnIn(frame, scenes, palette)                            (browser canvas)
   └─ mp4Export.encodeMp4(frames, audio)                               (WebCodecs in browser)
```

The Worker owns ONLY the parts that touch paid APIs or hold secrets.
Everything else stays client-side; that's why this directory is small
and the React app is where the magic compounds.
