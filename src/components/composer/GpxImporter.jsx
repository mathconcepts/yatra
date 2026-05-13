import { useState, useRef } from "react";
import { parseGPX, simplify } from "../../services/gpx";

/**
 * GPX file picker. Accepts one or many GPX files; tracks are concatenated
 * in selection order to form a single multi-leg route. The result is
 * adaptively simplified to keep the final waypoint count under MAX_POINTS.
 *
 * `onImport(waypoints, name)` fires with the combined waypoints + a
 * derived name (single-file → its <name>; multi-file → "Combined N tracks").
 */
const MAX_POINTS = 500;

export default function GpxImporter({ onImport }) {
  // null | "loading" | { count, name, tracks } | { error }
  const [status, setStatus] = useState(null);
  const inputRef = useRef(null);

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    setStatus("loading");
    const fileList = Array.from(files);
    const allPoints = [];
    const trackNames = [];
    let firstError = null;
    for (const file of fileList) {
      try {
        const text = await file.text();
        const { waypoints, name, error } = parseGPX(text);
        if (error || !waypoints || waypoints.length < 2) {
          firstError = firstError || `${file.name}: ${error || "track too short"}`;
          continue;
        }
        allPoints.push(...waypoints);
        trackNames.push(name || file.name.replace(/\.gpx$/i, ""));
      } catch {
        firstError = firstError || `${file.name}: read failed`;
      }
    }

    if (allPoints.length < 2) {
      setStatus({ error: firstError || "No usable tracks" });
      return;
    }

    // Adaptively simplify the concatenated path.
    let pts = allPoints;
    let tol = 0.0001;
    while (pts.length > MAX_POINTS && tol < 0.05) {
      pts = simplify(pts, tol);
      tol *= 2;
    }

    const combinedName = trackNames.length === 1
      ? trackNames[0]
      : `${trackNames.length} tracks · ${trackNames[0]}…`;

    setStatus({ count: pts.length, name: combinedName, tracks: trackNames.length });
    if (typeof onImport === "function") onImport(pts, combinedName);
  };

  const onChange = (e) => handleFiles(e.target.files);
  const onDrop = (e) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };
  const onDragOver = (e) => e.preventDefault();

  return (
    <div className="gpx-importer" onDrop={onDrop} onDragOver={onDragOver}>
      <span className="composer-label">GPX tracks (optional, multi-file)</span>
      <div className="gpx-dropzone">
        <input
          ref={inputRef}
          type="file"
          accept=".gpx,application/gpx+xml,application/xml,text/xml"
          multiple
          onChange={onChange}
          className="gpx-input"
          aria-label="Import GPX files"
        />
        <button
          type="button"
          className="gpx-trigger"
          onClick={() => inputRef.current?.click()}
        >
          Choose .gpx files (or drop)
        </button>
      </div>
      {status === "loading" && <p className="composer-hint">Parsing…</p>}
      {status?.error && <p className="composer-hint composer-error">Error: {status.error}</p>}
      {status?.count != null && (
        <p className="composer-hint">
          Imported {status.count} points from {status.tracks} track{status.tracks === 1 ? "" : "s"}
          {status.name ? ` (“${status.name}”)` : ""}.
        </p>
      )}
    </div>
  );
}
