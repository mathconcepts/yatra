import { useMemo } from "react";
import { interpolateRoute } from "../utils/route";

export default function ElevationProfile({ route, progress, origin, destination, accentColor }) {
  const profile = useMemo(() => {
    const N = 80;
    return Array.from({ length: N + 1 }, (_, i) =>
      interpolateRoute(route.waypoints, i / N)
    );
  }, [route]);

  const profileMin = Math.min(...profile.map((p) => p.elev));
  const profileMax = Math.max(...profile.map((p) => p.elev));

  const m = { l: 38, r: 14, t: 12, b: 24 };
  const W = 700, H = 140;
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const xs = profile.map((_, i) => m.l + (i / (profile.length - 1)) * pw);
  const ys = profile.map((p) =>
    m.t + (1 - (p.elev - profileMin) / ((profileMax - profileMin) || 1)) * ph
  );
  const d = xs.map((x, i) => (i === 0 ? "M" : "L") + x.toFixed(1) + "," + ys[i].toFixed(1)).join(" ");
  const fill = d + ` L${xs[xs.length - 1]},${m.t + ph} L${xs[0]},${m.t + ph} Z`;
  const reached = Math.floor(progress * (profile.length - 1));

  return (
    <div className="jm-card">
      <div className="jm-card-head">Elevation Profile · {route.name}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
        <defs>
          <linearGradient id="jm-prof" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={route.color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={route.color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fill} fill="url(#jm-prof)" />
        <path d={d} stroke={route.color} strokeWidth="2" fill="none" />
        <path
          d={xs.slice(0, reached + 1)
                .map((x, i) => (i === 0 ? "M" : "L") + x.toFixed(1) + "," + ys[i].toFixed(1))
                .join(" ")}
          stroke={accentColor}
          strokeWidth="2.5"
          fill="none"
        />
        {progress > 0 && (
          <circle cx={xs[reached]} cy={ys[reached]} r="4" fill={accentColor} stroke="#fff" strokeWidth="1.5" />
        )}
        <text x="6" y={m.t + 4} fontSize="9" fill="#7a8595" fontFamily="JetBrains Mono, monospace">
          {Math.round(profileMax)}m
        </text>
        <text x="6" y={m.t + ph + 4} fontSize="9" fill="#7a8595" fontFamily="JetBrains Mono, monospace">
          {Math.round(profileMin)}m
        </text>
        <text x={m.l} y={H - 6} fontSize="9" fill="#7a8595" fontFamily="JetBrains Mono, monospace">
          {origin.name}
        </text>
        <text x={m.l + pw} y={H - 6} fontSize="9" fill="#7a8595" fontFamily="JetBrains Mono, monospace" textAnchor="end">
          {destination.name}
        </text>
      </svg>
    </div>
  );
}
