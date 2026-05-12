/**
 * Minimal EXIF GPS extractor — pure-JS, no dependencies.
 *
 * Reads the JPEG APP1 segment, walks the TIFF IFDs, and pulls out
 * GPSLatitude / GPSLongitude / GPSLatitudeRef / GPSLongitudeRef.
 * Returns { lat, lon } or null if no GPS data is present.
 *
 * Designed to be small and forgiving — many JPEG sources strip EXIF
 * (Instagram, Discord, iMessage), so the no-GPS path must be fast and
 * silent. We never throw.
 *
 * Spec references: JEITA CP-3451 (EXIF 2.3), TIFF 6.0.
 */

const TIFF_BYTE = 1;
const TIFF_SHORT = 3;
const TIFF_LONG = 4;
const TIFF_RATIONAL = 5;

const GPS_IFD_POINTER_TAG = 0x8825;
const GPS_LAT_REF = 0x0001;
const GPS_LAT = 0x0002;
const GPS_LON_REF = 0x0003;
const GPS_LON = 0x0004;

export async function readExifGPS(blob) {
  if (!blob || typeof blob.arrayBuffer !== "function") return null;
  let buf;
  try { buf = await blob.arrayBuffer(); } catch { return null; }
  if (!buf || buf.byteLength < 4) return null;
  const view = new DataView(buf);

  // JPEG starts with 0xFFD8
  if (view.getUint16(0) !== 0xffd8) return null;

  // Walk markers until we find APP1 (0xFFE1) or hit start of scan.
  let offset = 2;
  while (offset < view.byteLength - 4) {
    const marker = view.getUint16(offset);
    if (marker === 0xffda || marker === 0xffd9) return null; // SOS or EOI
    if ((marker & 0xff00) !== 0xff00) return null;
    const segLen = view.getUint16(offset + 2);
    if (marker === 0xffe1) {
      const start = offset + 4;
      // "Exif\0\0" header
      if (view.getUint32(start) !== 0x45786966) {
        offset += 2 + segLen;
        continue;
      }
      return _readTiff(view, start + 6);
    }
    offset += 2 + segLen;
  }
  return null;
}

function _readTiff(view, base) {
  if (base + 8 > view.byteLength) return null;
  const endian = view.getUint16(base);
  const little = endian === 0x4949;
  if (!little && endian !== 0x4d4d) return null;
  const get16 = (o) => view.getUint16(o, little);
  const get32 = (o) => view.getUint32(o, little);
  if (get16(base + 2) !== 0x002a) return null;
  const ifd0 = base + get32(base + 4);

  const gpsPtrOffset = _findTagOffset(view, ifd0, GPS_IFD_POINTER_TAG, get16, get32);
  if (gpsPtrOffset == null) return null;
  const gpsIFD = base + get32(gpsPtrOffset);
  return _readGpsIFD(view, gpsIFD, base, get16, get32, little);
}

function _findTagOffset(view, ifdStart, tag, get16, get32) {
  if (ifdStart + 2 > view.byteLength) return null;
  const count = get16(ifdStart);
  for (let i = 0; i < count; i++) {
    const entry = ifdStart + 2 + i * 12;
    if (entry + 12 > view.byteLength) return null;
    if (get16(entry) === tag) return entry + 8;
  }
  return null;
}

function _readGpsIFD(view, ifdStart, base, get16, get32, little) {
  if (ifdStart + 2 > view.byteLength) return null;
  const count = get16(ifdStart);
  let latRef = "N", lonRef = "E", lat = null, lon = null;
  for (let i = 0; i < count; i++) {
    const entry = ifdStart + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;
    const tag = get16(entry);
    const type = get16(entry + 2);
    const nValues = get32(entry + 4);
    const valOffset = entry + 8;
    switch (tag) {
      case GPS_LAT_REF:
        latRef = String.fromCharCode(view.getUint8(valOffset)) || "N";
        break;
      case GPS_LON_REF:
        lonRef = String.fromCharCode(view.getUint8(valOffset)) || "E";
        break;
      case GPS_LAT:
        lat = _readRational3(view, base + get32(valOffset), get32, little);
        break;
      case GPS_LON:
        lon = _readRational3(view, base + get32(valOffset), get32, little);
        break;
      default: break;
    }
  }
  if (lat == null || lon == null) return null;
  const latDeg = _dmsToDeg(lat) * (latRef === "S" ? -1 : 1);
  const lonDeg = _dmsToDeg(lon) * (lonRef === "W" ? -1 : 1);
  if (!Number.isFinite(latDeg) || !Number.isFinite(lonDeg)) return null;
  return { lat: latDeg, lon: lonDeg };
}

function _readRational3(view, offset, get32, _little) {
  if (offset + 24 > view.byteLength) return null;
  const num = (o) => get32(o);
  const den = (o) => get32(o + 4) || 1;
  return [
    num(offset) / den(offset),
    num(offset + 8) / den(offset + 8),
    num(offset + 16) / den(offset + 16),
  ];
}

/**
 * Pure: degrees-minutes-seconds tuple → decimal degrees.
 * Exported for unit tests.
 */
export function dmsToDeg(dms) {
  return _dmsToDeg(dms);
}
function _dmsToDeg(dms) {
  if (!Array.isArray(dms) || dms.length < 3) return NaN;
  const [d, m, s] = dms;
  return d + m / 60 + s / 3600;
}
