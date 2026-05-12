export default function Controls({
  playing, progress, speed, accentColor,
  onPlayToggle, onSpeedChange, onReset,
}) {
  return (
    <div className="jm-controls">
      <button className="jm-btn" onClick={onPlayToggle} style={{ background: accentColor }}>
        {playing
          ? "⏸ Pause"
          : progress > 0 && progress < 1
          ? "▶ Resume"
          : "▶ Begin Journey"}
      </button>
      {[1, 2, 4].map((s) => (
        <button
          key={s}
          className={"jm-speed " + (speed === s ? "active" : "")}
          onClick={() => onSpeedChange(s)}
        >
          {s}×
        </button>
      ))}
      <div className="jm-bar">
        <div
          className="jm-bar-fill"
          style={{ width: `${progress * 100}%`, background: `linear-gradient(90deg, ${accentColor}, #ffd180)` }}
        />
      </div>
      <button className="jm-btn jm-btn-ghost" onClick={onReset}>↺</button>
    </div>
  );
}
