import { WMO_CODE } from "../services/weather";

export default function SidePanels({ config, weather, here, progress, route }) {
  const wmo = weather ? (WMO_CODE[weather.weather_code] || ["—", "·"]) : null;

  return (
    <div className="jm-side">
      {/* PHYSICAL — WEATHER */}
      <div className="jm-card">
        <div className="jm-card-head">Physical · Weather at summit</div>
        {weather ? (
          <>
            <div className="jm-weather-row">
              <span className="jm-weather-big">{wmo[1]}</span>
              <div>
                <span className="jm-display jm-weather-temp">
                  {Math.round(weather.temperature_2m)}°
                </span>
                <div className="jm-weather-cond">{wmo[0]}</div>
              </div>
            </div>
            <Row k="Humidity" v={`${Math.round(weather.relative_humidity_2m)}%`} />
            <Row k="Wind" v={`${Math.round(weather.wind_speed_10m)} km/h`} />
            <Row k="Precipitation" v={`${weather.precipitation} mm`} />
            <Row k="Daylight" v={weather.is_day ? "Yes" : "Night"} />
          </>
        ) : (
          <div className="jm-loading-text">Fetching from Open-Meteo…</div>
        )}
      </div>

      {/* GEOGRAPHICAL — POSITION */}
      <div className="jm-card">
        <div className="jm-card-head">Geographical · Current position</div>
        <Row k="Latitude" v={<span className="jm-mono">{here.lat.toFixed(5)}°N</span>} />
        <Row k="Longitude" v={<span className="jm-mono">{here.lon.toFixed(5)}°E</span>} />
        <Row k="Elevation" v={<span className="jm-mono">{Math.round(here.elev)} m</span>} />
        <Row k="Gain from base" v={<span className="jm-mono">+{Math.round(here.elev - config.origin.elev)} m</span>} />
        <Row k="Progress" v={<span className="jm-mono">{Math.round(progress * 100)}%</span>} />
      </div>

      {/* POLITICAL — JURISDICTION */}
      <div className="jm-card">
        <div className="jm-card-head">Political · Jurisdiction</div>
        <div className="jm-pills">
          <span className="jm-pill">{config.region.country}</span>
          <span className="jm-pill">{config.region.state}</span>
          <span className="jm-pill">{config.region.district}</span>
        </div>
        <div className="jm-governing">
          Administered by <b>{config.region.governingBody}</b>
        </div>
        <div className="jm-card-head" style={{ marginTop: 14, marginBottom: 8 }}>
          Local advisories
        </div>
        {config.region.advisories.map((a, i) => (
          <div key={i} className="jm-advisory">{a}</div>
        ))}
      </div>

      {/* ROUTE STATS */}
      <div className="jm-card">
        <div className="jm-card-head">Route · {route.name}</div>
        <Row k="Difficulty" v={route.difficulty} />
        <Row k="Distance" v={`${route.stats.distanceKm} ${config.units.distance}`} />
        {route.stats.steps && <Row k="Steps" v={route.stats.steps.toLocaleString()} />}
        <Row k="Typical time" v={`~${route.stats.durationHr} hr`} />
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="jm-meta-row">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}
