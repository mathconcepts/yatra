import { useEffect } from "react";

/**
 * The "delight" feature. Springs in from the right with a particle burst
 * when the journey marker passes a landmark, then auto-dismisses after
 * AUTO_DISMISS_MS or on click.
 */
const AUTO_DISMISS_MS = 6500;

export default function Postcard({ data, accentColor, onClose }) {
  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(onClose, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [data, onClose]);

  if (!data) return null;

  return (
    <div
      className="jm-postcard"
      key={data.id}
      onClick={onClose}
      style={{ "--accent": accentColor }}
    >
      <div className="jm-burst">
        {Array.from({ length: 18 }).map((_, i) => {
          const angle = (i / 18) * Math.PI * 2;
          const radius = 60 + Math.random() * 50;
          return (
            <span
              key={i}
              style={{
                "--dx": `${Math.cos(angle) * radius}px`,
                "--dy": `${Math.sin(angle) * radius}px`,
                animationDelay: `${i * 0.02}s`,
              }}
            />
          );
        })}
      </div>
      <div className="jm-postcard-stamp">✦ Postcard from the path</div>
      <div className="jm-postcard-title">{data.name}</div>
      <div className="jm-postcard-loc">
        {data.lat.toFixed(4)}°N, {data.lon.toFixed(4)}°E · {data.elev} m
      </div>
      <div className="jm-postcard-blurb">"{data.blurb}"</div>
      {data.ritual && <div className="jm-postcard-ritual">∴ {data.ritual}</div>}
    </div>
  );
}
