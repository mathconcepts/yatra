import { useEffect, useRef, useState } from "react";
import { geocode } from "../../services/geocoder";

const DEBOUNCE_MS = 350;

/**
 * Single-place autocomplete backed by Nominatim. Debounces input, aborts
 * previous fetches, surfaces a list of suggestions. Selecting a suggestion
 * calls `onPick({name, lat, lon})`.
 */
export default function PlacePicker({ label, value, onPick, placeholder }) {
  const [q, setQ] = useState(value?.name || "");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    setQ(value?.name || "");
  }, [value?.name]);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (!q || q.trim().length < 2 || (value && q === value.name)) {
      setResults([]);
      setLoading(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      const out = await geocode(q, { signal: ctrl.signal });
      setLoading(false);
      setResults(out);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timerRef.current);
  }, [q, value]);

  const pick = (r) => {
    if (typeof onPick === "function") onPick({ name: r.name, lat: r.lat, lon: r.lon });
    setQ(r.name);
    setResults([]);
  };

  return (
    <div className="place-picker">
      <label className="composer-field">
        <span className="composer-label">{label}</span>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
        />
      </label>
      {loading && <div className="place-picker-loading">Searching…</div>}
      {results.length > 0 && (
        <ul className="place-picker-results" role="listbox">
          {results.slice(0, 5).map((r, i) => (
            <li key={`${r.lat}-${r.lon}-${i}`} role="option">
              <button type="button" className="place-picker-item" onClick={() => pick(r)}>
                <span className="place-picker-name">{r.name}</span>
                <span className="place-picker-kind">{r.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
