# Bhuvan tile proxy (Cloudflare Worker)

CORS-bridging proxy for ISRO Bhuvan WMS tiles. Backs the v3.0
`TileSourceChain` fallback when ESRI and OSM both fail.

## Why

Bhuvan (`bhuvan-vec2.nrsc.gov.in`) doesn't send CORS headers, so MapLibre
running in the browser can't fetch its tiles directly. Bhuvan also has a
habit of returning **HTML error pages with HTTP 200** during outages,
which look fine to a naive fetch but are gibberish to a tile renderer.
This Worker proxies tile requests, validates `content-type` starts with
`image/`, and adds the right CORS headers.

## Endpoints

| Path | Purpose |
|---|---|
| `GET /token` | Mint a 60 s HMAC-signed token. Client attaches it via MapLibre's `transformRequest`. |
| `GET /tile/:z/:x/:y.png?t=<token>` | Fetch a Bhuvan tile, validate, return image bytes (or 502 + 60 s cache on failure). |

The token round-trip avoids putting a static API key in the client and
keeps the per-tile request flow compatible with MapLibre (a per-tile
Turnstile challenge would break it — see reviewer correction #4 in the
v3.0 plan).

## Deploy

```bash
npm install -g wrangler
cd workers/bhuvan-proxy
wrangler login
wrangler secret put TOKEN_SECRET          # 32+ random bytes, base64
wrangler secret put ALLOWED_ORIGIN        # e.g. https://yatra.example.com
# (optional) override upstream WMS endpoint:
wrangler secret put BHUVAN_BASE
wrangler deploy
```

Note the deployed URL (e.g. `https://yatra-bhuvan-proxy.example.workers.dev`)
and set it on the client at build time:

```bash
VITE_BHUVAN_PROXY_URL=https://yatra-bhuvan-proxy.example.workers.dev npm run build
```

## Client wiring

Done in `src/services/basemapStyles.js` (`tilesForSource("bhuvan-proxy")`) and
consumed by `src/services/tileSourceChain.js`. When the Worker is unreachable
or the env var is unset, the chain skips Bhuvan and stops at OSM.

## Cost

Tile fetches are cached by Cloudflare for 24 h client-side and 86,400 s
server-side. A typical user session is < 100 unique tiles, well within
Cloudflare's free-tier 100k requests/day.

## Smoke test

After deploy:

```bash
curl -i https://your-worker.workers.dev/token
# expect 200, JSON { token, expiresAt }

TOKEN=$(curl -s https://your-worker.workers.dev/token | jq -r .token)
curl -i "https://your-worker.workers.dev/tile/5/22/14.png?t=$TOKEN"
# expect 200 + content-type: image/png  (or 502 if Bhuvan is down)
```
