/** @type {import("./schema").LocationConfig} */
const config = {
  id: "yadagirigutta",
  title: "Yadagiri Hill",
  subtitle: "The Telangana ascent to Lakshmi Narasimha",

  bounds: {
    latMin: 17.580, latMax: 17.605,
    lonMin: 78.925, lonMax: 78.955,
  },

  origin:      { name: "Yadagirigutta town", lat: 17.5868, lon: 78.9380, elev: 485 },
  destination: { name: "Yadadri temple", lat: 17.5945, lon: 78.9408, elev: 720 },

  mode: "mixed",

  routes: [
    {
      id: "ghat-road",
      name: "Yadadri Ghat road",
      color: "#8a4528",
      difficulty: "Moderate",
      stats: { distanceKm: 3.2, durationHr: 1.0 },
      waypoints: [
        { lat: 17.5868, lon: 78.9380, elev: 485 },  // Town base
        { lat: 17.5885, lon: 78.9385, elev: 520 },  // First switchback
        { lat: 17.5900, lon: 78.9388, elev: 565 },  // Second switchback
        { lat: 17.5915, lon: 78.9392, elev: 610 },  // Pancha Narasimha cave gateway
        { lat: 17.5930, lon: 78.9398, elev: 655 },  // Temple gateway / Rajagopuram
        { lat: 17.5938, lon: 78.9403, elev: 690 },  // Outer prakaram
        { lat: 17.5945, lon: 78.9408, elev: 720 },  // Sri Lakshmi Narasimha Swamy
      ],
    },
  ],

  landmarks: [
    {
      id: "town-base",
      name: "Yadagirigutta town",
      lat: 17.5868, lon: 78.9380, elev: 485,
      type: "gateway",
      blurb: "The plains village from which the hill rises sharply. Pilgrims wash, eat at the langar, and begin the climb here. The new Yadadri development has paved roads to the top, but many still walk.",
      ritual: "Prasadam · sacred bath",
    },
    {
      id: "pancha-narasimha",
      name: "Pancha Narasimha cave",
      lat: 17.5915, lon: 78.9392, elev: 610,
      type: "milestone",
      blurb: "A natural cave shrine on the western face of the hill where five forms of Narasimha are believed to manifest. The original cave temple — restored as part of the Yadadri reconstruction completed in 2022.",
      ritual: "Pradakshina · cave darshan",
    },
    {
      id: "rajagopuram",
      name: "Rajagopuram",
      lat: 17.5930, lon: 78.9398, elev: 655,
      type: "milestone",
      blurb: "The grand entrance tower of the rebuilt Yadadri temple complex. Carved from black granite quarried locally and clad in 125 kg of gold leaf, it is one of the tallest temple gopurams in southern India.",
    },
    {
      id: "outer-prakaram",
      name: "Outer prakaram",
      lat: 17.5938, lon: 78.9403, elev: 690,
      type: "milestone",
      blurb: "The first circumambulatory passage around the sanctum, paved with the same black Krishna-shila granite that lines the entire reconstructed complex.",
    },
    {
      id: "lakshmi-narasimha",
      name: "Sri Lakshmi Narasimha Swamy",
      lat: 17.5945, lon: 78.9408, elev: 720,
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
