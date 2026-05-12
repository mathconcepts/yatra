/**
 * Bhuvan tile proxy — Cloudflare Worker.
 *
 * Bhuvan (https://bhuvan-vec2.nrsc.gov.in) doesn't return CORS headers
 * for browser fetches. This Worker proxies tile requests, validates that
 * the upstream returned an actual image (not the all-too-common
 * HTML-error-with-200 page), and adds the right CORS headers so MapLibre
 * can consume them.
 *
 * The plan's reviewer correction #4: NO Turnstile-per-tile (that breaks
 * MapLibre's `<source tiles:...>` flow). Instead we mint a short-lived
 * HMAC-signed token via a separate endpoint and the client attaches it
 * to every tile via MapLibre's `transformRequest`. The Worker checks
 * the token signature + expiry before forwarding to Bhuvan.
 *
 * Endpoints:
 *   GET  /token                     — mint a fresh token (60s ttl)
 *   GET  /tile/:z/:x/:y.png?t=...   — fetch a tile, validate, CORS-add
 *
 * Environment bindings (set via `wrangler secret put`):
 *   TOKEN_SECRET     HMAC secret for signing
 *   BHUVAN_BASE      Upstream base URL (default: bhuvan-vec2.nrsc.gov.in/...)
 *   ALLOWED_ORIGIN   Comma-separated list of origins allowed to call /token
 */

export interface Env {
  TOKEN_SECRET: string;
  BHUVAN_BASE?: string;
  ALLOWED_ORIGIN?: string;
}

const TOKEN_TTL_MS = 60_000;
const UPSTREAM_DEFAULT = "https://bhuvan-vec2.nrsc.gov.in/bhuvan/wms";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return cors(new Response(null, { status: 204 }), env);
    }

    if (url.pathname === "/token") {
      return cors(await mintToken(env), env);
    }

    if (url.pathname.startsWith("/tile/")) {
      return cors(await proxyTile(url, env), env);
    }

    return cors(new Response("Not found", { status: 404 }), env);
  },
};

async function mintToken(env: Env): Promise<Response> {
  if (!env.TOKEN_SECRET) {
    return new Response("TOKEN_SECRET not configured", { status: 500 });
  }
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const sig = await hmacSign(env.TOKEN_SECRET, String(expiresAt));
  return new Response(JSON.stringify({ token: `${expiresAt}.${sig}`, expiresAt }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function proxyTile(url: URL, env: Env): Promise<Response> {
  if (!env.TOKEN_SECRET) {
    return new Response("TOKEN_SECRET not configured", { status: 500 });
  }
  const token = url.searchParams.get("t") || "";
  if (!(await verifyToken(env.TOKEN_SECRET, token))) {
    return new Response("Forbidden", { status: 403 });
  }

  // Parse /tile/:z/:x/:y.png
  const m = /^\/tile\/(\d+)\/(\d+)\/(\d+)\.(png|jpg|jpeg)$/.exec(url.pathname);
  if (!m) return new Response("Bad request", { status: 400 });
  const [, z, x, y] = m;

  // Forward upstream. BHUVAN_BASE is configurable so deployers can
  // point at the right WMS endpoint per environment.
  const base = env.BHUVAN_BASE || UPSTREAM_DEFAULT;
  const upstreamUrl = `${base}?service=WMS&request=GetMap&layers=bhuvan_lulc&styles=&format=image/png&transparent=false&version=1.1.1&srs=EPSG%3A3857&bbox=${tileBbox(+z, +x, +y)}&width=256&height=256`;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      cf: { cacheTtl: 86400, cacheEverything: true },
    } as RequestInit);
  } catch {
    return new Response("Upstream unreachable", { status: 502 });
  }

  // Bhuvan returns HTML-with-200 on errors. Validate the content-type.
  const ct = upstream.headers.get("content-type") || "";
  if (!/^image\//i.test(ct)) {
    // Cache the error for 60 s so we don't hammer Bhuvan during an outage.
    return new Response("Upstream returned non-image", {
      status: 502,
      headers: { "cache-control": "public, max-age=60" },
    });
  }

  // Pass the image through, override cache-control for client-side caching.
  const headers = new Headers(upstream.headers);
  headers.set("cache-control", "public, max-age=86400, immutable");
  return new Response(upstream.body, { status: upstream.status, headers });
}

function tileBbox(z: number, x: number, y: number): string {
  // EPSG:3857 tile bounds — XYZ scheme
  const n = 2 ** z;
  const lonMin = (x / n) * 360 - 180;
  const lonMax = ((x + 1) / n) * 360 - 180;
  const yToLat = (yy: number) => {
    const a = Math.PI - (2 * Math.PI * yy) / n;
    return (180 / Math.PI) * Math.atan(Math.sinh(a));
  };
  const latMax = yToLat(y);
  const latMin = yToLat(y + 1);
  // Project to mercator metres
  const project = (lon: number, lat: number) => {
    const x = (lon * 20037508.34) / 180;
    const y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
    return [x, (y * 20037508.34) / 180];
  };
  const [xMin, yMin] = project(lonMin, latMin);
  const [xMax, yMax] = project(lonMax, latMax);
  return `${xMin},${yMin},${xMax},${yMax}`;
}

async function hmacSign(secret: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyToken(secret: string, token: string): Promise<boolean> {
  const dot = token.indexOf(".");
  if (dot < 0) return false;
  const expiresAtStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = await hmacSign(secret, expiresAtStr);
  return timingSafeEqual(sig, expected);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function cors(res: Response, env: Env): Response {
  const headers = new Headers(res.headers);
  const allow = env.ALLOWED_ORIGIN || "*";
  headers.set("access-control-allow-origin", allow);
  headers.set("access-control-allow-methods", "GET, OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  headers.set("access-control-max-age", "86400");
  return new Response(res.body, { status: res.status, headers });
}
