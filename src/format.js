// WMO weather codes used by Open-Meteo -> [icon, description]
const CODES = {
  0: ['☀️', 'Clear sky'], 1: ['🌤️', 'Mainly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'],
  45: ['🌫️', 'Fog'], 48: ['🌫️', 'Rime fog'],
  51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌦️', 'Heavy drizzle'],
  56: ['🌧️', 'Freezing drizzle'], 57: ['🌧️', 'Freezing drizzle'],
  61: ['🌧️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'],
  66: ['🌧️', 'Freezing rain'], 67: ['🌧️', 'Freezing rain'],
  71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'], 77: ['❄️', 'Snow grains'],
  80: ['🌦️', 'Light showers'], 81: ['🌧️', 'Showers'], 82: ['⛈️', 'Violent showers'],
  85: ['🌨️', 'Snow showers'], 86: ['🌨️', 'Heavy snow showers'],
  95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm, hail'], 99: ['⛈️', 'Thunderstorm, heavy hail'],
};
const describe = (code) => CODES[code] ?? ['🌡️', 'Unknown'];

export function makePaint(enabled) {
  const wrap = (open) => (s) => (enabled ? `\x1b[${open}m${s}\x1b[0m` : String(s));
  return { bold: wrap(1), dim: wrap(2), cyan: wrap(36), red: wrap(31), yellow: wrap(33) };
}

export const placeLabel = (p) => [p.name, p.country].filter(Boolean).join(', ');

const day = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC',
  });

const has = (v) => v !== undefined && v !== null;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const compass = (deg) => COMPASS[Math.round(deg / 45) % 8];
const hhmm = (iso) => String(iso).slice(11, 16);

/** Second header line: region, coordinates, elevation, timezone (whatever we know). */
function placeDetail(p) {
  const parts = [];
  if (p.admin1 && p.admin1 !== p.name) parts.push(p.admin1);
  if (has(p.latitude)) parts.push(`${p.latitude.toFixed(2)}°, ${p.longitude.toFixed(2)}°`);
  if (has(p.elevation)) parts.push(`${Math.round(p.elevation)} m elevation`);
  if (p.timezone) parts.push(p.timezone);
  return parts.join(' · ');
}

export function renderWeather(place, data, paint) {
  const c = data.current;
  const u = data.current_units ?? {};
  const d = data.daily;
  const du = data.daily_units ?? {};
  const [icon, text] = describe(c.weather_code);
  const dayNight = has(c.is_day) ? (c.is_day ? ', daytime' : ', night') : '';

  const lines = [paint.bold(placeLabel(place))];
  const detail = placeDetail(place);
  if (detail) lines.push(paint.dim(detail));

  lines.push(
    `${icon}  ${paint.bold(`${Math.round(c.temperature_2m)}${u.temperature_2m ?? ''}`)}  ${text}` +
      paint.dim(`  (feels like ${Math.round(c.apparent_temperature)}${u.apparent_temperature ?? ''}${dayNight})`),
  );

  const air = [`Humidity ${c.relative_humidity_2m}${u.relative_humidity_2m ?? ''}`];
  if (has(c.cloud_cover)) air.push(`Cloud cover ${c.cloud_cover}${u.cloud_cover ?? ''}`);
  if (has(c.pressure_msl)) air.push(`Pressure ${Math.round(c.pressure_msl)} ${u.pressure_msl ?? ''}`.trim());
  if (has(c.precipitation)) air.push(`Rain now ${c.precipitation} ${u.precipitation ?? ''}`.trim());
  lines.push(paint.dim(air.join(' · ')));

  let wind = `Wind ${c.wind_speed_10m} ${u.wind_speed_10m ?? ''}`.trim();
  if (has(c.wind_direction_10m)) wind += ` from ${compass(c.wind_direction_10m)}`;
  if (has(c.wind_gusts_10m)) wind += ` (gusts ${c.wind_gusts_10m} ${u.wind_gusts_10m ?? ''})`.replace(' )', ')');
  lines.push(paint.dim(wind));

  const sun = [];
  if (d.sunrise?.[0]) sun.push(`Sunrise ${hhmm(d.sunrise[0])}`);
  if (d.sunset?.[0]) sun.push(`Sunset ${hhmm(d.sunset[0])}`);
  if (has(d.uv_index_max?.[0])) sun.push(`UV index today ${Math.round(d.uv_index_max[0])}`);
  if (sun.length) lines.push(paint.dim(sun.join(' · ')));
  lines.push('');

  const width = Math.max(...d.weather_code.map((x) => describe(x)[1].length));
  d.time.forEach((t, i) => {
    const [dIcon, dText] = describe(d.weather_code[i]);
    const lo = `${Math.round(d.temperature_2m_min[i])}°`;
    const hi = `${Math.round(d.temperature_2m_max[i])}°`;
    let extra = `rain ${d.precipitation_sum[i]} ${du.precipitation_sum ?? ''}`.trim();
    if (has(d.precipitation_probability_max?.[i])) extra += ` (${d.precipitation_probability_max[i]}%)`;
    if (has(d.wind_speed_10m_max?.[i])) extra += `  wind ${Math.round(d.wind_speed_10m_max[i])} ${du.wind_speed_10m_max ?? ''}`.trimEnd();
    if (has(d.uv_index_max?.[i])) extra += `  UV ${Math.round(d.uv_index_max[i])}`;
    lines.push(
      `${paint.cyan(day(t))}  ${dIcon}  ${dText.padEnd(width)}  ${lo.padStart(4)} / ${hi.padEnd(4)}` +
        paint.dim(`  ${extra}`),
    );
  });
  return lines.join('\n');
}

export function renderFavourites(list, paint) {
  if (!list.length) return paint.dim('No favourites yet. Add one with: ikirere fav add <city>');
  return list.map((p, i) => `${i + 1}. ${placeLabel(p)}`).join('\n');
}

export function renderHistory(list, paint) {
  if (!list.length) return paint.dim('No searches yet.');
  return [...list]
    .reverse()
    .map((h) => `${paint.dim(h.at.replace('T', ' ').slice(0, 16))}  ${h.place}`)
    .join('\n');
}