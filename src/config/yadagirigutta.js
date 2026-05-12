/** @type {import("./schema").LocationConfig} */
const config = {
  id: "yadagirigutta",
  title: "Yadagiri Hill",
  subtitle: "The Telangana ascent to Lakshmi Narasimha",

  bounds: {
    latMin: 17.590, latMax: 17.608,
    lonMin: 78.940, lonMax: 78.958,
  },

  origin:      { name: "Yadagirigutta town", lat: 17.5970, lon: 78.9450, elev: 470 },
  destination: { name: "Yadadri temple", lat: 17.5995, lon: 78.9495, elev: 570 },

  mode: "mixed",

  routes: [
    {
      id: "ghat-road",
      name: "Yadadri Ghat road",
      color: "#8a4528",
      difficulty: "Moderate",
      stats: { distanceKm: 3.0, durationHr: 1.0 },
      waypoints: [
        { lat: 17.5970, lon: 78.9450, elev: 470 },  // Town base — Yadagirigutta bus stand
        { lat: 17.5978, lon: 78.9458, elev: 490 },  // Foothill — climb begins
        { lat: 17.5968, lon: 78.9468, elev: 510 },  // First switchback (south)
        { lat: 17.5985, lon: 78.9472, elev: 530 },  // Pancha Narasimha cave gateway
        { lat: 17.5982, lon: 78.9485, elev: 550 },  // Rajagopuram approach
        { lat: 17.5990, lon: 78.9490, elev: 562 },  // Outer prakaram
        { lat: 17.5995, lon: 78.9495, elev: 570 },  // Sri Lakshmi Narasimha Swamy — hilltop sanctum
      ],
    },
  ],

  landmarks: [
    {
      id: "town-base",
      name: "Yadagirigutta town",
      lat: 17.5970, lon: 78.9450, elev: 470,
      type: "gateway",
      blurb: "The plains village from which the hill rises sharply. Pilgrims wash, eat at the langar, and begin the climb here. The new Yadadri development has paved roads to the top, but many still walk.",
      ritual: "Prasadam · sacred bath",
    },
    {
      id: "pancha-narasimha",
      name: "Pancha Narasimha cave",
      lat: 17.5985, lon: 78.9472, elev: 530,
      type: "milestone",
      blurb: "A natural cave shrine on the western face of the hill where five forms of Narasimha are believed to manifest. The original cave temple — restored as part of the Yadadri reconstruction completed in 2022.",
      ritual: "Pradakshina · cave darshan",
    },
    {
      id: "rajagopuram",
      name: "Rajagopuram",
      lat: 17.5982, lon: 78.9485, elev: 550,
      type: "milestone",
      blurb: "The grand entrance tower of the rebuilt Yadadri temple complex. Carved from black granite quarried locally and clad in 125 kg of gold leaf, it is one of the tallest temple gopurams in southern India.",
    },
    {
      id: "outer-prakaram",
      name: "Outer prakaram",
      lat: 17.5990, lon: 78.9490, elev: 562,
      type: "milestone",
      blurb: "The first circumambulatory passage around the sanctum, paved with the same black Krishna-shila granite that lines the entire reconstructed complex.",
    },
    {
      id: "lakshmi-narasimha",
      name: "Sri Lakshmi Narasimha Swamy",
      lat: 17.5995, lon: 78.9495, elev: 570,
      type: "destination",
      blurb: "The presiding deity of Yadadri: Vishnu in his fierce man-lion avatar, here consort to Lakshmi in a benevolent posture. The sanctum was rebuilt and reconsecrated in March 2022 after a multi-decade reconstruction overseen by the Telangana state government.",
      ritual: "Abhishekam · darshan",
    },
  ],

  topography: {
    basemap: "imagery",
    zoom: 14,
    pitch: 50,
    bearing: -30,
    terrainExaggeration: 1.3,
  },

  region: {
    country: "India",
    state: "Telangana",
    district: "Yadadri Bhuvanagiri",
    governingBody: "Yadadri Sri Lakshmi Narasimha Swamy Devasthanam",
    timeZone: "Asia/Kolkata",
    advisories: [
      "Dress code enforced: men in dhoti or pants, women in saree or salwar.",
      "Phones / cameras not permitted in the sanctum.",
      "Free bus service from Hyderabad / Bhongir on weekends.",
    ],
  },

  culture: {
    accentColor: "#8a4528",
    motif: "black-granite hill shrine",
    invocation: "ஓம் ஶ்ரீ லக்ஷ்மீ நரஸிம்ஹாய நமஃ",
    summary:
      "Telangana's youngest great pilgrimage and one of its oldest. The hill has been a Narasimha shrine for at least a millennium; the granite temple that crowns it now is a generation old. The climb takes an hour; the view from the top, the entire Deccan plateau falling away east.",
  },

  units: { distance: "km", elevation: "m", temperature: "C" },
};

export default config;
