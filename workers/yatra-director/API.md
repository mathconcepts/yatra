# yatra-director Worker — API v1

Public surface for the AI Cinematographer. The React client at
`src/services/directorScript.js` (and forthcoming `directorTTS.js`,
`directorMusic.js`) is the only intended caller. Every route is versioned
under `/v1/`; breaking changes ship at `/v2/`.

This document is the contract. Both client and Worker import their request
and response shapes from `workers/yatra-director/schemas.js` so they
cannot drift.

---

## Conventions

- **Transport:** HTTPS, JSON request and response. `Content-Type: application/json`.
- **Auth:** every mutating request requires a Cloudflare Turnstile token
  in `X-Yatra-Turnstile`. The Worker verifies via Turnstile siteverify
  before doing any expensive work.
- **Origin:** the Worker allows a strict CORS allowlist (`yatra` prod
  domains plus `localhost:5173` and `localhost:8787` for dev). All others
  are rejected with `403`.
- **Idempotency:** the Worker computes `cacheKey = sha256(route + tone + language + scriptText)`
  and looks up R2 before any upstream call. A repeat request returns the
  cached payload with `X-Yatra-Cache: hit`.
- **Rate limiting:** per-IP via a Durable Object — 10 requests/minute,
  60/hour, 200/day. Soft headers (`X-RateLimit-Remaining`) on every response.
- **Budget kill switch:** a KV key `daily-spend:<YYYY-MM-DD>` is
  decremented on every paid upstream call. When it crosses zero the Worker
  returns `503` with the killswitch error code below. An env var
  `DIRECTOR_KILLSWITCH=1` lets the operator hard-kill all spend instantly.
- **Errors:** RFC-7807-style problem documents:
  ```json
  {
    "type": "https://yatra/errors/<slug>",
    "title": "Short human title",
    "status": 400,
    "detail": "What went wrong, in one sentence.",
    "cause": "Why it went wrong, if we know.",
    "fix": "What the caller should do next.",
    "requestId": "01HFQX…"
  }
  ```

---

## `POST /v1/script`

Generate a directed scene list for a route + tone + language.

### Request body

```json
{
  "routeId": "yadagiri-gutta",
  "routeTitle": "Yadagiri Gutta",
  "tone": "devotional",
  "language": "te",
  "peakMoments": [
    { "t": 0.0, "kind": "origin", "label": "Steps base" },
    { "t": 0.42, "kind": "landmark", "label": "Mandapam" },
    { "t": 1.0, "kind": "destination", "label": "Summit" }
  ],
  "landmarks": [
    { "name": "Steps base", "facts": ["Trail starts here"], "lat": 17.59, "lon": 78.94 }
  ],
  "distanceKm": 4.2,
  "elevationGainM": 160,
  "waypointCount": 142,
  "personalContext": "A return to the hill my grandmother walked."
}
```

`tone` MUST be one of: `devotional | explorer | poetic | historical`.
`language` MUST be one of: `en | hi | te | ta`.
`peakMoments` must contain 1–8 entries with `t ∈ [0, 1]`.
`personalContext` is optional. ≤ 500 chars. The model weaves the note into
the narration as the pilgrim's lived experience and is instructed to never
extrapolate beyond what the note states. Empty / absent → unpersonalized.

### Response 200

```json
{
  "routeId": "yadagiri-gutta",
  "tone": "devotional",
  "language": "te",
  "scenes": [
    {
      "id": "origin",
      "tStart": 0.0,
      "tEnd": 4.5,
      "narration": "ఆరంభం. యాదాద్రి కొండ దిగువన.",
      "captionText": "ఆరంభం · యాదాద్రి దిగువ",
      "captionStyle": "headline"
    }
  ],
  "meta": {
    "scriptModel": "claude-haiku-4-5-20251001",
    "totalDurationS": 30.0,
    "wordCount": 27,
    "generatedAt": "2026-05-13T14:02:11Z"
  }
}
```

### Error codes

| Status | `type` slug | When |
|-------:|-------------|------|
| 400 | `invalid-request` | Schema validation failed |
| 401 | `turnstile-missing` | `X-Yatra-Turnstile` header absent |
| 403 | `turnstile-failed` | Token rejected by siteverify |
| 403 | `origin-denied` | Origin not on allowlist |
| 429 | `rate-limited` | Per-IP cap exceeded |
| 503 | `killswitch` | `DIRECTOR_KILLSWITCH=1` or daily budget exhausted |
| 502 | `upstream-claude` | Anthropic API error |
| 500 | `internal` | Worker bug |

---

## `POST /v1/tts`

Produce a single-scene narration audio buffer. Backed by Google Cloud
Text-to-Speech (free tier 1M chars/month covers a side project end to end).

### Request body

```json
{
  "tone": "devotional",
  "language": "te",
  "voiceId": "te-IN-Standard-A",
  "text": "ఆరంభం. యాదాద్రి కొండ దిగువన.",
  "tempo": 0.92
}
```

`voiceId` is a Google Cloud TTS voice name. The Devotional palette
ships with `te-IN-Standard-A`, `hi-IN-Wavenet-A`, `ta-IN-Wavenet-A`, and
`en-IN-Wavenet-A` baked in. `tempo` is mapped to Google's `speakingRate`
in `[0.25, 4.0]`. `language` is one of `en | hi | te | ta` and is
translated to a locale (`en-IN`, `hi-IN`, `te-IN`, `ta-IN`) before send.

### Response 200

Audio bytes, `Content-Type: audio/mpeg` (MP3 at 24 kHz mono). The client
pipes this through `AudioContext.decodeAudioData` and aligns to the
scene slot via `directorTTS.alignToSceneDuration`.

Headers:
- `X-Yatra-Provider: google-tts` — which backend served the request.

### Error codes

| Status | `type` slug | When |
|-------:|-------------|------|
| 400 | `invalid-request` | Missing/invalid field; unsupported language |
| 503 | `tts-not-configured` | `GOOGLE_TTS_API_KEY` not provisioned on the Worker |
| 401/403 | `upstream-tts` | Google rejected the key (revoked, restrictions, billing not enabled) |
| 429 | `upstream-tts` | Google quota exceeded for the day/minute |
| 504 | `upstream-tts` | Worker-side timeout (12s) hit before Google responded |
| 502 | `upstream-tts` | Other Google failure or response missing `audioContent` |

### Streaming variant (planned)

`POST /v1/tts:stream` for chunked playback. Not implemented yet — short
30-second narrations decode fast enough that the latency win isn't
worth the complexity at this stage.

---

## `GET /v1/music` (planned, not yet implemented)

Returns a signed CDN URL for a tone-appropriate music bed.

### Query

`?tone=devotional&durationS=30`

### Response 200

```json
{
  "url": "https://cdn.yatra/audio/devotional/bed-tanpura-c.opus?sig=…",
  "expiresAt": "2026-05-13T14:32:11Z",
  "loop": true,
  "bedDbfs": -22
}
```

---

## Local development

```bash
cd workers/yatra-director
npm install
cp wrangler.toml.example wrangler.toml   # then fill in your account id
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put TURNSTILE_SECRET_KEY
wrangler secret put GOOGLE_TTS_API_KEY
wrangler dev --local --persist
```

Edit prompts under `prompts/<tone>.md` — they are the human-editable source
of truth. The JS-bundle copy lives in `src/prompts.js` and must be kept
in sync by hand (a future `scripts/sync-prompts.mjs` build step will
read the `.md` files into the exports object automatically).

---

## Security runbook

See `SECURITY.md` for: rotation cadence, leak playbook, log-redaction policy,
and the daily-spend dashboard.
