import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBridgeServer } from '../src/server.mjs';
import { ERROR_CODES } from '../src/errors.mjs';

function createSilentLogger() {
  return () => {};
}

async function listen(server, host = '127.0.0.1', port = 0) {
  await new Promise((resolve) => server.listen(port, host, resolve));
  return server.address();
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test('bridge forwards request to upstream', async () => {
  let upstreamAuthorization = null;
  let upstreamBody = null;

  const upstream = http.createServer(async (req, res) => {
    upstreamAuthorization = req.headers.authorization;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    upstreamBody = Buffer.concat(chunks).toString('utf8');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  const upstreamAddress = await listen(upstream);

  const cfg = {
    configPath: '/tmp/config.json',
    host: '127.0.0.1',
    port: 0,
    baseUrl: `http://${upstreamAddress.address}:${upstreamAddress.port}`,
    maxBodyBytes: 1024 * 1024,
    upstreamTimeoutMs: 5000,
    headersTimeoutMs: 65000,
    requestTimeoutMs: 5000,
    keepAliveTimeoutMs: 5000,
    shutdownTimeoutMs: 1000,
    requireAuthorization: true,
    requestHeaderStripSet: new Set(['host', 'content-length']),
    responseHeaderStripSet: new Set(['content-length']),
  };

  const { server } = createBridgeServer(cfg, createSilentLogger());
  const bridgeAddress = await listen(server);

  try {
    const response = await fetch(`http://${bridgeAddress.address}:${bridgeAddress.port}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'demo', messages: [] }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(upstreamAuthorization, 'Bearer test-token');
    assert.match(upstreamBody, /"model":"demo"/);
  } finally {
    await closeServer(server);
    await closeServer(upstream);
  }
});

test('bridge rejects oversized request body', async () => {
  const cfg = {
    configPath: '/tmp/config.json',
    host: '127.0.0.1',
    port: 0,
    baseUrl: 'https://example.com/',
    maxBodyBytes: 10,
    upstreamTimeoutMs: 5000,
    headersTimeoutMs: 65000,
    requestTimeoutMs: 5000,
    keepAliveTimeoutMs: 5000,
    shutdownTimeoutMs: 1000,
    requireAuthorization: false,
    requestHeaderStripSet: new Set(),
    responseHeaderStripSet: new Set(),
  };

  const { server } = createBridgeServer(cfg, createSilentLogger());
  const bridgeAddress = await listen(server);

  try {
    const response = await fetch(`http://${bridgeAddress.address}:${bridgeAddress.port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload: 'this body is too large' }),
    });

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), {
      error: {
        code: ERROR_CODES.BODY_TOO_LARGE,
        message: 'request body too large',
      },
    });
  } finally {
    await closeServer(server);
  }
});

test('bridge requires authorization when enabled', async () => {
  const cfg = {
    configPath: '/tmp/config.json',
    host: '127.0.0.1',
    port: 0,
    baseUrl: 'https://example.com/',
    maxBodyBytes: 1024 * 1024,
    upstreamTimeoutMs: 5000,
    headersTimeoutMs: 65000,
    requestTimeoutMs: 5000,
    keepAliveTimeoutMs: 5000,
    shutdownTimeoutMs: 1000,
    requireAuthorization: true,
    requestHeaderStripSet: new Set(),
    responseHeaderStripSet: new Set(),
  };

  const { server } = createBridgeServer(cfg, createSilentLogger());
  const bridgeAddress = await listen(server);

  try {
    const response = await fetch(`http://${bridgeAddress.address}:${bridgeAddress.port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'demo', messages: [] }),
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: {
        code: ERROR_CODES.MISSING_AUTH,
        message: 'missing authorization header',
      },
    });
  } finally {
    await closeServer(server);
  }
});
