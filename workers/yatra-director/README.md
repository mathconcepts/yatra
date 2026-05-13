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
4. `wrangler secret put TURNSTILE_SECRET_KEY`, `ANTHROPIC_API_KEY`, and `GOOGLE_TTS_API_KEY`. (For TTS: enable the Cloud Text-to-Speech API on a GCP project, create an API key restricted to that single API. Free tier covers 1M chars/month per voice family.)
5. `npm run dev` — local Worker on `http://localhost:8787`.
6. In the Vite client, set `.env.local`:
   ```
   VITE_DIRECTOR_WORKER_URL=http://localhost:8787
   VITE_DIRECTOR_MOCK=0
   ```
   Or keep `VITE_DIRECTOR_MOCK=1` to bypass the Worker entirely and use
   the canned fixture at `src/fixtures/directorScript.yadagiri.devotional.te.json`.

## Status

v1.6.9 wires real upstream APIs:
- **`/v1/script`** — calls Anthropic Claude Haiku 4.5 when `ANTHROPIC_API_KEY` is set; otherwise returns a stub one-scene placeholder so the network shape works without the key.
- **`/v1/tts`** — calls Google Cloud Text-to-Speech when `GOOGLE_TTS_API_KEY` is set; otherwise returns 503 `tts-not-configured`. Google's free tier (1M chars/month per voice family) covers a side project end to end.

Auto-decided security controls (Turnstile, rate-limit, kill switch, R2 idempotency cache) still exist as TODO markers in `src/index.js`. See `SECURITY.md` for the deploy gate.

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
