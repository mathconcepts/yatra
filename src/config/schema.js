/**
 * ══════════════════════════════════════════════════════════════════════
 *  LocationConfig SCHEMA
 *  ─────────────────────────────────────────────────────────────────────
 *  Every variable that defines a "journey" lives here. To support a new
 *  location, copy `tirupati-tirumala.js` and edit the fields — no
 *  component code needs to change.
 *
 *  REQUIRED FIELDS marked ★ — everything else is optional.
 * ══════════════════════════════════════════════════════════════════════
 *
 * @typedef {Object} LocationConfig
 *
 * @property {string} id           ★ stable id (kebab-case)
 * @property {string} title        ★ display title (e.g. "Tirupati → Tirumala")
 * @property {string} subtitle       short tagline
 *
 * @property {Bounds}  bounds      ★ bbox shown on the map
 * @property {Place}   origin      ★ journey start
 * @property {Place}   destination ★ journey end
 *
 * @property {Route[]}    routes    ★ one or more paths (min 1)
 * @property {Landmark[]} landmarks   POIs that trigger postcards
 *
 * @property {Topography} topography  basemap & zoom defaults
 * @property {Region}     region      political / jurisdictional info
 * @property {Culture}    culture     contextual storytelling
 * @property {Units}      units       display units
 *
 *
 * @typedef {Object} Bounds
 * @property {number} latMin  @property {number} latMax
 * @property {number} lonMin  @property {number} lonMax
 *
 * @typedef {Object} Place
 * @property {string} name   @property {number} lat
 * @property {number} lon    @property {number} elev
 *
 * @typedef {Object} Route
 * @property {string}  id          stable id
 * @property {string}  name        display name (e.g. "Alipiri Mettu")
 * @property {string}  color       hex color (used on map and profile)
 * @property {string}  difficulty  "Easy" | "Moderate" | "Steep" | "Hard"
 * @property {Object}  stats       { distanceKm, steps?, durationHr }
 * @property {Place[]} waypoints   ordered list (start → end)
 *
 * @typedef {Object} Landmark
 * @property {string} id
 * @property {string} name
 * @property {number} lat   @property {number} lon
 * @property {number} elev
 * @property {"gateway"|"milestone"|"shrine"|"destination"} type
 * @property {string} blurb   one-paragraph contextual narrative
 * @property {string} [ritual] short ritual / action label
 *
 * @typedef {Object} Topography
 * @property {"topo"|"imagery"|"relief"} basemap
 * @property {number} zoom                       default zoom (11-14)
 * @property {number} [pitch]                    default pitch (0-60)
 * @property {number} [bearing]                  default bearing
 * @property {number} [terrainExaggeration]      1-3
 *
 * @typedef {Object} Region
 * @property {string}   country
 * @property {string}   state
 * @property {string}   district
 * @property {string}   governingBody
 * @property {string}   timeZone
 * @property {string[]} advisories
 *
 * @typedef {Object} Culture
 * @property {string} accentColor   hex — drives marker, postcard accents
 * @property {string} [motif]       descriptor for theming
 * @property {string} [invocation]  greeting / mantra
 * @property {string} summary       one-paragraph context
 *
 * @typedef {Object} Units
 * @property {"km"|"mi"} distance
 * @property {"m"|"ft"}  elevation
 * @property {"C"|"F"}   temperature
 */

export {};
