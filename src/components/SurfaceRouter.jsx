import { useState, useEffect, lazy, Suspense } from "react";

// Reels is lazy so the desktop bundle does not pull in reels code.
// See ~/.gstack/projects/mathconcepts-yatra/root-main-v3-0-plan-20260512-144026.md
// (reviewer correction #9: dynamic import gate).
const Reels = lazy(() => import("./reels/ReelsPlaceholder.jsx"));

const STORAGE_KEY = "yatra.surface";

/**
 * Pure decision: pick the right surface for a viewport.
 *
 * Precedence: URL override > stored preference > viewport heuristic.
 * Viewport heuristic: portrait (h/w > 1) OR small min-dim (< 768) → reels.
 *
 * Exported for unit testing — covers the iPad portrait + foldable cases
 * the reviewer flagged.
 */
export function pickSurface(width, height, urlOverride, stored) {
  if (urlOverride === "reels" || urlOverride === "atlas") return urlOverride;
  if (stored === "reels" || stored === "atlas") return stored;
  if (!width || !height) return "atlas"; // SSR / unknown → safe default
  const portrait = height / width > 1;
  const small = Math.min(width, height) < 768;
  return portrait || small ? "reels" : "atlas";
}

function readURLOverride() {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("surface");
  return v === "reels" || v === "atlas" ? v : null;
}

function readStoredOverride() {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === "reels" || v === "atlas" ? v : null;
  } catch {
    return null;
  }
}

function readSize() {
  if (typeof window === "undefined") return { w: 1200, h: 800 };
  return { w: window.innerWidth, h: window.innerHeight };
}

/**
 * Routes between the Atlas (existing landscape surface, passed as `atlas`)
 * and the Reels (vertical) surface. Decision is recomputed on viewport
 * resize (debounced 250ms) so a window resize across the breakpoint swaps
 * surfaces without a refresh. The user's choice survives via URL +
 * localStorage.
 */
export default function SurfaceRouter({ atlas, locationId, locations }) {
  const [size, setSize] = useState(readSize);
  const [override, setOverride] = useState(() => readURLOverride() || readStoredOverride());

  useEffect(() => {
    if (typeof window === "undefined") return;
    let timer;
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setSize({ w: window.innerWidth, h: window.innerHeight }), 250);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(timer);
    };
  }, []);

  const surface = pickSurface(size.w, size.h, override, null);

  const switchSurface = (next) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode / quota — ignore */
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("surface", next);
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* about:blank in tests — ignore */
    }
    setOverride(next);
  };

  if (surface === "reels") {
    return (
      <Suspense fallback={<div className="jm-loading" role="status">Loading…</div>}>
        <Reels
          locationId={locationId}
          locations={locations}
          onSwitchToAtlas={() => switchSurface("atlas")}
        />
      </Suspense>
    );
  }

  return (
    <>
      {atlas}
      <button
        type="button"
        className="jm-surface-toggle"
        onClick={() => switchSurface("reels")}
        aria-label="Switch to Reels mode"
      >
        Reels mode
      </button>
    </>
  );
}
