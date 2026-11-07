export const EXIT = {
  OK: 0,
  UNEXPECTED: 1,
  USAGE: 2,
  NOT_FOUND: 3,
  NETWORK: 4,
  TIMEOUT: 5,
  API: 6,
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