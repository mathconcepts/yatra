import { useEffect, useState, useCallback, useRef } from "react";
import ReelPlayer from "./ReelPlayer";

const SWIPE_THRESHOLD_PX = 60;

/**
 * Pure: clamp an index to the valid range. Exported for unit tests.
 */
export function clampIndex(i, count) {
  if (count <= 0) return 0;
  if (i < 0) return 0;
  if (i >= count) return count - 1;
  return i;
}

/**
 * Vertical swipe-paginated feed of reels. Holds an array of locationIds
 * and renders ONE ReelPlayer at a time. Navigation via:
 *   - touch swipe up/down
 *   - keyboard ArrowUp / ArrowDown / PageUp / PageDown
 *   - the visible up/down arrows
 *
 * The next reel is prefetched only by mounting the next ReelPlayer behind
 * the active one would be wasteful in Slice 2 (MapLibre instances are
 * expensive). One player at a time; transitions are crossfades.
 */
export default function ReelFeed({ locationId, locations, onSwitchToAtlas }) {
  const ids = Object.keys(locations || {});
  const initialIdx = Math.max(0, ids.indexOf(locationId));
  const [idx, setIdx] = useState(initialIdx);
  const touchStartRef = useRef(null);

  const go = useCallback((delta) => {
    setIdx((i) => clampIndex(i + delta, ids.length));
  }, [ids.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); go(-1); }
      else if (e.key === "Escape") { e.preventDefault(); onSwitchToAtlas?.(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onSwitchToAtlas]);

  const onTouchStart = (e) => {
    touchStartRef.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e) => {
    if (touchStartRef.current == null) return;
    const dy = e.changedTouches[0].clientY - touchStartRef.current;
    touchStartRef.current = null;
    if (dy <= -SWIPE_THRESHOLD_PX) go(1);
    else if (dy >= SWIPE_THRESHOLD_PX) go(-1);
  };

  const activeId = ids[idx];
  const config = locations[activeId];

  if (!config) {
    return (
      <div className="reel-feed reel-feed-empty">
        <p>No journeys available yet.</p>
        <button type="button" className="reel-back" onClick={onSwitchToAtlas}>Back to Atlas</button>
      </div>
    );
  }

  return (
    <div
      className="reel-feed"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <ReelPlayer key={activeId} config={config} />

      <div className="reel-feed-nav" aria-hidden="true">
        <span className="reel-feed-count">{idx + 1} / {ids.length}</span>
      </div>

      <div className="reel-feed-arrows">
        <button
          type="button"
          className="reel-feed-arrow"
          aria-label="Previous reel"
          disabled={idx === 0}
          onClick={() => go(-1)}
        >▲</button>
        <button
          type="button"
          className="reel-feed-arrow"
          aria-label="Next reel"
          disabled={idx === ids.length - 1}
          onClick={() => go(1)}
        >▼</button>
      </div>

      <button
        type="button"
        className="reel-back"
        aria-label="Back to Atlas"
        onClick={onSwitchToAtlas}
      >
        Atlas
      </button>
    </div>
  );
}
