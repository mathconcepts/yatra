import { useRef, useState } from "react";
import JourneyMap from "./components/JourneyMap";
import SurfaceRouter from "./components/SurfaceRouter";
import { LOCATIONS } from "./config";

export default function App() {
  const [locationId, setLocationId] = useState(Object.keys(LOCATIONS)[0]);
  const config = LOCATIONS[locationId];
  // Lifted to App so SurfaceRouter can render the Atlas Export menu
  // inside the toggle column instead of as a floating sibling that
  // overlapped the other toggles.
  const atlasMapRef = useRef(null);

  const atlas = (
    <div className="jm-root">
      {Object.keys(LOCATIONS).length > 1 && (
        <div className="jm-location-switcher">
          <span className="jm-switcher-label">Location</span>
          <select value={locationId} onChange={e => setLocationId(e.target.value)}>
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
