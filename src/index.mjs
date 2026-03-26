#!/usr/bin/env node

import { parseArgs, readConfig } from './config.mjs';
import { fail } from './logger.mjs';
import { log } from './logger.mjs';
import { startServer } from './server.mjs';

function start() {
  const args = parseArgs(process.argv);
  const cfg = readConfig(args.config);
  return startServer(cfg, log);
}

try {
  start();
} catch (error) {
  fail(error.stack || String(error));
}
