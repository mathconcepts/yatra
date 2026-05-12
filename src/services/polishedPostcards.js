/**
 * Runtime lookup for the polish-manifest's polished postcard text.
 *
 * Vite inlines `polish-manifest.json` at build time, so this is a free
 * lookup at runtime. When the manifest is empty (v3.0 starting state),
 * every call falls through to the draft. When future runs of
 * `scripts/polish-postcards.mjs` populate the manifest, polished prose
 * appears automatically in the reels — without any per-config wiring.
 */

import manifest from "../../polish-manifest.json";

/**
 * Look up the polished blurb for a (configId, landmarkId) pair.
 * Returns `null` when no polished entry exists; callers should fall
 * back to the hand-written draft on the LocationConfig itself.
 */
export function polishedBlurb(configId, landmarkId) {
  if (!configId || !landmarkId) return null;
  const entry = manifest?.entries?.[`${configId}.${landmarkId}`];
  return entry?.polished || null;
}
