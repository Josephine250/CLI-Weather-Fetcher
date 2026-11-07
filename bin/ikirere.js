#!/usr/bin/env node
import { main } from '../src/cli.js';

// Set exitCode (instead of calling process.exit) so stdout can flush fully.
process.exitCode = await main(process.argv.slice(2));