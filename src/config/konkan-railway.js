/** @type {import("./schema").LocationConfig} */
const config = {
  id: "konkan-railway",
  title: "Konkan Railway",
  subtitle: "Mumbai to Mangaluru, along the western edge",

  bounds: {
    latMin: 12.80, latMax: 19.10,
    lonMin: 72.80, lonMax: 75.00,
  },

  origin:      { name: "Mumbai CST", lat: 18.940, lon: 72.835, elev: 14 },
  destination: { name: "Mangaluru Junction", lat: 12.870, lon: 74.842, elev: 22 },

  mode: "rail",
  cameraStrategy: "rail",

  routes: [
    {
      id: "konkan-rail",
      name: "Konkan Railway · 10111 Konkan Kanya Express",
      color: "#0066aa",
      difficulty: "Easy",
      stats: { distanceKm: 738, durationHr: 14.5 },
      // Hand-picked waypoints from the Konkan Railway timetable — major
      // stations + Western Ghats crossings. Real-rail-geometry import
      // from OpenRailwayMap (ODbL, attribution committed in
      // docs/ATTRIBUTION.md) deferred to a later refinement; this
      // station-sequence path follows the line closely enough for
      // mood-cadence camera at vertical scale.
      waypoints: [
        { lat: 18.940, lon: 72.835, elev: 14 },   // Mumbai CST
        { lat: 19.020, lon: 72.840, elev: 11 },   // Dadar
        { lat: 19.075, lon: 72.880, elev: 8 },    // Kurla
        { lat: 19.030, lon: 73.085, elev: 12 },   // Panvel
        { lat: 18.430, lon: 73.130, elev: 18 },   // Roha — Konkan division begins
        { lat: 18.100, lon: 73.220, elev: 40 },   // Mangaon
        { lat: 17.715, lon: 73.395, elev: 95 },   // Khed
        { lat: 17.530, lon: 73.510, elev: 80 },   // Chiplun
        { lat: 16.970, lon: 73.300, elev: 25 },   // Ratnagiri
        { lat: 16.420, lon: 73.740, elev: 35 },   // Vaibhavwadi
        { lat: 16.275, lon: 73.715, elev: 38 },   // Kankavli
        { lat: 15.940, lon: 73.830, elev: 50 },   // Sawantwadi Road
        { lat: 15.270, lon: 74.000, elev: 12 },   // Madgaon (Goa)
        { lat: 14.810, lon: 74.130, elev: 8 },    // Karwar
        { lat: 14.270, lon: 74.460, elev: 30 },   // Sharavati bridge / Honnavar
        { lat: 13.970, lon: 74.560, elev: 18 },   // Bhatkal
        { lat: 13.340, lon: 74.750, elev: 28 },   // Udupi
        { lat: 12.870, lon: 74.842, elev: 22 },   // Mangaluru Junction
      ],
    },
  ],

  landmarks: [
    {
      id: "panvel",
      name: "Panvel Junction",
      lat: 19.030, lon: 73.085, elev: 12,
      type: "station",
      blurb: "The first major halt south of Mumbai and the gateway to the Konkan division. From here the line cuts inland to the Western Ghats foothills.",
    },
    {
      id: "roha",
      name: "Roha — Konkan division begins",
      lat: 18.430, lon: 73.130, elev: 18,
      type: "station",
      blurb: "Where the Indian Railways' Central division hands the train to the Konkan Railway Corporation. Sixty engineering teams spent seven years tunnelling 740 km of coast through 92 tunnels and 2,000 bridges.",
    },
    {
      id: "karbude-tunnel",
      name: "Karbude tunnel",
      lat: 17.140, lon: 73.330, elev: 60,
      type: "tunnel",
      blurb: "At 6.5 km the longest tunnel on the Konkan Railway, and for two decades the longest in India. The train enters the Sahyadri range here in near-total darkness.",
    },
    {
      id: "panval-viaduct",
      name: "Panval Nadi viaduct",
      lat: 17.450, lon: 73.420, elev: 130,
      type: "viaduct",
      blurb: "A 64-metre-high single-span concrete viaduct — the tallest railway bridge in India at the time of its 1997 completion. The train crosses the Panval river at canopy height with the Western Ghats spread out on either side.",
    },
    {
      id: "ratnagiri",
      name: "Ratnagiri",
      lat: 16.970, lon: 73.300, elev: 25,
      type: "station",
      blurb: "The largest coastal city on the line, halfway between Mumbai and Mangaluru. Mango orchards begin here; the Konkan mango (Hapus) is shipped north on this very train every May.",
    },
    {
      id: "sharavati-bridge",
      name: "Sharavati river bridge",
      lat: 14.270, lon: 74.460, elev: 30,
      type: "bridge",
      blurb: "Two kilometres of steel girder across the Sharavati estuary near Honnavar. The fishing boats in the river below pass under the train; on the western side, the Arabian Sea is one minute away.",
    },
    {
      id: "udupi",
      name: "Udupi",
      lat: 13.340, lon: 74.750, elev: 28,
      type: "station",
      blurb: "The Sri Krishna Matha town: birthplace of South Indian masala dosa and the Madhva tradition of Vaishnavism. Pilgrims pour off the train here for the Krishna temple darshan.",
    },
    {
      id: "mangaluru",
      name: "Mangaluru Junction",
      lat: 12.870, lon: 74.842, elev: 22,
      type: "destination",
      blurb: "The southern terminus of the Konkan line and the gateway to Kerala. From here the rails continue south as the Southern Railway.",
    },
  ],

  topography: {
    basemap: "imagery",
    zoom: 6.5,
    pitch: 28,
    bearing: -15,
    terrainExaggeration: 1.2,
  },

  region: {
    country: "India",
    state: "Maharashtra · Goa · Karnataka",
    district: "Konkan coast",
    governingBody: "Konkan Railway Corporation Limited (KRCL)",
    timeZone: "Asia/Kolkata",
    advisories: [
      "Monsoon (Jun–Sep) closes some sections temporarily — check IRCTC.",
      "Window seats on the right between Roha and Mangaluru for the sea.",
      "Tunnels block GPS — apps stop tracking until the next bridge.",
    ],
  },

  culture: {
    accentColor: "#0066aa",
    motif: "ghat tunnel and coastal viaduct",
    invocation: "जय कोंकण",
    summary:
      "India's most scenic railway, finished in 1998 after seven years of engineering through the Western Ghats. The train descends from Mumbai to the Arabian Sea, threads 92 tunnels, crosses 2,000 bridges, and arrives at Mangaluru just after dusk. The mango trade lives on this line.",
  },

  units: { distance: "km", elevation: "m", temperature: "C" },
};

export default config;
