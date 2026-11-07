// Exit codes: scripts can react to *why* ikirere failed.
export const EXIT = {
  OK: 0,
  UNEXPECTED: 1,
  USAGE: 2,
  NOT_FOUND: 3,
  NETWORK: 4,
  TIMEOUT: 5,
  API: 6,
  RATE_LIMIT: 7,
};

export class IkirereError extends Error {
  constructor(message, { exitCode = EXIT.UNEXPECTED, hint } = {}) {
    super(message);
    this.name = 'IkirereError';
    this.exitCode = exitCode;
    this.hint = hint;
  }
}

export const usageError = (message, hint = 'Run `ikirere --help` for usage.') =>
  new IkirereError(message, { exitCode: EXIT.USAGE, hint });

/**
 * Turns the REAL HTTP status code of a failed response into a friendly error.
 * `reason` is the API's own explanation (Open-Meteo sends { error: true, reason: "..." }).
 */
export function httpStatusError(status, { reason, retryAfter } = {}) {
  const why = reason ? ` (${String(reason).slice(0, 120)})` : '';
  const tag = `HTTP ${status}`;

  if (status === 400 || status === 422) {
    return new IkirereError(`The weather service rejected the request [${tag}]${why}.`, {
      exitCode: EXIT.USAGE,
      hint: 'Check the city name and your options (--days, --units).',
    });
  }
  if (status === 401 || status === 403) {
    return new IkirereError(`The weather service refused access [${tag}]${why}.`, {
      exitCode: EXIT.API,
      hint: 'The service may be blocking this request. Try again later.',
    });
  }
  if (status === 404) {
    return new IkirereError(`The weather service could not find what was requested [${tag}]${why}.`, {
      exitCode: EXIT.NOT_FOUND,
      hint: 'Check the spelling of the place name.',
    });
  }
  if (status === 408 || status === 504) {
    return new IkirereError(`The weather service timed out [${tag}].`, {
      exitCode: EXIT.TIMEOUT,
      hint: 'Try again in a moment.',
    });
  }
  if (status === 429) {
    return new IkirereError(`Too many requests: the weather service is rate-limiting you [${tag}].`, {
      exitCode: EXIT.RATE_LIMIT,
      hint: retryAfter ? `Wait ${retryAfter}s and try again.` : 'Wait a minute and try again.',
    });
  }
  if (status >= 500) {
    return new IkirereError(`The weather service is having problems [${tag}].`, {
      exitCode: EXIT.API,
      hint: 'This is usually temporary. Try again in a moment.',
    });
  }
  return new IkirereError(`The weather service sent an unexpected answer [${tag}]${why}.`, {
    exitCode: EXIT.API,
  });
}