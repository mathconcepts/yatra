import { useState } from "react";
import { readExifGPS } from "../../services/exif";

/**
 * Drop-zone for photos. For each dropped image, tries to read EXIF GPS;
 * if present, calls onLandmark({lat, lon, name, blurb, photoUrl}).
 *
 * Photos WITHOUT GPS are silently skipped with a count surfaced to the
 * user. This is intentional: many social-media-exported images have EXIF
 * stripped and we don't want to scare users into thinking it's broken.
 */
export default function PhotoDrop({ onLandmark }) {
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    let withGps = 0;
    let withoutGps = 0;
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const gps = await readExifGPS(file);
      if (!gps) { withoutGps += 1; continue; }
      const url = URL.createObjectURL(file);
      const name = file.name.replace(/\.[^.]+$/, "") || "Photo";
      if (typeof onLandmark === "function") {
        onLandmark({
          name,
          lat: gps.lat,
          lon: gps.lon,
          blurb: `Photo · ${name}`,
          photoUrl: url,
        });
      }
      withGps += 1;
    }
    setBusy(false);
    setSummary({ withGps, withoutGps });
  };

  const onChange = (e) => handleFiles(Array.from(e.target.files || []));
  const onDrop = (e) => {
    e.preventDefault();
    handleFiles(Array.from(e.dataTransfer.files || []));
  };
  const onDragOver = (e) => e.preventDefault();

  return (
    <div className="photo-drop" onDrop={onDrop} onDragOver={onDragOver}>
      <span className="composer-label">Photos (optional)</span>
      <div className="photo-dropzone">
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={onChange}
          aria-label="Drop photos to add as landmarks"
        />
      </div>
      {busy && <p className="composer-hint">Reading GPS from photos…</p>}
      {summary && (
        <p className="composer-hint">
          Added {summary.withGps} photo{summary.withGps === 1 ? "" : "s"} as landmarks.
          {summary.withoutGps > 0 && ` (${summary.withoutGps} skipped — no GPS in EXIF.)`}
        </p>
      )}
    </div>
  );
}
