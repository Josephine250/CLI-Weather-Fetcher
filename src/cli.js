import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig, UNITS } from './config.js';
import { Store, HISTORY_LIMIT } from './store.js';
import { geocode, getForecast } from './api.js';
import { makePaint, placeLabel, renderWeather, renderFavourites, renderHistory } from './format.js';
import { IkirereError, EXIT, usageError } from './errors.js';

const HELP = `ikirere - weather in your terminal

USAGE
  ikirere <city> [options]          current weather + forecast
  ikirere fav add <city>            save a favourite
  ikirere fav list                  list favourites
  ikirere fav remove <city>         remove a favourite
  ikirere fav weather               weather for every favourite
  ikirere history [--clear]         recent searches
  ikirere config                    show settings
  ikirere config set <key> <value>  keys: units (metric|imperial), default-city
  ikirere config unset default-city

OPTIONS
  -d, --days <1-16>       forecast days (default 3)
  -u, --units <system>    metric | imperial
      --json              print raw JSON instead of formatted text
      --no-history        do not record this search
  -h, --help              show this help
  -v, --version           show version

ENVIRONMENT
  IKIRERE_HOME            data folder (default ~/.ikirere)
  IKIRERE_UNITS           metric | imperial
  IKIRERE_TIMEOUT_MS      request timeout in ms (default 8000)
  NO_COLOR                disable colours

EXIT CODES
  0 ok   1 unexpected   2 bad input   3 not found   4 network   5 timeout   6 service error   7 rate limited
`;

const OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  days: { type: 'string', short: 'd' },
  units: { type: 'string', short: 'u' },
  json: { type: 'boolean' },
  'no-history': { type: 'boolean' },
  clear: { type: 'boolean' },
};

async function readVersion() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const pkg = JSON.parse(await readFile(path.join(here, '..', 'package.json'), 'utf8'));
  return pkg.version;
}

function parseDays(value) {
  if (value === undefined) return 3;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 16) {
    throw usageError(`--days must be a whole number from 1 to 16 (got "${value}").`);
  }
  return n;
}

const sameSpot = (a, b) =>
  Math.abs(a.latitude - b.latitude) < 0.01 && Math.abs(a.longitude - b.longitude) < 0.01;

export async function main(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const env = io.env ?? process.env;
  const out = (s = '') => stdout.write(s + '\n');

  try {
    return await run(argv, { env, out, stdout });
  } catch (err) {
    const paint = makePaint(!env.NO_COLOR && stderr.isTTY);
    if (err instanceof IkirereError) {
      stderr.write(`${paint.red('Error:')} ${err.message}\n`);
      if (err.hint) stderr.write(`${paint.dim(err.hint)}\n`);
      return err.exitCode;
    }
    if (err?.code?.startsWith?.('ERR_PARSE_ARGS')) {
      stderr.write(`${paint.red('Error:')} ${err.message.split('. To specify')[0]}\n`);
      stderr.write(`${paint.dim('Run `ikirere --help` for usage.')}\n`);
      return EXIT.USAGE;
    }
    stderr.write(`${paint.red('Unexpected error:')} ${err?.message ?? err}\n`);
    return EXIT.UNEXPECTED;
  }
}

async function run(argv, { env, out, stdout }) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: OPTIONS,
    allowPositionals: true,
    strict: true,
  });

  if (values.help) { out(HELP); return EXIT.OK; }
  if (values.version) { out(await readVersion()); return EXIT.OK; }

  const cfg = loadConfig(env);
  const paint = makePaint(cfg.color && stdout.isTTY);
  const store = new Store(cfg.home);
  const data = await store.load();

  const units = values.units ?? cfg.units ?? data.settings.units;
  if (!UNITS.includes(units)) throw usageError(`--units must be one of: ${UNITS.join(', ')}.`);
  const opts = { units, days: parseDays(values.days) };

  /** geocode (unless coordinates are already known) -> forecast -> print */
  async function show(place, label, { record = true } = {}) {
    const forecast = await getForecast(place, opts, cfg);
    if (values.json) out(JSON.stringify({ place, forecast }, null, 2));
    else out(renderWeather(place, forecast, paint));
    if (record && !values['no-history']) {
      data.history.push({ query: label, place: placeLabel(place), at: new Date().toISOString() });
      data.history = data.history.slice(-HISTORY_LIMIT);
      await store.save(data);
    }
  }

  const [cmd, ...rest] = positionals;

  switch (cmd) {
    case undefined: {
      if (!data.settings.defaultCity) { out(HELP); return EXIT.OK; }
      const city = data.settings.defaultCity;
      await show(await geocode(city, cfg), city);
      return EXIT.OK;
    }

    case 'fav':
    case 'favs':
    case 'favourites':
      return favourites(rest);

    case 'history': {
      if (values.clear) {
        data.history = [];
        await store.save(data);
        out('History cleared.');
      } else {
        out(renderHistory(data.history, paint));
      }
      return EXIT.OK;
    }

    case 'config':
      return config(rest);

    case 'weather': // explicit form, lets you look up a city named "config" or "fav"
      await lookup(rest.join(' '));
      return EXIT.OK;

    default:
      await lookup(positionals.join(' '));
      return EXIT.OK;
  }

  async function lookup(query) {
    await show(await geocode(query, cfg), query);
  }

  async function favourites([action, ...args]) {
    const query = args.join(' ');
    switch (action) {
      case 'add': {
        const place = await geocode(query, cfg);
        if (data.favourites.some((f) => sameSpot(f, place))) {
          out(`${placeLabel(place)} is already in your favourites.`);
          return EXIT.OK;
        }
        data.favourites.push(place);
        await store.save(data);
        out(`Added ${placeLabel(place)} to favourites.`);
        return EXIT.OK;
      }
      case 'remove':
      case 'rm': {
        if (!query.trim()) throw usageError('Which favourite? e.g. `ikirere fav remove Kigali`.');
        const q = query.trim().toLowerCase();
        const idx = data.favourites.findIndex((f) => f.name.toLowerCase() === q);
        if (idx === -1) {
          throw new IkirereError(`"${query}" is not in your favourites.`, {
            exitCode: EXIT.NOT_FOUND,
            hint: 'See them with `ikirere fav list`.',
          });
        }
        const [gone] = data.favourites.splice(idx, 1);
        await store.save(data);
        out(`Removed ${placeLabel(gone)}.`);
        return EXIT.OK;
      }
      case 'list':
      case undefined:
        out(renderFavourites(data.favourites, paint));
        return EXIT.OK;
      case 'weather': {
        if (!data.favourites.length) { out(renderFavourites([], paint)); return EXIT.OK; }
        // Coordinates are already saved, so this skips the geocoding step.
        const results = await Promise.allSettled(
          data.favourites.map((p) => getForecast(p, opts, cfg)),
        );
        let failure = null;
        results.forEach((r, i) => {
          const place = data.favourites[i];
          if (r.status === 'fulfilled') {
            out(renderWeather(place, r.value, paint) + '\n');
          } else {
            out(`${paint.bold(placeLabel(place))}\n${paint.red('  ' + r.reason.message)}\n`);
            failure ??= r.reason;
          }
        });
        if (failure) throw failure;
        return EXIT.OK;
      }
      default:
        throw usageError(`Unknown fav command "${action}". Use add, list, remove or weather.`);
    }
  }

  async function config([action, key, ...valueParts]) {
    const value = valueParts.join(' ');
    const KEYS = { units: 'units', 'default-city': 'defaultCity' };
    switch (action) {
      case undefined:
      case 'list':
        out(`units         ${data.settings.units}`);
        out(`default-city  ${data.settings.defaultCity ?? paint.dim('(not set)')}`);
        out(paint.dim(`data file     ${store.file}`));
        return EXIT.OK;
      case 'set': {
        if (!KEYS[key]) throw usageError(`Unknown setting "${key ?? ''}". Use: ${Object.keys(KEYS).join(', ')}.`);
        if (!value.trim()) throw usageError(`Give a value, e.g. \`ikirere config set ${key} <value>\`.`);
        if (key === 'units' && !UNITS.includes(value)) {
          throw usageError(`units must be one of: ${UNITS.join(', ')}.`);
        }
        data.settings[KEYS[key]] = value.trim();
        await store.save(data);
        out(`Saved ${key} = ${value.trim()}`);
        return EXIT.OK;
      }
      case 'unset': {
        if (key !== 'default-city') throw usageError('Only default-city can be unset.');
        data.settings.defaultCity = null;
        await store.save(data);
        out('default-city cleared.');
        return EXIT.OK;
      }
      default:
        throw usageError(`Unknown config command "${action}". Use set, unset or no argument.`);
    }
  }
}