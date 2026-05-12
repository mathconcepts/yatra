/** @type {import("./schema").LocationConfig} */
const config = {
  id: "srirangam-trichy",
  title: "Srirangam → Trichy",
  subtitle: "Where the river circles a sleeping god",

  bounds: {
    latMin: 10.815, latMax: 10.880,
    lonMin: 78.680, lonMax: 78.730,
  },

  origin:      { name: "Srirangam", lat: 10.8624, lon: 78.6878, elev: 78 },
  destination: { name: "Trichy Rock Fort", lat: 10.8290, lon: 78.6951, elev: 95 },

  mode: "mixed", // foot + road

  routes: [
    {
      id: "river-path",
      name: "Cauvery river path",
      color: "#8a4528",
      difficulty: "Easy",
      stats: { distanceKm: 9.5, durationHr: 2.5 },
      waypoints: [
        { lat: 10.8624, lon: 78.6878, elev: 78 },  // Ranganathaswamy Temple
        { lat: 10.8580, lon: 78.6905, elev: 77 },  // Amma Mandapam, river ghat
        { lat: 10.8505, lon: 78.6935, elev: 78 },  // Cauvery bridge crossing
        { lat: 10.8430, lon: 78.6948, elev: 80 },  // Trichy junction area
        { lat: 10.8360, lon: 78.6952, elev: 85 },  // Teppakulam tank
        { lat: 10.8310, lon: 78.6950, elev: 90 },  // Rock Fort base
        { lat: 10.8290, lon: 78.6951, elev: 95 },  // Ucchi Pillayar shrine
      ],
    },
  ],

  landmarks: [
    {
      id: "ranganathaswamy",
      name: "Ranganathaswamy Temple",
      lat: 10.8624, lon: 78.6878, elev: 78,
      type: "shrine",
      blurb: "The largest functioning Hindu temple complex on earth — 156 acres, seven concentric prakarams, twenty-one gopurams. Lord Ranganatha reclines on the serpent Adisesha, the river Cauvery curls around the island, and the Vaishnava acharya Ramanuja made this his home in the 12th century.",
      ritual: "Darshan · prasadam",
    },
    {
      id: "amma-mandapam",
      name: "Amma Mandapam",
      lat: 10.8580, lon: 78.6905, elev: 77,
      type: "milestone",
      blurb: "The bathing ghat where pilgrims step into the Cauvery before darshan. At dusk, lamps drift downstream; at dawn, the river carries marigolds south to the temple's eastern wall.",
      ritual: "River bath · turmeric offering",
    },
    {
      id: "cauvery-bridge",
      name: "Cauvery river bridge",
      lat: 10.8505, lon: 78.6935, elev: 78,
      type: "milestone",
      blurb: "The crossing that separates the temple island from the city of Trichy. The two streams of the Cauvery — Kollidam to the north, Cauvery proper to the south — make Srirangam a true river-island sanctuary.",
    },
    {
      id: "teppakulam",
      name: "Teppakulam tank",
      lat: 10.8360, lon: 78.6952, elev: 85,
      type: "milestone",
      blurb: "A sacred temple tank in the heart of Trichy, used for the annual Float Festival when the presiding deity is taken out on an illuminated raft.",
    },
    {
      id: "rock-fort",
      name: "Ucchi Pillayar Temple",
      lat: 10.8290, lon: 78.6951, elev: 95,
      type: "destination",
      blurb: "The Rock Fort temple of Ganesha, perched on a 273-foot granite outcrop that has been a place of worship for at least 2,500 years. The 437-step climb is itself a pilgrimage.",
      ritual: "417 steps · darshan",
    },
  ],

  topography: {
    basemap: "topo",
    zoom: 13.5,
    pitch: 35,
    bearing: -20,
    terrainExaggeration: 1.0,
  },

  region: {
    country: "India",
    state: "Tamil Nadu",
    district: "Tiruchirappalli",
    governingBody: "Tamil Nadu Hindu Religious & Charitable Endowments (HR&CE)",
    timeZone: "Asia/Kolkata",
    advisories: [
      "Inner sanctum of Ranganathaswamy temple closed to non-Hindus.",
      "Modest dress (no shorts) required at both temples.",
      "Rock Fort climb is steep stone; not wheelchair-accessible.",
    ],
  },

  culture: {
    accentColor: "#8a4528",
    motif: "river-island sanctuary",
    invocation: "ஓம் ஶ்ரீ ரங்கநாதாய நமஃ",
    summary:
      "The Sri Vaishnava heartland: a sleeping Vishnu, a curling river, and the city that grew around them. Walked end-to-end in a single afternoon, with the cool Cauvery air rising as the Rock Fort steps climb away from the plain.",
  },

  units: { distance: "km", elevation: "m", temperature: "C" },
};

export default config;
