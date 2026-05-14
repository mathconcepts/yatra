/**
 * BYOK user settings — per-browser key + Worker URL overrides.
 *
 * Stored in localStorage under a single versioned key. Three optional
 * fields:
 *   - anthropicKey: when set, /v1/script bypasses our Worker and the
 *     browser calls api.anthropic.com directly (browser-direct CORS path).
 *   - googleTtsKey: when set, /v1/tts forwards through our Worker but
 *     uses the user's key; Worker skips budget + cache + Turnstile.
 *   - workerUrl: overrides VITE_DIRECTOR_WORKER_URL. Saving a non-default
 *     value requires a type-to-confirm modal (the UI gate, not enforced
 *     here).
 *
 * Pure helpers; safe in private mode (all writes are best-effort).
 */

const STORAGE_KEY = "yatra.settings.byok.v1";

function safeGet() {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function safeSet(value) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, value); } catch { /* ignore */ }
}
function safeRemove() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/**
 * Read BYOK settings. Returns an object with only the recognized fields
 * (anthropicKey, googleTtsKey, workerUrl). Unknown / corrupt / missing
 * → empty object. Never throws.
 */
export function readUserSettings() {
  const raw = safeGet();
  if (!raw) return {};
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return {}; }
  if (!parsed || typeof parsed !== "object") return {};
  const out = {};
  if (typeof parsed.anthropicKey === "string" && parsed.anthropicKey) out.anthropicKey = parsed.anthropicKey;
  if (typeof parsed.googleTtsKey === "string" && parsed.googleTtsKey) out.googleTtsKey = parsed.googleTtsKey;
  if (typeof parsed.workerUrl === "string" && parsed.workerUrl) out.workerUrl = parsed.workerUrl;
  return out;
}

/**
 * Merge `partial` into the existing settings. Empty strings DELETE the
 * field (treated as "Forget this key"). Best-effort; silent on quota.
 */
export function writeUserSettings(partial = {}) {
  const current = readUserSettings();
  const next = { ...current };
  for (const k of ["anthropicKey", "googleTtsKey", "workerUrl"]) {
    if (!(k in partial)) continue;
    const v = partial[k];
    if (typeof v !== "string" || v === "") delete next[k];
    else next[k] = v;
  }
  if (Object.keys(next).length === 0) safeRemove();
  else safeSet(JSON.stringify(next));
}

/**
 * Clear ALL BYOK fields. "Forget all keys" affordance in Settings.
 */
export function clearUserSettings() {
  safeRemove();
}

/**
 * Resolve the effective Worker URL: user override > build-time env > "".
 * `envUrl` is the value of `import.meta.env.VITE_DIRECTOR_WORKER_URL`
 * (passed in so this helper stays pure).
 */
export function getEffectiveWorkerUrl(envUrl = "") {
  const s = readUserSettings();
  if (s.workerUrl && s.workerUrl.trim()) return s.workerUrl.trim();
  return (envUrl || "").trim();
}
