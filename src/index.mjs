#!/usr/bin/env node

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { URL } from 'node:url';

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'config.json');
const LOG_PREFIX = '[octopus-bridge]';
const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 300000;
const DEFAULT_HEADERS_TIMEOUT_MS = 65000;
const DEFAULT_REQUEST_TIMEOUT_MS = 300000;
const DEFAULT_KEEP_ALIVE_TIMEOUT_MS = 5000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 15000;

function parseArgs(argv) {
  const args = { config: DEFAULT_CONFIG_PATH };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--config' && argv[i + 1]) {
      args.config = path.resolve(argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

function log(level, message, extra = undefined) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg: message,
  };
  if (extra !== undefined) payload.extra = extra;
  console.log(`${LOG_PREFIX} ${JSON.stringify(payload)}`);
}

function fail(message) {
  log('error', message);
  process.exit(1);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function parsePositiveInteger(value, fallback, fieldName) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!isPositiveInteger(parsed)) {
    fail(`${fieldName} must be a positive integer`);
  }
  return parsed;
}

function readConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    fail(`config file not found: ${configPath}`);
  }

  let config;
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(raw);
  } catch (error) {
    fail(`failed to read config: ${String(error)}`);
  }

  const host = String(config?.listen?.host || '127.0.0.1');
  const port = parsePositiveInteger(config?.listen?.port || 8330, 8330, 'config.listen.port');
  const baseUrl = String(config?.upstream?.base_url || '').trim();
  const maxBodyBytes = parsePositiveInteger(
    config?.proxy?.max_body_bytes,
    DEFAULT_MAX_BODY_BYTES,
    'config.proxy.max_body_bytes',
  );
  const upstreamTimeoutMs = parsePositiveInteger(
    config?.proxy?.upstream_timeout_ms,
    DEFAULT_UPSTREAM_TIMEOUT_MS,
    'config.proxy.upstream_timeout_ms',
  );
  const headersTimeoutMs = parsePositiveInteger(
    config?.server?.headers_timeout_ms,
    DEFAULT_HEADERS_TIMEOUT_MS,
    'config.server.headers_timeout_ms',
  );
  const requestTimeoutMs = parsePositiveInteger(
    config?.server?.request_timeout_ms,
    DEFAULT_REQUEST_TIMEOUT_MS,
    'config.server.request_timeout_ms',
  );
  const keepAliveTimeoutMs = parsePositiveInteger(
    config?.server?.keep_alive_timeout_ms,
    DEFAULT_KEEP_ALIVE_TIMEOUT_MS,
    'config.server.keep_alive_timeout_ms',
  );
  const shutdownTimeoutMs = parsePositiveInteger(
    config?.server?.shutdown_timeout_ms,
    DEFAULT_SHUTDOWN_TIMEOUT_MS,
    'config.server.shutdown_timeout_ms',
  );

  if (!baseUrl) {
    fail('config.upstream.base_url is required');
  }

  let parsedBaseUrl;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch (error) {
    fail(`config.upstream.base_url is invalid: ${String(error)}`);
  }

  if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
    fail('config.upstream.base_url must start with http:// or https://');
  }

  return {
    configPath,
    host,
    port,
    baseUrl: parsedBaseUrl.toString(),
    maxBodyBytes,
    upstreamTimeoutMs,
    headersTimeoutMs,
    requestTimeoutMs,
    keepAliveTimeoutMs,
    shutdownTimeoutMs,
    requireAuthorization: config?.proxy?.require_authorization !== false,
    requestHeaderStripSet: new Set((config?.proxy?.strip_request_headers || []).map((item) => String(item).toLowerCase())),
    responseHeaderStripSet: new Set((config?.proxy?.strip_response_headers || []).map((item) => String(item).toLowerCase())),
  };
}

function copyHeaders(sourceHeaders, stripSet) {
  const headers = {};
  for (const [key, value] of Object.entries(sourceHeaders)) {
    if (value === undefined) continue;
    if (stripSet.has(key.toLowerCase())) continue;
    headers[key] = value;
  }
  return headers;
}

async function collectBody(req, maxBodyBytes) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxBodyBytes) {
      const error = new Error(`request body too large: max ${maxBodyBytes} bytes`);
      error.code = 'BODY_TOO_LARGE';
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function normalizePath(inputPath) {
  if (inputPath.startsWith('/v1/')) return inputPath;
  if (inputPath === '/v1') return '/v1';
  return `/v1${inputPath}`;
}

function writeJson(res, statusCode, payload) {
  if (res.headersSent) return;
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function start() {
  const args = parseArgs(process.argv);
  const cfg = readConfig(args.config);
  let isShuttingDown = false;
  const sockets = new Set();

  const server = http.createServer(async (req, res) => {
    const startedAt = Date.now();
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const method = req.method || 'GET';
    const urlPath = req.url || '/';
    const abortController = new AbortController();
    const upstreamTimeout = setTimeout(() => {
      abortController.abort(new Error(`upstream timeout after ${cfg.upstreamTimeoutMs}ms`));
    }, cfg.upstreamTimeoutMs);
    let responseFinished = false;

    upstreamTimeout.unref();

    req.on('aborted', () => {
      abortController.abort(new Error('client request aborted'));
    });

    res.on('close', () => {
      if (!responseFinished) {
        abortController.abort(new Error('client connection closed'));
      }
    });

    res.on('finish', () => {
      responseFinished = true;
      clearTimeout(upstreamTimeout);
    });

    if (urlPath === '/health') {
      return writeJson(res, 200, {
        ok: true,
        service: 'octopus-upstream-http-bridge',
        config: path.basename(cfg.configPath),
        shutting_down: isShuttingDown,
      });
    }

    if (isShuttingDown) {
      clearTimeout(upstreamTimeout);
      return writeJson(res, 503, { error: 'bridge is shutting down' });
    }

    if (!urlPath.startsWith('/v1')) {
      clearTimeout(upstreamTimeout);
      return writeJson(res, 404, { error: 'not found' });
    }

    const incomingAuth = req.headers.authorization;
    if (cfg.requireAuthorization && !incomingAuth) {
      clearTimeout(upstreamTimeout);
      return writeJson(res, 401, { error: 'missing authorization header' });
    }

    let outgoingBody;
    try {
      const bodyBuffer = await collectBody(req, cfg.maxBodyBytes);
      const contentType = String(req.headers['content-type'] || '');
      if (bodyBuffer.length > 0 && contentType.includes('application/json')) {
        JSON.parse(bodyBuffer.toString('utf8'));
        outgoingBody = bodyBuffer.toString('utf8');
      } else if (bodyBuffer.length > 0) {
        outgoingBody = bodyBuffer;
      }
    } catch (error) {
      clearTimeout(upstreamTimeout);
      const statusCode = error?.code === 'BODY_TOO_LARGE' ? 413 : 400;
      const errorMessage = error?.code === 'BODY_TOO_LARGE' ? 'request body too large' : 'invalid request body';
      log('error', 'failed to parse request body', { requestId, error: String(error) });
      return writeJson(res, statusCode, { error: errorMessage });
    }

    const upstreamUrl = new URL(normalizePath(urlPath), cfg.baseUrl.endsWith('/') ? cfg.baseUrl : `${cfg.baseUrl}/`);
    const headers = copyHeaders(req.headers, cfg.requestHeaderStripSet);
    if (outgoingBody && typeof outgoingBody === 'string') {
      headers['content-type'] = 'application/json';
    }

    log('info', 'proxy request', {
      requestId,
      method,
      path: upstreamUrl.pathname,
      authorizationForwarded: Boolean(headers.authorization),
    });

    try {
      const upstreamResponse = await fetch(upstreamUrl, {
        method,
        headers,
        body: ['GET', 'HEAD'].includes(method) ? undefined : outgoingBody,
        duplex: 'half',
        signal: abortController.signal,
      });

      const responseHeaders = copyHeaders(
        Object.fromEntries(upstreamResponse.headers.entries()),
        cfg.responseHeaderStripSet,
      );

      if (res.writableEnded) return;

      res.writeHead(upstreamResponse.status, responseHeaders);

      if (upstreamResponse.body) {
        for await (const chunk of upstreamResponse.body) {
          if (res.destroyed) break;
          res.write(chunk);
        }
      }
      res.end();

      log('info', 'proxy response', {
        requestId,
        status: upstreamResponse.status,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      clearTimeout(upstreamTimeout);
      if (res.writableEnded || res.destroyed) {
        log('warn', 'request ended before upstream completed', {
          requestId,
          error: String(error),
          durationMs: Date.now() - startedAt,
        });
        return;
      }

      const isAbortError = error?.name === 'AbortError';
      const detail = String(error?.cause || error);
      const statusCode = isAbortError ? 504 : 502;
      log('error', 'proxy failure', {
        requestId,
        error: detail,
        aborted: isAbortError,
        durationMs: Date.now() - startedAt,
      });
      writeJson(res, statusCode, {
        error: isAbortError ? 'bridge upstream request timed out or was aborted' : 'bridge upstream request failed',
        detail,
      });
    }
  });

  server.headersTimeout = cfg.headersTimeoutMs;
  server.requestTimeout = cfg.requestTimeoutMs;
  server.keepAliveTimeout = cfg.keepAliveTimeoutMs;

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  server.on('clientError', (error, socket) => {
    log('warn', 'client connection error', { error: String(error) });
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  server.on('error', (error) => {
    log('error', 'server error', { error: String(error) });
  });

  server.listen(cfg.port, cfg.host, () => {
    log('info', 'bridge listening', {
      host: cfg.host,
      port: cfg.port,
      upstream: cfg.baseUrl,
      config: cfg.configPath,
      maxBodyBytes: cfg.maxBodyBytes,
      upstreamTimeoutMs: cfg.upstreamTimeoutMs,
    });
  });

  function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    log('info', 'received shutdown signal', { signal });

    server.close(() => {
      log('info', 'server closed');
      process.exit(0);
    });

    const forceShutdownTimer = setTimeout(() => {
      log('warn', 'forcing socket shutdown', { openSockets: sockets.size });
      for (const socket of sockets) {
        socket.destroy();
      }
    }, cfg.shutdownTimeoutMs);

    forceShutdownTimer.unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (error) => {
    log('error', 'uncaught exception', { error: error.stack || String(error) });
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (error) => {
    log('error', 'unhandled rejection', { error: String(error) });
  });
}

start().catch((error) => fail(error.stack || String(error)));
