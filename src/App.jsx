import { useRef, useState, useEffect } from "react";
import JourneyMap from "./components/JourneyMap";
import SurfaceRouter from "./components/SurfaceRouter";
import { LOCATIONS } from "./config";
import { buildCustomJourney } from "./services/customJourney.js";

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

function LocationPicker({ onPick, onCustom }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [via, setVia] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function submitCustom() {
    if (!from.trim() || !to.trim()) return;
    setWorking(true);
    setError("");
    try {
      const waypoints = via.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 3);
      const cfg = await buildCustomJourney({
        originQuery: from.trim(),
        destinationQuery: to.trim(),
        waypointQueries: waypoints,
      });
      onCustom(cfg);
    } catch (err) {
      setError(err?.message || "Could not build that journey.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="jm-firstrun" role="dialog" aria-label="Choose a journey">
      <h1 className="jm-firstrun-title">Where are we going today?</h1>
      <p className="jm-firstrun-sub">
        Pick a sacred journey to begin, or build your own from any two places on earth.
      </p>
      <div className="jm-firstrun-grid">
        {Object.entries(LOCATIONS).map(([id, cfg]) => (
          <button key={id} type="button" onClick={() => onPick(id)}
                  className="jm-firstrun-card">
            <div className="jm-firstrun-card-title">{cfg.title}</div>
            {cfg.subtitle && <div className="jm-firstrun-card-sub">{cfg.subtitle}</div>}
            <div className="jm-firstrun-card-meta">
              {cfg.routes?.length > 1 && `${cfg.routes.length} trail variants`}
              {cfg.tours?.length > 0 && ` · ${cfg.tours.length} tours`}
            </div>
          </button>
        ))}
        <button type="button" onClick={() => setCustomOpen((v) => !v)}
                className="jm-firstrun-card" style={{ borderStyle: "dashed" }}>
          <div className="jm-firstrun-card-title">+ Build your own journey</div>
          <div className="jm-firstrun-card-sub">Any start, any end, anywhere on earth.</div>
        </button>
      </div>

      {customOpen && (
        <div className="jm-firstrun-custom" style={{
          marginTop: "1.4rem", width: "min(900px, 100%)", padding: "1rem 1.2rem",
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(244,232,208,0.18)",
          borderRadius: 10,
        }}>
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ fontSize: "0.85rem" }}>
              <div style={{ opacity: 0.7, marginBottom: 4 }}>From</div>
              <input value={from} onChange={(e) => setFrom(e.target.value)}
                     placeholder="e.g. Pondicherry"
                     style={{ width: "100%", padding: "0.55rem 0.75rem", borderRadius: 6,
                              background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.15)", color: "inherit" }} />
            </label>
            <label style={{ fontSize: "0.85rem" }}>
              <div style={{ opacity: 0.7, marginBottom: 4 }}>To</div>
              <input value={to} onChange={(e) => setTo(e.target.value)}
                     placeholder="e.g. Mahabalipuram"
                     style={{ width: "100%", padding: "0.55rem 0.75rem", borderRadius: 6,
                              background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.15)", color: "inherit" }} />
            </label>
            <label style={{ fontSize: "0.85rem" }}>
              <div style={{ opacity: 0.7, marginBottom: 4 }}>Via (optional, up to 3 places, comma-separated)</div>
              <input value={via} onChange={(e) => setVia(e.target.value)}
                     placeholder="e.g. Auroville, Tiruvannamalai"
                     style={{ width: "100%", padding: "0.55rem 0.75rem", borderRadius: 6,
                              background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.15)", color: "inherit" }} />
            </label>
            {error && <div role="alert" style={{ color: "#f4a3a3", fontSize: "0.85rem" }}>{error}</div>}
            <button type="button" onClick={submitCustom} disabled={working || !from || !to}
                    style={{
                      padding: "0.7rem 1rem", borderRadius: 6, border: "none", cursor: working || !from || !to ? "default" : "pointer",
                      background: "#8a4528", color: "#f4e8d0", fontWeight: 600, opacity: working || !from || !to ? 0.6 : 1,
                    }}>
              {working ? "Geocoding places…" : "Build journey →"}
            </button>
            <div style={{ fontSize: "0.78rem", opacity: 0.55 }}>
              Geocodes via Nominatim (OpenStreetMap, free). One place per 1.1s; up to 5 places per journey.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [locationId, setLocationId] = useState(readStoredLocationId);
  const [customConfigs, setCustomConfigs] = useState({}); // built journeys, this session only
  const allLocations = { ...LOCATIONS, ...customConfigs };
  const config = locationId ? allLocations[locationId] : null;
  // Lifted to App so SurfaceRouter can render the Atlas Export menu
  // inside the toggle column instead of as a floating sibling that
  // overlapped the other toggles.
  const atlasMapRef = useRef(null);

  function pick(id) {
    setLocationId(id);
    writeStoredLocationId(id);
  }
  function acceptCustom(cfg) {
    setCustomConfigs((m) => ({ ...m, [cfg.id]: cfg }));
    setLocationId(cfg.id);
    writeStoredLocationId(cfg.id);
  }
  useEffect(() => {
    if (locationId) writeStoredLocationId(locationId);
  }, [locationId]);

  // First run (or cleared storage): show the picker. No map preselected.
  if (!locationId || !config) {
    return <LocationPicker onPick={pick} onCustom={acceptCustom} />;
  }

  const atlas = (
    <div className="jm-root">
      {Object.keys(allLocations).length > 1 && (
        <div className="jm-location-switcher">
          <span className="jm-switcher-label">Location</span>
          <select value={locationId} onChange={e => pick(e.target.value)}>
            {Object.entries(allLocations).map(([id, cfg]) => (
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
      locations={allLocations}
      atlasConfig={config}
      atlasMapRef={atlasMapRef}
    />
  );
}
