import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';

import {
  DEFAULT_HEADERS_TIMEOUT_MS,
  DEFAULT_KEEP_ALIVE_TIMEOUT_MS,
  DEFAULT_MAX_BODY_BYTES,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  DEFAULT_UPSTREAM_TIMEOUT_MS,
} from './constants.mjs';

export const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'config.json');

export function parseArgs(argv) {
  const args = { config: DEFAULT_CONFIG_PATH };

  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--config' && argv[i + 1]) {
      args.config = path.resolve(argv[i + 1]);
      i += 1;
    }
  }

  return args;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function parsePositiveInteger(value, fallback, fieldName) {
  if (value === undefined || value === null || value === '') return fallback;

  const parsed = Number(value);
  if (!isPositiveInteger(parsed)) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return parsed;
}

export function readConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`config file not found: ${configPath}`);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(`failed to read config: ${String(error)}`);
  }

  const host = String(config?.listen?.host || '127.0.0.1');
  const port = parsePositiveInteger(config?.listen?.port || 8330, 8330, 'config.listen.port');
  const baseUrl = String(config?.upstream?.base_url || '').trim();

  if (!baseUrl) {
    throw new Error('config.upstream.base_url is required');
  }

  let parsedBaseUrl;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch (error) {
    throw new Error(`config.upstream.base_url is invalid: ${String(error)}`);
  }

  if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
    throw new Error('config.upstream.base_url must start with http:// or https://');
  }

  return {
    configPath,
    host,
    port,
    baseUrl: parsedBaseUrl.toString(),
    maxBodyBytes: parsePositiveInteger(
      config?.proxy?.max_body_bytes,
      DEFAULT_MAX_BODY_BYTES,
      'config.proxy.max_body_bytes',
    ),
    upstreamTimeoutMs: parsePositiveInteger(
      config?.proxy?.upstream_timeout_ms,
      DEFAULT_UPSTREAM_TIMEOUT_MS,
      'config.proxy.upstream_timeout_ms',
    ),
    headersTimeoutMs: parsePositiveInteger(
      config?.server?.headers_timeout_ms,
      DEFAULT_HEADERS_TIMEOUT_MS,
      'config.server.headers_timeout_ms',
    ),
    requestTimeoutMs: parsePositiveInteger(
      config?.server?.request_timeout_ms,
      DEFAULT_REQUEST_TIMEOUT_MS,
      'config.server.request_timeout_ms',
    ),
    keepAliveTimeoutMs: parsePositiveInteger(
      config?.server?.keep_alive_timeout_ms,
      DEFAULT_KEEP_ALIVE_TIMEOUT_MS,
      'config.server.keep_alive_timeout_ms',
    ),
    shutdownTimeoutMs: parsePositiveInteger(
      config?.server?.shutdown_timeout_ms,
      DEFAULT_SHUTDOWN_TIMEOUT_MS,
      'config.server.shutdown_timeout_ms',
    ),
    requireAuthorization: config?.proxy?.require_authorization !== false,
    requestHeaderStripSet: new Set(
      (config?.proxy?.strip_request_headers || []).map((item) => String(item).toLowerCase()),
    ),
    responseHeaderStripSet: new Set(
      (config?.proxy?.strip_response_headers || []).map((item) => String(item).toLowerCase()),
    ),
  };
}
