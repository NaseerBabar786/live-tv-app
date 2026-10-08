// Temperature and sky for the viewer's area (Weather.kt, Location.kt): geojs.io for the place,
// Open-Meteo for the weather. Fahrenheit where people use it.
const FAHRENHEIT = new Set(['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH']);

export function icon(code, day = true) {
  if (code === 0) return day ? '☀️' : '🌙';
  if (code === 1 || code === 2) return day ? '🌤️' : '☁️';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 51 && code <= 67) return '🌧️';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '❄️';
  if (code >= 80 && code <= 82) return '🌦️';
  if (code >= 95 && code <= 99) return '⛈️';
  return '🌡️';
}

let place = null;

/** "☀️ 21°C", or null when it can't be read. */
export async function now() {
  try {
    if (!place) place = await (await fetch('https://get.geojs.io/v1/ip/geo.json')).json();
    const f = FAHRENHEIT.has(String(place.country_code || '').toUpperCase());
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
      `&current=temperature_2m,weather_code,is_day${f ? '&temperature_unit=fahrenheit' : ''}`;
    const c = (await (await fetch(url)).json()).current;
    return `${icon(c.weather_code, c.is_day === 1)} ${Math.round(c.temperature_2m)}°${f ? 'F' : 'C'}`;
  } catch {
    return null;
  }
}
