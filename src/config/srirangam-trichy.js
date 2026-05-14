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
      subTemplate: {
        narrationHint: "Open inside the seven prakarams. The reclining god, the river's curl, Ramanuja's century. Concrete: scale (156 acres), count (21 gopurams), pose (Adisesha couch).",
        curatedFacts: [
          "156 acres — the largest functioning Hindu temple complex on earth",
          "Seven concentric prakarams (walled enclosures)",
          "Twenty-one gopurams; the Rajagopuram is 236 feet tall, finished only in 1987",
          "Lord Ranganatha reclines on the thousand-headed serpent Adisesha",
          "Ramanuja, the Vaishnava acharya, lived and taught here in the 12th century",
          "Recognized as a UNESCO Asia-Pacific Heritage award site (2017)",
        ],
        architectureBlurb: "Dravidian architecture at temple-city scale. The seven prakarams form concentric streets; the innermost is the sanctum.",
        wikimediaTitle: "Ranganathaswamy Temple, Srirangam",
        aliases: ["Sri Ranganathaswamy", "Thiruvarangam", "Periyakovil"],
      },
    },
    {
      id: "jambukeshwarar",
      name: "Jambukeshwarar-Akhilandeshwari Temple",
      lat: 10.8538, lon: 78.7053, elev: 80,
      type: "shrine",
      blurb: "One of the five Pancha Bhuta Stalams representing the water element. The sanctum's lingam sits in a perpetual underground spring; even in drought the floor is wet. Built by the Chola king Kochengat Cholan; Adi Shankara is said to have made the goddess's earrings here.",
      ritual: "Madhyana puja · river darshan",
      subTemplate: {
        narrationHint: "This is the water-element temple. Lead with the spring at the lingam's base — even in drought, water seeps in. Mention Akhilandeshwari, Shankara's earrings, and that the priest dresses as a woman for the noon puja. Concrete: the wet floor, the elephant story, the noon ritual.",
        curatedFacts: [
          "One of the five Pancha Bhuta Stalams (Hindu elemental temples); this is the water (Appu) element",
          "The Shiva lingam in the sanctum sits in a natural underground spring that never dries",
          "The presiding goddess is Akhilandeshwari ('mistress of the universe')",
          "Built by Chola king Kochengat Cholan in the early Chola period (around the 7th century CE)",
          "Adi Shankara is said to have crafted the sri chakra earrings for Akhilandeshwari to calm her fierce form",
          "During the noon puja, the male priest dresses as a woman to perform abhishekam to the goddess",
          "Located at Thiruvanaikaval, about 2 km east of Srirangam temple",
        ],
        architectureBlurb: "Pancha Bhuta Stalam architecture with five concentric prakarams. The Vibuti Prakaram is said to have been built by an elephant and a spider competing in devotion.",
        wikimediaTitle: "Jambukeswarar Temple, Thiruvanaikaval",
        aliases: ["Thiruvanaikaval", "Thiruvanaikoil", "Jambukeswarar", "Appu Sthalam"],
      },
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

  tours: [
    {
      id: "two-temples",
      name: "Two great temples of Srirangam",
      subtitle: "Ranganathaswamy and Jambukeshwarar — Vaishnava and Shaiva, fire and water",
      pois: ["ranganathaswamy", "jambukeshwarar"],
      stats: { distanceKm: 2.4, durationHr: 0.5 },
      color: "#a05a32",
    },
    {
      id: "river-circuit",
      name: "River-island full circuit",
      subtitle: "Both great temples plus the bathing ghat",
      pois: ["ranganathaswamy", "amma-mandapam", "jambukeshwarar"],
      stats: { distanceKm: 3.6, durationHr: 1.2 },
      color: "#8a4528",
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
