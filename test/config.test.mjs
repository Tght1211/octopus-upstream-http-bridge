import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { readConfig } from '../src/config.mjs';

function withTempConfig(config) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'octopus-config-test-'));
  const configPath = path.join(tempDir, 'config.json');
  writeFileSync(configPath, JSON.stringify(config));

  return {
    configPath,
    cleanup() {
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

test('readConfig applies defaults', () => {
  const { configPath, cleanup } = withTempConfig({
    upstream: { base_url: 'https://example.com' },
  });

  try {
    const cfg = readConfig(configPath);
    assert.equal(cfg.host, '127.0.0.1');
    assert.equal(cfg.port, 8330);
    assert.equal(cfg.maxBodyBytes, 10 * 1024 * 1024);
    assert.equal(cfg.upstreamTimeoutMs, 300000);
    assert.equal(cfg.baseUrl, 'https://example.com/');
  } finally {
    cleanup();
  }
});

test('readConfig rejects invalid upstream URL', () => {
  const { configPath, cleanup } = withTempConfig({
    upstream: { base_url: 'ftp://example.com' },
  });

  try {
    assert.throws(() => readConfig(configPath), /must start with http:\/\/ or https:\/\//);
  } finally {
    cleanup();
  }
});
