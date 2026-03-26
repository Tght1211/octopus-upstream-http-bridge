import test from 'node:test';
import assert from 'node:assert/strict';

import { createBridgeServer } from '../src/server.mjs';

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

test('health endpoint responds with readiness payload', async () => {
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
  const address = await listen(server);

  try {
    const response = await fetch(`http://${address.address}:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      service: 'octopus-upstream-http-bridge',
      config: 'config.json',
      shutting_down: false,
    });
  } finally {
    await closeServer(server);
  }
});

test('ready endpoint responds when service is ready', async () => {
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
  const address = await listen(server);

  try {
    const response = await fetch(`http://${address.address}:${address.port}/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      service: 'octopus-upstream-http-bridge',
      ready: true,
    });
  } finally {
    await closeServer(server);
  }
});
