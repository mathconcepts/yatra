/** @type {import("./schema").LocationConfig} */
const config = {
  id: "tirupati-tirumala",
  title: "Tirupati → Tirumala",
  subtitle: "The sacred ascent to Lord Venkateswara",

  bounds: {
    latMin: 13.620, latMax: 13.715,
    lonMin: 79.290, lonMax: 79.430,
  },

  origin:      { name: "Tirupati", lat: 13.6288, lon: 79.4192, elev: 182 },
  destination: { name: "Tirumala", lat: 13.6833, lon: 79.3474, elev: 853 },

  routes: [
    {
      id: "alipiri",
      name: "Alipiri Mettu",
      color: "#3b82f6",
      difficulty: "Moderate",
      stats: { distanceKm: 11, steps: 3550, durationHr: 4 },
      waypoints: [
        { lat: 13.6288, lon: 79.4192, elev: 182 },
        { lat: 13.6371, lon: 79.4015, elev: 220 },
        { lat: 13.6443, lon: 79.3895, elev: 320 },
        { lat: 13.6534, lon: 79.3795, elev: 480 },
        { lat: 13.6618, lon: 79.3680, elev: 640 },
        { lat: 13.6712, lon: 79.3568, elev: 770 },
        { lat: 13.6833, lon: 79.3474, elev: 853 },
      ],
    },
    {
      id: "srivari",
      name: "Srivari Mettu",
      color: "#fb923c",
      difficulty: "Steep",
      stats: { distanceKm: 2.1, steps: 2388, durationHr: 1.8 },
      waypoints: [
        { lat: 13.6555, lon: 79.3380, elev: 500 },
        { lat: 13.6612, lon: 79.3405, elev: 620 },
        { lat: 13.6678, lon: 79.3430, elev: 720 },
        { lat: 13.6741, lon: 79.3452, elev: 800 },
        { lat: 13.6833, lon: 79.3474, elev: 853 },
      ],
    },
  ],

  landmarks: [
    {
      id: "alipiri-gate",
      name: "Alipiri Padala Mandapam",
      lat: 13.6371, lon: 79.4015, elev: 220,
      type: "gateway",
      blurb: "The traditional starting arch. Pilgrims wash their feet at the sacred tank and apply turmeric paste before beginning the climb.",
      ritual: "Foot-wash · turmeric tilak",
    },
    {
      id: "gali-gopuram",
      name: "Gali Gopuram",
      lat: 13.6443, lon: 79.3895, elev: 320,
      type: "milestone",
      blurb: "The 'Tower of Winds' — first major rest point. A breeze always blows here, said to be the breath of Hanuman watching over the path.",
      ritual: "Coconut offering",
    },
    {
      id: "mokali-parvatham",
      name: "Mokali Mettu",
      lat: 13.6534, lon: 79.3795, elev: 480,
      type: "milestone",
      blurb: "The 'Knee Steps' — named for how the gradient pushes against the knees. Free buttermilk from TTD volunteers.",
      ritual: "Rest · hydration",
    },
    {
      id: "narasimha",
      name: "Narasimha Swamy Shrine",
      lat: 13.6618, lon: 79.3680, elev: 640,
      type: "shrine",
      blurb: "Cave shrine to the man-lion incarnation. Pilgrims pause for darshan and chant 'Govinda' before the steepest section.",
      ritual: "Govinda chant",
    },
    {
      id: "srivari-base",
      name: "Srivari Mettu Trailhead",
      lat: 13.6555, lon: 79.3380, elev: 500,
      type: "gateway",
      blurb: "Shorter, steeper alternative. Opens earlier in pre-dawn for serious devotees seeking expedited darshan tokens.",
      ritual: "Token registration",
    },
    {
      id: "tirumala-summit",
      name: "Sri Venkateswara Temple",
      lat: 13.6833, lon: 79.3474, elev: 853,
      type: "destination",
      blurb: "Journey's end. The Ananda Nilayam vimana rises gold over the seventh hill — the resting place of Lord Venkateswara.",
      ritual: "Darshan · laddu prasadam",
    },
  ],

  tours: [
    {
      id: "alipiri-ascent",
      name: "Alipiri footpath — the climb",
      subtitle: "From base gate to summit, the 11 km stone-stepped ascent",
      pois: ["alipiri-gate", "gali-gopuram", "mokali-parvatham", "narasimha", "tirumala-summit"],
      stats: { distanceKm: 11, durationHr: 4 },
      color: "#3b82f6",
    },
    {
      id: "srivari-ascent",
      name: "Srivari Mettu — the steep way",
      subtitle: "2 km, 2,388 steps, straight up the hill",
      pois: ["srivari-base", "tirumala-summit"],
      stats: { distanceKm: 2.1, durationHr: 1.8 },
      color: "#fb923c",
    },
    {
      id: "both-paths",
      name: "Both paths to Tirumala",
      subtitle: "The two stone-stepped routes side by side",
      pois: ["alipiri-gate", "srivari-base", "narasimha", "tirumala-summit"],
      stats: { distanceKm: 13, durationHr: 5.8 },
      color: "#a05a32",
    },
    {
      id: "summit-only",
      name: "Tirumala summit",
      subtitle: "Just the temple at the top — for a one-place film",
      pois: ["tirumala-summit"],
      stats: { distanceKm: 0, durationHr: 0 },
      color: "#8a4528",
    },
  ],

  topography: {
    basemap: "topo",
    zoom: 12.5,
    pitch: 50,
    bearing: -25,
    terrainExaggeration: 1.8,
  },

  region: {
    country: "India",
    state: "Andhra Pradesh",
    district: "Tirupati",
    governingBody: "Tirumala Tirupati Devasthanams (TTD)",
    timeZone: "Asia/Kolkata",
    advisories: [
      "Free TTD darshan tokens at Alipiri footpath base",
      "Plastic-free zone above Gali Gopuram",
      "Photography prohibited inside main temple complex",
      "Footwear removed past the divya darisanam counter",
    ],
  },

  culture: {
    accentColor: "#ff9d3a",
    motif: "lotus",
    invocation: "ॐ नमो वेङ्कटेशाय",
    summary:
      "An 853-metre ascent through the Seshachalam hills, undertaken on foot by " +
      "millions of devotees each year. Two stone-stepped paths climb from the " +
      "plains of Tirupati to the temple-town of Tirumala.",
  },

  units: { distance: "km", elevation: "m", temperature: "C" },
};

export default config;
