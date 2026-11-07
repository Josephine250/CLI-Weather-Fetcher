import axios from 'axios';
import { IkirereError, EXIT, usageError, httpStatusError } from './errors.js';

/** One place for every HTTP call: Axios request + friendly error translation. */
async function fetchJson(url, timeoutMs) {
  try {
    const res = await axios.get(url, {
      timeout: timeoutMs,
      responseType: 'json',
      headers: { accept: 'application/json', 'user-agent': 'ikirere-cli' },
    });
    // Axios silently returns a string when the body is not valid JSON.
    if (typeof res.data !== 'object' || res.data === null) {
      throw new IkirereError('The weather service sent a response ikirere could not read.', {
        exitCode: EXIT.API,
      });
    }
    return res.data;
  } catch (err) {
    if (err instanceof IkirereError) throw err;

    // Too slow: Axios reports ECONNABORTED (or ETIMEDOUT) when `timeout` is exceeded.
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      throw new IkirereError(`The weather service did not respond within ${timeoutMs / 1000}s.`, {
        exitCode: EXIT.TIMEOUT,
        hint: 'Try again, or raise IKIRERE_TIMEOUT_MS.',
      });
    }
    // The server answered with a non-2xx status: respect the real status code.
    if (err.response) {
      const body = err.response.data;
      throw httpStatusError(err.response.status, {
        reason: body && typeof body === 'object' ? body.reason : undefined,
        retryAfter: err.response.headers?.['retry-after'],
      });
    }
    // No response at all: offline, DNS failure, connection refused...
    throw new IkirereError('Could not reach the weather service.', {
      exitCode: EXIT.NETWORK,
      hint: 'Check your internet connection and try again.',
    });
  }
}

/** Step 1 of the chain: city name -> coordinates. */
export async function geocode(query, cfg) {
  const name = (query ?? '').trim();
  if (!name) throw usageError('Please give a city name, e.g. `ikirere Kigali`.');
  if (name.length > 100) throw usageError('That city name is too long.');

  const params = new URLSearchParams({ name, count: '1', language: 'en', format: 'json' });
  const data = await fetchJson(`${cfg.geocodingUrl}/v1/search?${params}`, cfg.timeoutMs);

  const hit = data?.results?.[0];
  if (!hit) {
    throw new IkirereError(`Could not find a place called "${name}".`, {
      exitCode: EXIT.NOT_FOUND,
      hint: 'Check the spelling, or try a nearby larger city.',
    });
  }
  return {
    name: hit.name,
    country: hit.country ?? '',
    admin1: hit.admin1 ?? '',
    latitude: hit.latitude,
    longitude: hit.longitude,
    elevation: hit.elevation ?? null,
    timezone: hit.timezone ?? null,
    population: hit.population ?? null,
  };
}

/** Step 2 of the chain: coordinates -> current weather + daily forecast. */
export async function getForecast(place, { units, days }, cfg) {
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: [
      'temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'weather_code',
      'precipitation', 'cloud_cover', 'pressure_msl',
      'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'is_day',
    ].join(','),
    daily: [
      'weather_code', 'temperature_2m_max', 'temperature_2m_min',
      'precipitation_sum', 'precipitation_probability_max',
      'wind_speed_10m_max', 'uv_index_max', 'sunrise', 'sunset',
    ].join(','),
    timezone: 'auto',
    forecast_days: String(days),
  });
  if (units === 'imperial') {
    params.set('temperature_unit', 'fahrenheit');
    params.set('wind_speed_unit', 'mph');
    params.set('precipitation_unit', 'inch');
  }
  const data = await fetchJson(`${cfg.forecastUrl}/v1/forecast?${params}`, cfg.timeoutMs);
  if (!data?.current || !data?.daily) {
    throw new IkirereError('The weather service returned incomplete data.', { exitCode: EXIT.API });
  }
  return data;
}