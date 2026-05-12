import { useState } from "react";
import JourneyMap from "./components/JourneyMap";
import { LOCATIONS } from "./config";

export default function App() {
  const [locationId, setLocationId] = useState(Object.keys(LOCATIONS)[0]);
  const config = LOCATIONS[locationId];

  return (
    <div className="jm-root">
      {/* Location switcher — top-right floating */}
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
      <JourneyMap config={config} />
    </div>
  );
}
