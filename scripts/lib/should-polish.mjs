// Decide whether a landmark's blurb is eligible for the polish pipeline.
//
// Religious carve-out from the v3.0 plan (premise P3-revised):
//   - landmark.type === "shrine" → SKIP (hand-curated only)
//   - landmark.type === "destination" AND landmark.ritual present → SKIP
//   - landmark.polish === false → SKIP (explicit opt-out)
//   - missing blurb → SKIP (nothing to polish)
//   - everything else → POLISH

const RELIGIOUS_TYPES = new Set(["shrine"]);

export function shouldPolish(landmark) {
  if (!landmark || typeof landmark.blurb !== "string" || !landmark.blurb.trim()) return false;
  if (landmark.polish === false) return false;
  if (RELIGIOUS_TYPES.has(landmark.type)) return false;
  if (landmark.type === "destination" && typeof landmark.ritual === "string" && landmark.ritual.trim()) return false;
  return true;
}
