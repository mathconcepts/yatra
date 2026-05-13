export default function Header({
  config, basemap, onBasemapChange,
  activeRouteId, onRouteChange,
  compareRoutes = false, onToggleCompareRoutes,
}) {
  const hasMultipleRoutes = config.routes.length > 1;
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
          {config.routes.map((r) => {
            // In compareRoutes mode every route tab reads as 'selected' so
            // the user can see both routes are showing simultaneously.
            const isHighlighted = compareRoutes || r.id === activeRouteId;
            return (
              <button
                key={r.id}
                className={"jm-tab " + (isHighlighted ? "active" : "")}
                onClick={() => onRouteChange(r.id)}
                style={isHighlighted ? { boxShadow: `inset 0 -2px 0 ${r.color}` } : null}
              >
                {r.name}
              </button>
            );
          })}
          {hasMultipleRoutes && (
            <button
              type="button"
              className={"jm-tab " + (compareRoutes ? "active" : "")}
              onClick={() => onToggleCompareRoutes?.()}
              title="Show all routes side by side"
            >
              {compareRoutes ? "Comparing ✓" : "Compare all"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
