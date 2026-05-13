# yatra-director — Security & Cost

> **Status at v1.6.11:** All five auto-decided Worker controls are wired and active: kill switch, Turnstile, per-IP rate limit (Durable Object, 10/min · 60/hr · 200/day), daily-budget guard, idempotency cache. Each gate degrades cleanly when its binding/secret is absent, so a key-less local dev environment still works; production deploys MUST provision the full set per the checklist below.


The Worker holds three classes of paid API keys (Anthropic, ElevenLabs, OpenAI).
A public share URL exposes the Worker URL to anyone who opens the network
panel. Without the controls below, a single scraper loop can drain the
billing account. This doc is the enforcement checklist.

## Pre-deploy checklist

Do not deploy to a public URL until every item is `[x]`.

- [ ] `wrangler secret put TURNSTILE_SECRET_KEY` provisioned
- [x] Turnstile siteverify enforced in `/v1/script` and `/v1/tts` (wired in `src/index.js`; activates once `TURNSTILE_SECRET_KEY` is provisioned, otherwise bypassed for keyless local dev)
- [ ] `wrangler secret put ANTHROPIC_API_KEY` provisioned
- [ ] `wrangler secret put GOOGLE_TTS_API_KEY` provisioned (restricted to Cloud Text-to-Speech API on the GCP project)
- [ ] CORS allowlist contains only known origins (no `*`, no `null`)
- [x] Durable Object `RateLimiter` bound (v1.6.11; defaults to 10/min, 60/hr, 200/day; needs the `[[migrations]] new_classes = ["RateLimiter"]` line in `wrangler.toml` on first deploy)
- [ ] KV `BUDGET_KV` bound, daily-spend counter implemented for BOTH Anthropic and Google
- [ ] `DIRECTOR_KILLSWITCH=0` set as a `[vars]` entry, runbook for flipping it to `1` documented
- [ ] R2 `SCRIPT_CACHE` and `TTS_CACHE` bound, idempotency cache on by hash(route + tone + language) and hash(text + voiceId + tempo) respectively
- [ ] Request logging redacts secrets (only `requestId`, never request body)
- [ ] Cloudflare billing email alerts at $5, $25, $50/day
- [ ] GCP billing alert at $5/month (Cloud TTS free tier is generous but bugs happen)

## Rotation cadence

Quarterly minimum, immediately on any leak signal.

```bash
# 1. Generate a new key at the provider dashboard.
# 2. Put it under the SAME secret name (Cloudflare keeps the prior version).
cd workers/yatra-director
wrangler secret put ANTHROPIC_API_KEY  # paste new key

# 3. Deploy.
wrangler deploy

# 4. Verify production: tail logs for the next 5 minutes, confirm 200s.
wrangler tail

# 5. Revoke the OLD key at the provider dashboard.
```

## Leak playbook

If a key appears in a log, a screenshot, a public PR, a forum post, or
unexpected billing activity:

1. **Revoke at provider FIRST.** Anthropic dashboard → Settings → API Keys
   → Revoke. ElevenLabs profile → API → Revoke. OpenAI organization → API
   Keys → Revoke. This stops bleeding even before rotation.
2. **Rotate** the secret in the Worker (steps above).
3. **Check billing** at all three providers for the last 30 days; export
   the line items. File a fraud-investigation request if usage is
   anomalous.
4. **Audit logs** in Cloudflare for the leaked window. `wrangler tail`
   does not retain history; only the live Cloudflare dashboard does, and
   only briefly. Run a Logpush job to R2 going forward.
5. **Post-mortem.** Add a regression test that fails if the leaked
   pattern reappears in a logged response body.

## Cost ceiling

Realistic per-render cost using the v1.6.9 backend choices (Google
Cloud TTS instead of ElevenLabs):

| Component | ~chars / call | unit cost | per-render |
|----------:|--------------:|----------:|-----------:|
| Claude Haiku (script) | ~1500 in / 800 out | ~$0.001 in / $0.005 out / 1M | ~$0.001 |
| Google TTS Wavenet (per language) | ~600 | $16 / 1M chars (Wavenet) — free below 1M chars/month | ~$0.0096 paid; $0 within free tier |
| Google TTS × 4 languages | — | — | ~$0.04 paid; $0 within free tier |
| Music bed | 0 | static asset | $0 |
| **Total / multilingual render** | | | **~$0.04 (or $0 within free tier)** |

The free-tier monthly allowance is 1M chars Standard + 1M chars Wavenet
+ 1M chars Neural2 per voice family. A side project shipping ~5 reels
a day with 4 languages stays well inside free tier; a viral share that
hits 10k times would burn through the month's allowance and trip into
paid territory at ~$400/month worst case — vastly better than the
ElevenLabs ~$7,200 figure that the autoplan flagged.

Without idempotency cache, that worst case is still real.

With idempotency (cache by `hash(route + tone + language + scriptText)`)
+ per-IP rate-limit + daily ceiling, a viral share is bounded to the cap.
The defaults below are the auto-decided baseline; tune later.

| Layer | Cap |
|-------|-----|
| Per IP | 10/min, 60/hr, 200/day |
| Worker daily $ ceiling (KV counter) | $5/day (raise after instrumented) |
| Hard kill switch | env `DIRECTOR_KILLSWITCH=1` returns 503 to all routes |

## Log redaction

`console.log` from inside the Worker streams to `wrangler tail` AND can
end up in Cloudflare Logpush. NEVER log:

- raw API responses (may echo prompts that contain user-uploaded photo paths or filenames)
- request bodies (may contain GPX coords if we ever accept upload)
- any header containing `key`, `token`, `secret`, `authorization`

DO log:

- `requestId` (the UUID we generate)
- route taken (`/v1/script` etc.)
- status code returned
- whether cache was hit/miss
- error slug (never the full error chain)
