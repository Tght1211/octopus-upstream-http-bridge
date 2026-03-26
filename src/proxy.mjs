import path from 'node:path';
import { URL } from 'node:url';

import { SERVICE_NAME } from './constants.mjs';
import { createErrorPayload, ERROR_CODES } from './errors.mjs';

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

export function createRequestHandler(cfg, log, state) {
  return async function handleRequest(req, res) {
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
        service: SERVICE_NAME,
        config: path.basename(cfg.configPath),
        shutting_down: state.isShuttingDown,
      });
    }

    if (urlPath === '/ready') {
      return writeJson(res, state.isShuttingDown ? 503 : 200, {
        ok: !state.isShuttingDown,
        service: SERVICE_NAME,
        ready: !state.isShuttingDown,
      });
    }

    if (state.isShuttingDown) {
      clearTimeout(upstreamTimeout);
      return writeJson(res, 503, createErrorPayload(ERROR_CODES.SHUTTING_DOWN, 'bridge is shutting down'));
    }

    if (!urlPath.startsWith('/v1')) {
      clearTimeout(upstreamTimeout);
      return writeJson(res, 404, createErrorPayload(ERROR_CODES.NOT_FOUND, 'not found'));
    }

    if (cfg.requireAuthorization && !req.headers.authorization) {
      clearTimeout(upstreamTimeout);
      return writeJson(res, 401, createErrorPayload(ERROR_CODES.MISSING_AUTH, 'missing authorization header'));
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
      const errorCode = error?.code === 'BODY_TOO_LARGE' ? ERROR_CODES.BODY_TOO_LARGE : ERROR_CODES.INVALID_BODY;
      log('error', 'failed to parse request body', { requestId, error: String(error) });
      return writeJson(res, statusCode, createErrorPayload(errorCode, errorMessage));
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
        error: {
          code: isAbortError ? ERROR_CODES.UPSTREAM_TIMEOUT : ERROR_CODES.UPSTREAM_FAILURE,
          message: isAbortError ? 'bridge upstream request timed out or was aborted' : 'bridge upstream request failed',
          detail,
        },
      });
    }
  };
}
