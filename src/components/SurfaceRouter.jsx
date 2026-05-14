import { useState, useEffect, lazy, Suspense } from "react";
import { readMemoryFromUrl } from "../services/shareLink";
import AtlasExportMenu from "./AtlasExportMenu";

// Reels is lazy so the desktop bundle does not pull in reels code.
// See ~/.gstack/projects/mathconcepts-yatra/root-main-v3-0-plan-20260512-144026.md
// (reviewer correction #9: dynamic import gate).
const Reels = lazy(() => import("./reels/ReelFeed.jsx"));
const Composer = lazy(() => import("./composer/MemoryComposer.jsx"));
const Memories = lazy(() => import("./memories/MemoryGallery.jsx"));
const Compare = lazy(() => import("./compare/CompareView.jsx"));
const Director = lazy(() => import("./director/DirectorView.jsx"));
const Settings = lazy(() => import("./settings/SettingsView.jsx"));

const STORAGE_KEY = "yatra.surface";
const VALID_SURFACES = ["atlas", "reels", "composer", "memories", "compare", "director", "settings"];

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
  if (VALID_SURFACES.includes(urlOverride)) return urlOverride;
  if (VALID_SURFACES.includes(stored)) return stored;
  if (!width || !height) return "atlas"; // SSR / unknown → safe default
  const portrait = height / width > 1;
  const small = Math.min(width, height) < 768;
  return portrait || small ? "reels" : "atlas";
}

function readURLOverride() {
  if (typeof window === "undefined") return null;
  const v = new URLSearchParams(window.location.search).get("surface");
  return VALID_SURFACES.includes(v) ? v : null;
}

function readStoredOverride() {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return VALID_SURFACES.includes(v) ? v : null;
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
export default function SurfaceRouter({ atlas, locationId, locations, atlasConfig, atlasMapRef }) {
  const [size, setSize] = useState(readSize);
  const [override, setOverride] = useState(() => readURLOverride() || readStoredOverride());
  // A shared / saved memory routed in via ?memory=... or opened from the
  // gallery. When set, replaces the curated locations list with this
  // single config so ReelFeed renders it as the only reel.
  const [memoryOverride, setMemoryOverride] = useState(() => {
    if (typeof window === "undefined") return null;
    return readMemoryFromUrl(window.location.href);
  });

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

  if (surface === "composer") {
    return (
      <Suspense fallback={<div className="jm-loading" role="status">Loading…</div>}>
        <Composer
          onCancel={() => switchSurface("atlas")}
          onPreview={(cfg) => { setMemoryOverride(cfg); switchSurface("reels"); }}
        />
      </Suspense>
    );
  }

  if (surface === "memories") {
    return (
      <Suspense fallback={<div className="jm-loading" role="status">Loading…</div>}>
        <Memories
          onCancel={() => switchSurface("atlas")}
          onOpen={(cfg) => { setMemoryOverride(cfg); switchSurface("reels"); }}
        />
      </Suspense>
    );
  }

  if (surface === "compare") {
    return (
      <Suspense fallback={<div className="jm-loading" role="status">Loading…</div>}>
        <Compare locations={locations} onCancel={() => switchSurface("atlas")} />
      </Suspense>
    );
  }

  if (surface === "director") {
    return (
      <Suspense fallback={<div className="jm-loading" role="status">Loading…</div>}>
        <Director locations={locations} onCancel={() => switchSurface("atlas")} />
      </Suspense>
    );
  }

  if (surface === "settings") {
    return (
      <Suspense fallback={<div className="jm-loading" role="status">Loading…</div>}>
        <Settings onCancel={() => switchSurface("atlas")} />
      </Suspense>
    );
  }

  if (surface === "reels") {
    // When a memory was routed in (shared URL or opened from gallery),
    // ReelFeed sees a one-key locations map containing just that config.
    const effectiveLocations = memoryOverride
      ? { [memoryOverride.id || "shared"]: memoryOverride }
      : locations;
    const effectiveId = memoryOverride ? (memoryOverride.id || "shared") : locationId;
    return (
      <Suspense fallback={<div className="jm-loading" role="status">Loading…</div>}>
        <Reels
          locationId={effectiveId}
          locations={effectiveLocations}
          onSwitchToAtlas={() => { setMemoryOverride(null); switchSurface("atlas"); }}
        />
      </Suspense>
    );
  }

  return (
    <>
      {atlas}
      <div className="jm-surface-toggles">
        <button
          type="button"
          className="jm-surface-toggle"
          onClick={() => switchSurface("composer")}
          aria-label="Compose a memory"
        >
          Compose memory
        </button>
        <button
          type="button"
          className="jm-surface-toggle"
          onClick={() => switchSurface("memories")}
          aria-label="View saved memories"
        >
          My memories
        </button>
        <button
          type="button"
          className="jm-surface-toggle"
          onClick={() => switchSurface("compare")}
          aria-label="Compare two journeys"
        >
          Compare
        </button>
        <button
          type="button"
          className="jm-surface-toggle"
          onClick={() => switchSurface("reels")}
          aria-label="Switch to Reels mode"
        >
          Reels mode
        </button>
        <button
          type="button"
          className="jm-surface-toggle"
          onClick={() => switchSurface("director")}
          aria-label="Open AI Director"
        >
          Director ✨
        </button>
        <button
          type="button"
          className="jm-surface-toggle"
          onClick={() => switchSurface("settings")}
          aria-label="Open Settings"
          title="BYOK keys & custom Worker URL"
        >
          Settings ⚙
        </button>
        {atlasConfig && atlasMapRef && (
          <AtlasExportMenu mapRef={atlasMapRef} config={atlasConfig} />
        )}
      </div>
    </>
  );
}
