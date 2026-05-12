/**
 * Real-time weather from Open-Meteo (free, no API key, CORS-enabled).
 */

export async function fetchWeather(lat, lon) {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code,is_day` +
      `&timezone=auto`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()).current;
  } catch (e) {
    console.warn("[weather] fetch failed:", e);
    return null;
  }
}

export const WMO_CODE = {
  0: ["Clear", "☀"],            1: ["Mostly clear", "🌤"],   2: ["Partly cloudy", "⛅"],
  3: ["Overcast", "☁"],         45: ["Fog", "🌫"],            48: ["Rime fog", "🌫"],
  51: ["Light drizzle", "🌦"],   53: ["Drizzle", "🌦"],        55: ["Heavy drizzle", "🌦"],
  61: ["Light rain", "🌧"],      63: ["Rain", "🌧"],           65: ["Heavy rain", "⛈"],
  80: ["Showers", "🌦"],         81: ["Showers", "🌦"],        82: ["Heavy showers", "⛈"],
  95: ["Thunderstorm", "⛈"],
};
