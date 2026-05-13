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

## Provisioning Google TTS (free tier covers a side project)

Google Cloud Text-to-Speech ships 1M characters/month free per voice
family (Standard, Wavenet, Neural2). A typical Director reel is ~600
characters per language, so a multilingual render burns ~2400 chars.
You can ship ~400 multilingual reels a month on the free tier.

1. Open https://console.cloud.google.com/ and create (or reuse) a project.
   Note the project id.
2. Enable the Cloud Text-to-Speech API for that project:
   https://console.cloud.google.com/apis/library/texttospeech.googleapis.com
3. Set up a billing account on the project (required even for free-tier
   usage — Google needs a card on file, but doesn't charge below 1M chars/mo).
   Add an email alert at $5/mo as a safety net.
4. Create an API key restricted to this single API:
   - APIs & Services → Credentials → Create credentials → API key
   - On the new key, click "Edit API key"
   - Under "API restrictions" pick **Restrict key** → select only
     **Cloud Text-to-Speech API**
   - Save. Copy the key.
5. Provision the key as a Worker secret:
   ```bash
   cd workers/yatra-director
   wrangler secret put GOOGLE_TTS_API_KEY
   # Paste the key when prompted.
   ```
6. Restart your local dev server (`npm run dev` in this directory).
   The `/v1/tts` route now talks to Google. Without the key it returns
   `503 tts-not-configured` — that's expected, not a bug.

Front-end wiring (in repo root):

```bash
# .env.local (repo root, NOT in workers/)
VITE_DIRECTOR_WORKER_URL=http://localhost:8787
VITE_DIRECTOR_MOCK=0
```

With `VITE_DIRECTOR_MOCK=0` the client hits the Worker for both /v1/script
and /v1/tts. With `=1` it bypasses the Worker entirely (canned fixture
+ silent audio) — the fast-feedback dev mode that requires no keys.

### Rotation

```bash
# In the GCP console, create a new key (don't revoke the old one yet).
cd workers/yatra-director
wrangler secret put GOOGLE_TTS_API_KEY  # paste new key
wrangler deploy
wrangler tail  # watch for 5 min to confirm 200s
# Then revoke the OLD key in GCP.
```

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
