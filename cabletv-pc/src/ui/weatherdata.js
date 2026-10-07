// The Weather section's forecast (WeatherApp.kt): Open-Meteo for the weather and air quality, the US
// weather service's warnings, Google News for weather stories. No accounts or keys. Pure functions
// first (tested in test/ui.test.mjs), then the loading.
import { icon } from './weather.js';

const FAHRENHEIT = new Set(['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH']);
export const isFahrenheitCountry = (cc) => FAHRENHEIT.has(String(cc || '').toUpperCase());

export const PARTS = [['Morning', 6, 10], ['Noon', 11, 13], ['Afternoon', 14, 17], ['Evening', 18, 21], ['Night', 22, 23]];
const PART_END = { Morning: 11, Noon: 14, Afternoon: 18, Evening: 22, Night: 6 };

export function describe(code) {
  const words = {
    0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Cloudy', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle',
    55: 'Drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
    66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
    80: 'Light showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorms',
    96: 'Thunderstorms with hail', 99: 'Thunderstorms with hail',
  };
  return words[code] || '—';
}

export const airLabel = (a) => a <= 50 ? 'Good' : a <= 100 ? 'Moderate' : a <= 150 ? 'Unhealthy for some' : a <= 200 ? 'Unhealthy' : a <= 300 ? 'Very unhealthy' : 'Hazardous';
export const uvLabel = (u) => u <= 2 ? 'Low' : u <= 5 ? 'Moderate' : u <= 7 ? 'High' : u <= 10 ? 'Very high' : 'Extreme';
export const compass = (deg) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((deg % 360) + 360) % 360) / 45) % 8];
export const hourLabel = (h) => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;

/** "7:15 AM" from "2026-10-07T07:15". */
export function clock(t) {
  if (!t || t.length < 16) return '';
  const h = +t.slice(11, 13);
  return `${h % 12 === 0 ? 12 : h % 12}:${t.slice(14, 16)} ${h < 12 ? 'AM' : 'PM'}`;
}

const asDate = (d) => new Date(`${d.slice(0, 10)}T00:00:00Z`);
export function nextDate(d) {
  const x = asDate(d);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
}
export function dayName(d, today) {
  if (d === today) return 'Today';
  if (d === nextDate(today)) return 'Tomorrow';
  return asDate(d).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}
export const shortDate = (d) => asDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const r0 = (v) => Math.round(Number(v) || 0);

/** Open-Meteo's answer to a report (WeatherApp.parse). */
export function parse(json, place, fahrenheit) {
  const c = json.current;
  const vis = c.visibility == null ? null : Math.round(fahrenheit ? c.visibility / 5280 : c.visibility / 1000);
  const current = {
    temperature: r0(c.temperature_2m), feelsLike: r0(c.apparent_temperature ?? c.temperature_2m), code: c.weather_code | 0,
    day: c.is_day !== 0, humidity: r0(c.relative_humidity_2m), wind: r0(c.wind_speed_10m), windFrom: compass(c.wind_direction_10m || 0),
    gusts: r0(c.wind_gusts_10m), pressure: r0(c.pressure_msl), uv: r0(c.uv_index), visibility: vis, clouds: r0(c.cloud_cover), dewPoint: r0(c.dew_point_2m),
  };
  const h = json.hourly;
  const hours = h.time.map((time, i) => ({
    time, date: time.slice(0, 10), hour: +time.slice(11, 13), temperature: r0(h.temperature_2m[i]),
    feelsLike: r0(h.apparent_temperature?.[i]), code: h.weather_code[i] | 0, day: h.is_day?.[i] !== 0,
    rain: r0(h.precipitation_probability?.[i]), wind: r0(h.wind_speed_10m?.[i]),
  }));
  const d = json.daily;
  const days = d.time.map((date, i) => ({
    date, code: d.weather_code[i] | 0, high: r0(d.temperature_2m_max[i]), low: r0(d.temperature_2m_min[i]),
    rain: r0(d.precipitation_probability_max?.[i]), rainAmount: Number(d.precipitation_sum?.[i]) || 0, snow: Number(d.snowfall_sum?.[i]) || 0,
    sunrise: d.sunrise?.[i] || '', sunset: d.sunset?.[i] || '', uv: r0(d.uv_index_max?.[i]), wind: r0(d.wind_speed_10m_max?.[i]),
  }));
  return {
    place, fahrenheit, now: c.time || hours[0]?.time || '', current, hours, days, airQuality: null, alerts: [],
    unit: fahrenheit ? 'F' : 'C', speed: fahrenheit ? 'mph' : 'km/h', distance: fahrenheit ? 'mi' : 'km',
  };
}

export function hoursFromNow(r, count = 24) {
  let start = r.hours.findIndex((x) => x.time.slice(0, 13) >= r.now.slice(0, 13));
  if (start < 0) start = 0;
  return r.hours.slice(start, start + count);
}

/** Morning, Noon, Afternoon, Evening and Night of [date] (the night runs into the next morning). */
export function partsOf(r, date) {
  const next = nextDate(date);
  return PARTS.map(([name, a, b]) => {
    const inPart = r.hours.filter((x) => name === 'Night'
      ? (x.date === date && x.hour >= a) || (x.date === next && x.hour < 6)
      : x.date === date && x.hour >= a && x.hour <= b);
    if (!inPart.length) return null;
    const avg = (k) => Math.round(inPart.reduce((s, x) => s + x[k], 0) / inPart.length);
    return {
      name, date, code: Math.max(...inPart.map((x) => x.code)), day: name !== 'Night' && name !== 'Evening',
      temperature: name === 'Night' ? Math.min(...inPart.map((x) => x.temperature)) : avg('temperature'),
      feelsLike: avg('feelsLike'), rain: Math.max(...inPart.map((x) => x.rain)),
    };
  }).filter(Boolean);
}

export function partsFromNow(r, count = 5) {
  const now = r.now.slice(0, 13);
  const end = (p) => (p.name === 'Night' ? nextDate(p.date) : p.date) + 'T' + String(PART_END[p.name]).padStart(2, '0');
  return r.days.slice(0, 3).flatMap((d) => partsOf(r, d.date)).filter((p) => end(p) > now).slice(0, count);
}

export function tip(r) {
  const c = r.current;
  const feel = r.fahrenheit ? (c.feelsLike - 32) * 5 / 9 : c.feelsLike;
  const wear = feel <= -15 ? 'Very cold: a winter coat, hat, gloves and scarf.'
    : feel <= 0 ? 'Cold: a warm coat, hat and gloves.'
      : feel <= 10 ? 'Chilly: a jacket or a warm sweater.'
        : feel <= 18 ? 'Cool: a light jacket or a long-sleeved top.'
          : feel <= 27 ? 'Pleasant: light clothes are fine.' : 'Hot: light clothes, drink lots of water.';
  const next = hoursFromNow(r, 12);
  const rain = Math.max(0, ...next.map((x) => x.rain));
  const snow = next.some((x) => (x.code >= 71 && x.code <= 77) || x.code === 85 || x.code === 86);
  const extra = rain >= 50 && snow ? ' Snow likely: boots on.'
    : rain >= 50 ? ' Rain likely: take an umbrella.'
      : rain >= 30 ? ' A chance of rain: an umbrella might help.'
        : (r.days[0]?.uv || 0) >= 7 ? ' Strong sun: sunglasses and sunscreen.' : '';
  return wear + extra;
}

/** Warnings worked out from the forecast, for today and tomorrow. */
export function headsUp(r) {
  const out = [];
  const F = r.fahrenheit;
  const src = 'From the forecast';
  r.days.slice(0, 2).forEach((d, i) => {
    const w = i === 0 ? 'today' : 'tomorrow';
    const hi = F ? (d.high - 32) * 5 / 9 : d.high;
    const lo = F ? (d.low - 32) * 5 / 9 : d.low;
    const wind = F ? d.wind * 1.609 : d.wind;
    const mm = F ? d.rainAmount * 25.4 : d.rainAmount;
    const cm = F ? d.snow * 2.54 : d.snow;
    const amt = (v) => F ? `${v.toFixed(1)} in` : `${Math.round(v)} mm`;
    const snowAmt = (v) => F ? `${v.toFixed(1)} in` : `${Math.round(v)} cm`;
    if (d.code >= 95) out.push({ title: `Thunderstorms ${w}`, text: `Storms are expected ${w}. Stay indoors when you hear thunder.`, severe: true, source: src });
    if (mm >= 25) out.push({ title: `Heavy rain ${w}`, text: `About ${amt(d.rainAmount)} of rain is expected ${w}.`, severe: mm >= 50, source: src });
    if (cm >= 5) out.push({ title: `Snow ${w}`, text: `About ${snowAmt(d.snow)} of snow is expected ${w}. Roads may be slippery.`, severe: cm >= 15, source: src });
    if (hi >= 32) out.push({ title: `Heat ${w}`, text: `It will reach ${d.high}°${r.unit} ${w}. Drink water and stay out of the midday sun.`, severe: hi >= 38, source: src });
    if (lo <= -20) out.push({ title: `Extreme cold ${w}`, text: `It will go down to ${d.low}°${r.unit} ${w}. Cover your skin outside.`, severe: lo <= -30, source: src });
    if (wind >= 60) out.push({ title: `Strong wind ${w}`, text: `Winds up to ${d.wind} ${r.speed} ${w}.`, severe: wind >= 90, source: src });
    if (i === 0 && d.uv >= 8) out.push({ title: 'Very strong sun today', text: `The UV index reaches ${d.uv}. Use sunscreen and a hat.`, severe: false, source: src });
  });
  if ((r.airQuality || 0) > 100) out.push({ title: 'Poor air quality', text: `The air quality index is ${r.airQuality} (${airLabel(r.airQuality)}). People with breathing problems should stay indoors.`, severe: r.airQuality > 150, source: src });
  return out;
}

const unescape = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** Google News RSS items: title (without " - Source"), source, link, time. */
export function parseNews(xml) {
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map(([item]) => {
    const tag = (n) => { const m = new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`).exec(item); return m ? unescape(m[1]) : null; };
    const source = tag('source') || '';
    let title = tag('title');
    const link = tag('link');
    if (!title || !link) return null;
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const t = Date.parse(tag('pubDate') || '');
    return { title, source, link, published: Number.isNaN(t) ? 0 : t };
  }).filter(Boolean);
}

export function parseNws(json) {
  const seen = new Set();
  return (json.features || []).map((f) => f.properties || {}).filter((p) => p.event && !seen.has(p.event) && seen.add(p.event))
    .map((p) => ({ title: p.event, text: String(p.headline || p.description || '').replace(/\s+/g, ' ').trim(), severe: ['Extreme', 'Severe'].includes(p.severity), source: 'US National Weather Service' }));
}

export function ago(t, now = Date.now()) {
  if (!t) return '';
  const m = Math.floor((now - t) / 60000);
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : m < 2880 ? 'Yesterday' : `${Math.floor(m / 1440)} days ago`;
}

export { icon };

// ---------- Loading ----------

export function forecastUrl(p, f) {
  return `https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,' +
    'wind_direction_10m,wind_gusts_10m,pressure_msl,uv_index,visibility,cloud_cover,dew_point_2m' +
    '&hourly=temperature_2m,apparent_temperature,weather_code,precipitation_probability,is_day,wind_speed_10m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,' +
    'snowfall_sum,sunrise,sunset,uv_index_max,wind_speed_10m_max&timezone=auto&forecast_days=10' +
    (f ? '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch' : '');
}

export function radarUrl(p, f) {
  return `https://embed.windy.com/embed2.html?lat=${p.latitude}&lon=${p.longitude}&detailLat=${p.latitude}&detailLon=${p.longitude}` +
    `&zoom=7&level=surface&overlay=rain&product=ecmwf&menu=&message=true&marker=true&calendar=now&pressure=&type=map` +
    `&location=coordinates&detail=&metricWind=${f ? 'mph' : 'km%2Fh'}&metricTemp=${f ? '%C2%B0F' : '%C2%B0C'}&radarRange=-1`;
}

const cache = new Map();
const getJson = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };

/** The full report for [place] (kept 15 minutes); null when Open-Meteo can't be reached. */
export async function load(place, { fahrenheit = null, fresh = false } = {}) {
  const key = `${place.latitude.toFixed(2)},${place.longitude.toFixed(2)},${fahrenheit}`;
  const c = cache.get(key);
  if (c && !fresh && Date.now() - c.at < 15 * 60000) return c.report;
  const f = fahrenheit ?? isFahrenheitCountry(place.country);
  let report;
  try { report = parse(await getJson(forecastUrl(place, f)), place, f); } catch { return null; }
  try { report.airQuality = Math.round((await getJson(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${place.latitude}&longitude=${place.longitude}&current=us_aqi`)).current.us_aqi); } catch {}
  if (place.country === 'US') {
    try { report.alerts = parseNws(await getJson(`https://api.weather.gov/alerts/active?point=${place.latitude.toFixed(4)},${place.longitude.toFixed(4)}`)); } catch {}
  }
  cache.set(key, { at: Date.now(), report });
  return report;
}

export async function stories(place) {
  const [hl, gl] = ({ CA: ['en-CA', 'CA'], US: ['en-US', 'US'], GB: ['en-GB', 'GB'], PK: ['en-PK', 'PK'], IN: ['en-IN', 'IN'], AU: ['en-AU', 'AU'] })[place.country] || ['en-US', 'US'];
  const feed = async (q) => {
    try {
      const r = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${hl}&gl=${gl}&ceid=${gl}:en`);
      return r.ok ? parseNews(await r.text()) : [];
    } catch { return []; }
  };
  const local = place.city ? (await feed(`${place.city} weather when:7d`)).slice(0, 12) : [];
  const wide = await feed('weather forecast OR storm OR heat wave OR snowstorm when:2d');
  const seen = new Set();
  return [...local, ...wide].filter((s) => !seen.has(s.title.toLowerCase()) && seen.add(s.title.toLowerCase())).slice(0, 24);
}

/** Places matching [name] (Open-Meteo's place search). */
export async function search(name) {
  try {
    const j = await getJson(`https://geocoding-api.open-meteo.com/v1/search?count=8&language=en&format=json&name=${encodeURIComponent(name.trim())}`);
    return (j.results || []).map((o) => ({
      latitude: o.latitude, longitude: o.longitude, city: o.name || '', country: String(o.country_code || '').toUpperCase(),
      region: [o.admin1, o.country].filter(Boolean).join(', '),
    }));
  } catch { return []; }
}

let mine = null;
/** Where this PC is, from its internet connection (geojs.io). */
export async function myPlace() {
  if (mine) return mine;
  try {
    const o = await getJson('https://get.geojs.io/v1/ip/geo.json');
    mine = { latitude: +o.latitude, longitude: +o.longitude, city: o.city || '', country: String(o.country_code || '').toUpperCase(), region: o.region || '' };
  } catch { mine = null; }
  return mine;
}
