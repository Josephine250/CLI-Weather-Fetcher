
import os from 'node:os';
import path from 'node:path';
import { usageError } from './errors.js';
 
export const UNITS = ['metric', 'imperial'];
 
/**
 * Reads configuration from environment variables.
 *
 *   IKIRERE_HOME           where data.json lives          (default ~/.ikirere)
 *   IKIRERE_UNITS          metric | imperial              (overrides saved setting)
 *   IKIRERE_TIMEOUT_MS     per-request timeout            (default 8000)
 *   IKIRERE_GEOCODING_URL  geocoding API base URL         (default Open-Meteo)
 *   IKIRERE_FORECAST_URL   forecast API base URL          (default Open-Meteo)
 *   NO_COLOR               disable ANSI colours
 */
export function loadConfig(env = process.env) {
  const timeoutMs = env.IKIRERE_TIMEOUT_MS ? Number(env.IKIRERE_TIMEOUT_MS) : 8000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw usageError(
      `IKIRERE_TIMEOUT_MS must be a positive whole number (got "${env.IKIRERE_TIMEOUT_MS}").`,
    );
  }
  if (env.IKIRERE_UNITS && !UNITS.includes(env.IKIRERE_UNITS)) {
    throw usageError(`IKIRERE_UNITS must be one of: ${UNITS.join(', ')}.`);
  }
  return {
    home: env.IKIRERE_HOME || path.join(os.homedir(), '.ikirere'),
    units: env.IKIRERE_UNITS || undefined,
    timeoutMs,
    geocodingUrl: (env.IKIRERE_GEOCODING_URL || 'https://geocoding-api.open-meteo.com').replace(/\/$/, ''),
    forecastUrl: (env.IKIRERE_FORECAST_URL || 'https://api.open-meteo.com').replace(/\/$/, ''),
    color: !env.NO_COLOR,
  };
}