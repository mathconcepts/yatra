export default function Header({
  config, basemap, onBasemapChange,
  activeRouteId, onRouteChange,
}) {
  return (
    <div className="jm-header">
      <div>
        <h1 className="jm-display jm-title">{config.title}</h1>
        <div className="jm-sub">{config.subtitle}</div>
        {config.culture.invocation && (
          <div className="jm-display jm-invocation" style={{ color: config.culture.accentColor }}>
            {config.culture.invocation}
          </div>
        )}
      </div>

      <div className="jm-toolrow">
        <div className="jm-basemap">
          {["topo", "imagery", "relief"].map((b) => (
            <button
              key={b}
              className={"jm-bm " + (basemap === b ? "active" : "")}
              onClick={() => onBasemapChange(b)}
              style={basemap === b ? { background: config.culture.accentColor, color: "#1a1208" } : null}
            >
              {b}
            </button>
          ))}
        </div>
        <div className="jm-tabs">
          {config.routes.map((r) => (
            <button
              key={r.id}
              className={"jm-tab " + (r.id === activeRouteId ? "active" : "")}
              onClick={() => onRouteChange(r.id)}
              style={r.id === activeRouteId ? { boxShadow: `inset 0 -2px 0 ${r.color}` } : null}
            >
              {r.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
