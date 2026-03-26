#!/usr/bin/env node

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { URL } from 'node:url';

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'config.json');
const LOG_PREFIX = '[octopus-bridge]';

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

function readConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    fail(`config file not found: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(raw);

  const host = config?.listen?.host || '127.0.0.1';
  const port = Number(config?.listen?.port || 8330);
  const baseUrl = config?.upstream?.base_url;

  if (!baseUrl) {
    fail('config.upstream.base_url is required');
  }

  return {
    configPath,
    host,
    port,
    baseUrl,
    requireAuthorization: config?.proxy?.require_authorization !== false,
    requestHeaderStripSet: new Set((config?.proxy?.strip_request_headers || []).map((item) => String(item).toLowerCase())),
    responseHeaderStripSet: new Set((config?.proxy?.strip_response_headers || []).map((item) => String(item).toLowerCase())),
    modelMap: new Map(Object.entries(config?.model_map || {})),
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

async function collectBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function normalizePath(inputPath) {
  if (inputPath.startsWith('/v1/')) return inputPath;
  if (inputPath === '/v1') return '/v1';
  return `/v1${inputPath}`;
}

function maybeRewriteModel(jsonBody, modelMap) {
  if (!jsonBody || typeof jsonBody !== 'object') return jsonBody;
  if (typeof jsonBody.model === 'string' && modelMap.has(jsonBody.model)) {
    jsonBody.model = modelMap.get(jsonBody.model);
  }
  return jsonBody;
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function start() {
  const args = parseArgs(process.argv);
  const cfg = readConfig(args.config);

  const server = http.createServer(async (req, res) => {
    const startedAt = Date.now();
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const method = req.method || 'GET';
    const urlPath = req.url || '/';

    if (urlPath === '/health') {
      return writeJson(res, 200, {
        ok: true,
        service: 'octopus-upstream-http-bridge',
        config: path.basename(cfg.configPath),
      });
    }

    if (!urlPath.startsWith('/v1')) {
      return writeJson(res, 404, { error: 'not found' });
    }

    const incomingAuth = req.headers.authorization;
    if (cfg.requireAuthorization && !incomingAuth) {
      return writeJson(res, 401, { error: 'missing authorization header' });
    }

    let outgoingBody;
    try {
      const bodyBuffer = await collectBody(req);
      const contentType = String(req.headers['content-type'] || '');
      if (bodyBuffer.length > 0 && contentType.includes('application/json')) {
        const jsonBody = JSON.parse(bodyBuffer.toString('utf8'));
        maybeRewriteModel(jsonBody, cfg.modelMap);
        outgoingBody = JSON.stringify(jsonBody);
      } else if (bodyBuffer.length > 0) {
        outgoingBody = bodyBuffer;
      }
    } catch (error) {
      log('error', 'failed to parse request body', { requestId, error: String(error) });
      return writeJson(res, 400, { error: 'invalid request body' });
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
      });

      const responseHeaders = copyHeaders(
        Object.fromEntries(upstreamResponse.headers.entries()),
        cfg.responseHeaderStripSet,
      );
      res.writeHead(upstreamResponse.status, responseHeaders);

      if (upstreamResponse.body) {
        for await (const chunk of upstreamResponse.body) {
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
      log('error', 'proxy failure', {
        requestId,
        error: String(error),
        durationMs: Date.now() - startedAt,
      });
      writeJson(res, 502, { error: 'bridge upstream request failed', detail: String(error) });
    }
  });

  server.listen(cfg.port, cfg.host, () => {
    log('info', 'bridge listening', {
      host: cfg.host,
      port: cfg.port,
      upstream: cfg.baseUrl,
      config: cfg.configPath,
    });
  });

  process.on('SIGTERM', () => {
    log('info', 'received SIGTERM');
    server.close(() => process.exit(0));
  });

  process.on('SIGINT', () => {
    log('info', 'received SIGINT');
    server.close(() => process.exit(0));
  });
}

start().catch((error) => fail(error.stack || String(error)));
