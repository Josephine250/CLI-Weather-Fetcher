import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { main } from '../src/cli.js';

let server, base, home;

const FORECAST = {
  current_units: { temperature_2m: '°C', apparent_temperature: '°C', relative_humidity_2m: '%', wind_speed_10m: 'km/h', wind_gusts_10m: 'km/h', cloud_cover: '%', pressure_msl: 'hPa', precipitation: 'mm' },
  current: { temperature_2m: 22.4, apparent_temperature: 21.9, relative_humidity_2m: 60, weather_code: 2, wind_speed_10m: 8.3, wind_direction_10m: 45, wind_gusts_10m: 15.1, cloud_cover: 40, pressure_msl: 1015.2, precipitation: 0, is_day: 1 },
  daily_units: { precipitation_sum: 'mm', wind_speed_10m_max: 'km/h' },
  daily: {
    time: ['2026-11-07', '2026-11-08', '2026-11-09'],
    weather_code: [2, 61, 95],
    temperature_2m_max: [26.1, 24.8, 23.2],
    temperature_2m_min: [14.2, 14.9, 15.0],
    precipitation_sum: [0, 4.2, 12.5],
    precipitation_probability_max: [20, 70, 90],
    wind_speed_10m_max: [12.4, 15.0, 22.7],
    uv_index_max: [11.2, 9.0, 6.5],
    sunrise: ['2026-11-07T05:48', '2026-11-08T05:48', '2026-11-09T05:47'],
    sunset: ['2026-11-07T17:51', '2026-11-08T17:51', '2026-11-09T17:52'],
  },
};

before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (url.pathname === '/v1/search') {
      const name = url.searchParams.get('name');
      if (name === 'Slowville') return setTimeout(() => json(200, {}), 1000);
      if (name === 'Brokenville') return json(500, {});
      if (name === 'Badville') return json(400, { error: true, reason: 'Parameter name is invalid' });
      if (name === 'Missingville') return json(404, {});
      if (name === 'Limitville') { res.setHeader('retry-after', '30'); return json(429, {}); }
      if (name === 'Forbidville') return json(403, {});
      if (name === 'Gatewayville') return json(504, {});
      if (name === 'Nowhereland') return json(200, { generationtime_ms: 0.1 }); // no "results"
      return json(200, { results: [{ name, country: 'Rwanda', admin1: 'Kigali City', latitude: -1.95, longitude: 30.06, elevation: 1567, timezone: 'Africa/Kigali' }] });
    }
    if (url.pathname === '/v1/forecast') return json(200, FORECAST);
    json(404, {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());
beforeEach(async () => { home = await mkdtemp(path.join(os.tmpdir(), 'ikirere-')); });

async function run(args, extraEnv = {}) {
  let out = '', err = '';
  const code = await main(args, {
    stdout: { write: (s) => (out += s), isTTY: false },
    stderr: { write: (s) => (err += s), isTTY: false },
    env: { IKIRERE_HOME: home, IKIRERE_GEOCODING_URL: base, IKIRERE_FORECAST_URL: base, ...extraEnv },
  });
  return { code, out, err };
}

test('shows weather for a city and records history', async () => {
  const r = await run(['Kigali']);
  assert.equal(r.code, 0);
  assert.match(r.out, /Kigali, Rwanda/);
  assert.match(r.out, /22°C/);
  assert.match(r.out, /Thunderstorm/);
  const saved = JSON.parse(await readFile(path.join(home, 'data.json'), 'utf8'));
  assert.equal(saved.history.length, 1);
});

test('shows extra details: sun times, pressure, wind direction, UV, rain chance', async () => {
  const r = await run(['Kigali']);
  for (const piece of ['Sunrise 05:48', 'Sunset 17:51', 'Pressure 1015 hPa', 'Cloud cover 40%',
    'from NE', 'gusts 15.1 km/h', 'UV index today 11', '(70%)', '1567 m elevation', 'Africa/Kigali']) {
    assert.ok(r.out.includes(piece), `missing "${piece}" in:\n${r.out}`);
  }
});

test('--json prints machine-readable output', async () => {
  const r = await run(['Kigali', '--json']);
  assert.equal(JSON.parse(r.out).place.name, 'Kigali');
});

test('multi-word city names work', async () => {
  const r = await run(['New', 'York']);
  assert.match(r.out, /New York/);
});

test('unknown city -> exit 3', async () => {
  const r = await run(['Nowhereland']);
  assert.equal(r.code, 3);
  assert.match(r.err, /Could not find/);
});

test('timeout -> exit 5', async () => {
  const r = await run(['Slowville'], { IKIRERE_TIMEOUT_MS: '100' });
  assert.equal(r.code, 5);
});

test('service error -> exit 6', async () => {
  assert.equal((await run(['Brokenville'])).code, 6);
});

test('real HTTP status codes are respected', async () => {
  const bad = await run(['Badville']);
  assert.equal(bad.code, 2);
  assert.match(bad.err, /HTTP 400/);
  assert.match(bad.err, /Parameter name is invalid/);

  const missing = await run(['Missingville']);
  assert.equal(missing.code, 3);
  assert.match(missing.err, /HTTP 404/);

  const limited = await run(['Limitville']);
  assert.equal(limited.code, 7);
  assert.match(limited.err, /HTTP 429/);
  assert.match(limited.err, /Wait 30s/);

  assert.equal((await run(['Forbidville'])).code, 6);
  assert.equal((await run(['Gatewayville'])).code, 5);
  const server500 = await run(['Brokenville']);
  assert.equal(server500.code, 6);
  assert.match(server500.err, /HTTP 500/);
});

test('network failure -> exit 4', async () => {
  const r = await run(['Kigali'], { IKIRERE_GEOCODING_URL: 'http://127.0.0.1:1' });
  assert.equal(r.code, 4);
});

test('bad input -> exit 2', async () => {
  assert.equal((await run(['Kigali', '--days', '99'])).code, 2);
  assert.equal((await run(['Kigali', '--nope'])).code, 2);
  assert.equal((await run(['Kigali', '--units', 'kelvin'])).code, 2);
  assert.equal((await run(['fav', 'add'])).code, 2);
  assert.equal((await run(['Kigali'], { IKIRERE_TIMEOUT_MS: 'abc' })).code, 2);
});

test('favourites persist: add, list, weather, remove', async () => {
  assert.match((await run(['fav', 'add', 'Kigali'])).out, /Added Kigali/);
  assert.match((await run(['fav', 'add', 'Kigali'])).out, /already/);
  assert.match((await run(['fav', 'list'])).out, /1\. Kigali, Rwanda/);
  assert.match((await run(['fav', 'weather'])).out, /22°C/);
  assert.match((await run(['fav', 'remove', 'kigali'])).out, /Removed/);
  assert.equal((await run(['fav', 'remove', 'kigali'])).code, 3);
});

test('settings: default city and units, env override', async () => {
  await run(['config', 'set', 'default-city', 'Kigali']);
  assert.match((await run([])).out, /Kigali, Rwanda/);
  await run(['config', 'set', 'units', 'imperial']);
  assert.match((await run(['config'])).out, /imperial/);
  assert.equal((await run(['config', 'set', 'units', 'kelvin'])).code, 2);
});

test('history can be listed and cleared', async () => {
  await run(['Kigali']);
  assert.match((await run(['history'])).out, /Kigali, Rwanda/);
  await run(['history', '--clear']);
  assert.match((await run(['history'])).out, /No searches/);
});

test('--no-history skips recording', async () => {
  await run(['Kigali', '--no-history']);
  assert.match((await run(['history'])).out, /No searches/);
});

test('corrupt data file gives a friendly error', async () => {
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(home, { recursive: true });
  await writeFile(path.join(home, 'data.json'), '{ nope');
  const r = await run(['Kigali']);
  assert.equal(r.code, 1);
  assert.match(r.err, /not valid JSON/);
});

test('--help and --version', async () => {
  assert.match((await run(['--help'])).out, /USAGE/);
  assert.match((await run(['--version'])).out, /^\d+\.\d+\.\d+/);
});