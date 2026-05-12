import { useState, useRef } from "react";
import { parseGPX, simplify } from "../../services/gpx";

/**
 * GPX file picker. Reads the file as text, parses to waypoints,
 * simplifies, then bubbles result to parent via onImport(waypoints, name).
 *
 * Caps result at ~500 points to keep route-rendering snappy.
 */
const MAX_POINTS = 500;

export default function GpxImporter({ onImport }) {
  const [status, setStatus] = useState(null); // null | "loading" | { count, name } | { error }
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setStatus("loading");
    try {
      const text = await file.text();
      const { waypoints, name, error } = parseGPX(text);
      if (error) { setStatus({ error }); return; }
      if (!waypoints || waypoints.length < 2) {
        setStatus({ error: "Track too short" });
        return;
      }
      let pts = waypoints;
      // Adaptively simplify until under MAX_POINTS.
      let tol = 0.0001;
      while (pts.length > MAX_POINTS && tol < 0.05) {
        pts = simplify(pts, tol);
        tol *= 2;
      }
      setStatus({ count: pts.length, name });
      if (typeof onImport === "function") onImport(pts, name || file.name);
    } catch (e) {
      setStatus({ error: "Could not read file" });
    }
  };

  const onChange = (e) => handleFile(e.target.files?.[0]);
  const onDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files?.[0]);
  };
  const onDragOver = (e) => e.preventDefault();

  return (
    <div className="gpx-importer" onDrop={onDrop} onDragOver={onDragOver}>
      <span className="composer-label">GPX track (optional)</span>
      <div className="gpx-dropzone">
        <input
          ref={inputRef}
          type="file"
          accept=".gpx,application/gpx+xml,application/xml,text/xml"
          onChange={onChange}
          className="gpx-input"
          aria-label="Import GPX file"
        />
        <button
          type="button"
          className="gpx-trigger"
          onClick={() => inputRef.current?.click()}
        >
          Choose .gpx file or drop here
        </button>
      </div>
      {status === "loading" && <p className="composer-hint">Parsing…</p>}
      {status?.error && <p className="composer-hint composer-error">Error: {status.error}</p>}
      {status?.count != null && (
        <p className="composer-hint">
          Imported {status.count} points{status.name ? ` from “${status.name}”` : ""}.
        </p>
      )}
    </div>
  );
}
