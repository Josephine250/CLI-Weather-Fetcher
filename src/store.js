import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { IkirereError } from './errors.js';
 
export const HISTORY_LIMIT = 50;
 
const defaults = () => ({
  version: 1,
  settings: { units: 'metric', defaultCity: null },
  favourites: [],
  history: [],
});
 
/** Tiny JSON-file database: settings + favourites + history in one file. */
export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'data.json');
  }
 
  async load() {
    let raw;
    try {
      raw = await readFile(this.file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return defaults(); // first run
      throw this.#fsError(err);
    }
    try {
      const parsed = JSON.parse(raw);
      const base = defaults();
      return {
        ...base,
        ...parsed,
        settings: { ...base.settings, ...parsed.settings },
      };
    } catch {
      throw new IkirereError(`Your data file is not valid JSON: ${this.file}`, {
        hint: 'Fix it by hand, or delete it to start fresh.',
      });
    }
  }
 
  async save(data) {
    try {
      await mkdir(this.dir, { recursive: true });
      // Write to a temp file then rename, so a crash never leaves half a file.
      const tmp = `${this.file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(data, null, 2) + '\n');
      await rename(tmp, this.file);
    } catch (err) {
      throw this.#fsError(err);
    }
  }
 
  #fsError(err) {
    return new IkirereError(`Could not access ${this.file} (${err.code ?? err.message}).`, {
      hint: 'Check permissions, or point IKIRERE_HOME at a writable folder.',
    });
  }
}