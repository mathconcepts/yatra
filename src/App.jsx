import { useRef, useState, useEffect } from "react";
import JourneyMap from "./components/JourneyMap";
import SurfaceRouter from "./components/SurfaceRouter";
import { LOCATIONS } from "./config";

const LOCATION_STORAGE_KEY = "yatra.locationId";

function readStoredLocationId() {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(LOCATION_STORAGE_KEY);
    if (stored && LOCATIONS[stored]) return stored;
  } catch { /* private mode — ignore */ }
  return null;
}

function writeStoredLocationId(id) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(LOCATION_STORAGE_KEY, id); }
  catch { /* ignore */ }
}

function LocationPicker({ onPick }) {
  return (
    <div className="jm-firstrun" role="dialog" aria-label="Choose a journey">
      <h1 className="jm-firstrun-title">Where are we going today?</h1>
      <p className="jm-firstrun-sub">
        Pick a sacred journey to begin. You can switch any time from the Location menu at the top of the map.
      </p>
      <div className="jm-firstrun-grid">
        {Object.entries(LOCATIONS).map(([id, cfg]) => (
          <button key={id} type="button" onClick={() => onPick(id)}
                  className="jm-firstrun-card">
            <div className="jm-firstrun-card-title">{cfg.title}</div>
            {cfg.subtitle && <div className="jm-firstrun-card-sub">{cfg.subtitle}</div>}
            {cfg.routes?.length > 1 && (
              <div className="jm-firstrun-card-meta">
                {cfg.routes.length} trail variants
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [locationId, setLocationId] = useState(readStoredLocationId);
  const config = locationId ? LOCATIONS[locationId] : null;
  // Lifted to App so SurfaceRouter can render the Atlas Export menu
  // inside the toggle column instead of as a floating sibling that
  // overlapped the other toggles.
  const atlasMapRef = useRef(null);

  function pick(id) {
    setLocationId(id);
    writeStoredLocationId(id);
  }
  useEffect(() => {
    if (locationId) writeStoredLocationId(locationId);
  }, [locationId]);

  // First run (or cleared storage): show the picker. No map preselected.
  if (!locationId || !config) {
    return <LocationPicker onPick={pick} />;
  }

  const atlas = (
    <div className="jm-root">
      {Object.keys(LOCATIONS).length > 1 && (
        <div className="jm-location-switcher">
          <span className="jm-switcher-label">Location</span>
          <select value={locationId} onChange={e => pick(e.target.value)}>
            {Object.entries(LOCATIONS).map(([id, cfg]) => (
              <option key={id} value={id}>{cfg.title}</option>
            ))}
          </select>
        </div>
      )}
      <JourneyMap key={config.id} config={config} mapRef={atlasMapRef} />
    </div>
  );

  return (
    <SurfaceRouter
      atlas={atlas}
      locationId={locationId}
      locations={LOCATIONS}
      atlasConfig={config}
      atlasMapRef={atlasMapRef}
    />
  );
}
