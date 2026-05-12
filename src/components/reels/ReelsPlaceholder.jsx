// Slice 1 placeholder. Slice 2 replaces this with the real ReelFeed + ReelPlayer.
// Lives under components/reels/ so the dynamic-import bundle gate in
// SurfaceRouter.jsx is observable: anything in this folder is code-split out
// of the desktop Atlas bundle.

export default function ReelsPlaceholder({ locationId, locations, onSwitchToAtlas }) {
  const config = locations?.[locationId];
  return (
    <div className="reels-placeholder">
      <div className="reels-placeholder-card">
        <p className="reels-placeholder-eyebrow">Reels mode</p>
        <h1 className="reels-placeholder-title">{config?.title || "Yatra"}</h1>
        <p className="reels-placeholder-body">
          Vertical reels surface arrives in v3.0 Slice 2. For now, view the journey
          on the landscape Atlas.
        </p>
        <button type="button" className="reels-placeholder-cta" onClick={onSwitchToAtlas}>
          Open Atlas
        </button>
      </div>
    </div>
  );
}
