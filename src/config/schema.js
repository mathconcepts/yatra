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
 * @property {Tour[]}     [tours]     POI circuits for Director's "tour" mode
 *                                    (Yatra v1.8). Each tour names which
 *                                    landmark ids to visit and in what order.
 *                                    Optional — locations without tours stay
 *                                    on the point-to-point Director path.
 *
 * @property {"foot"|"road"|"rail"|"mixed"} [mode]   travel mode for the
 *                                                    journey overall; used
 *                                                    by the Reels surface
 *                                                    to pick a camera
 *                                                    strategy. Optional;
 *                                                    defaults to "foot".
 * @property {CameraStep[]} [cameraPlan]   pre-baked mood-cadence camera
 *                                          plan for vertical playback.
 *                                          Optional; generated at build
 *                                          time by moodCamera.js.
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
 * @property {SubTemplate} [subTemplate]   optional per-POI rendering
 *                                          overrides used when the landmark
 *                                          is the focus of a tour scene.
 *                                          Lets one location config carry
 *                                          rich, per-POI narration without
 *                                          needing a separate top-level
 *                                          file. (Yatra v1.8)
 *
 * @typedef {Object} SubTemplate
 * @property {string} [narrationHint]      a 1-2 sentence directive the AI
 *                                          should honor when this POI is on
 *                                          screen. Concrete, not generic.
 * @property {string[]} [curatedFacts]     verified facts the AI may state.
 *                                          The prompt forbids inventing
 *                                          religious/historical claims; this
 *                                          is the safe set.
 * @property {string} [architectureBlurb]  a short architectural detail for
 *                                          the postcard / arch overlay.
 * @property {string} [wikimediaTitle]     Commons page title for the
 *                                          architecture-fetcher module (M2).
 * @property {string[]} [aliases]          alternative names (e.g. Tamil,
 *                                          historical) the AI may use.
 *
 * @typedef {Object} Tour
 * @property {string} id           stable id (e.g. "srirangam-temples")
 * @property {string} name         display name (e.g. "Two great temples of Srirangam")
 * @property {string} [subtitle]   optional one-liner
 * @property {string[]} pois       ordered landmark ids to visit. MUST match
 *                                  ids in the location's landmarks[] array.
 * @property {Object} [stats]      { distanceKm?, durationHr? } summary
 * @property {string} [color]      hex accent for this tour
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
 *
 * @typedef {Object} CameraStep
 * @property {number} t        progress along the route, 0..1
 * @property {number} zoom     MapLibre zoom
 * @property {number} pitch    0..60 (mobile is clamped to 60)
 * @property {number} bearing  0..360
 * @property {number} [holdMs] optional hold duration at this step
 */

export {};
