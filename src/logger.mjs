import { LOG_PREFIX } from './constants.mjs';

export function log(level, message, extra = undefined) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg: message,
  };

  if (extra !== undefined) {
    payload.extra = extra;
  }

  console.log(`${LOG_PREFIX} ${JSON.stringify(payload)}`);
}

export function fail(message) {
  log('error', message);
  process.exit(1);
}
