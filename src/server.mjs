import http from 'node:http';

import { createRequestHandler } from './proxy.mjs';

export function createBridgeServer(cfg, log) {
  const state = {
    isShuttingDown: false,
    sockets: new Set(),
    startedAt: new Date().toISOString(),
  };

  const server = http.createServer(createRequestHandler(cfg, log, state));
  server.headersTimeout = cfg.headersTimeoutMs;
  server.requestTimeout = cfg.requestTimeoutMs;
  server.keepAliveTimeout = cfg.keepAliveTimeoutMs;

  server.on('connection', (socket) => {
    state.sockets.add(socket);
    socket.on('close', () => state.sockets.delete(socket));
  });

  server.on('clientError', (error, socket) => {
    log('warn', 'client connection error', { error: String(error) });
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });

  server.on('error', (error) => {
    log('error', 'server error', { error: String(error) });
  });

  function shutdown(signal, options = {}) {
    const { exitProcess = false } = options;

    if (state.isShuttingDown) return;
    state.isShuttingDown = true;
    log('info', 'received shutdown signal', { signal });

    server.close(() => {
      log('info', 'server closed');
      if (exitProcess) {
        process.exit(0);
      }
    });

    const forceShutdownTimer = setTimeout(() => {
      log('warn', 'forcing socket shutdown', { openSockets: state.sockets.size });
      for (const socket of state.sockets) {
        socket.destroy();
      }
    }, cfg.shutdownTimeoutMs);

    forceShutdownTimer.unref();
  }

  return { server, state, shutdown };
}

export function startServer(cfg, log, options = {}) {
  const { attachProcessHandlers = true, exitOnShutdown = true } = options;
  const runtime = createBridgeServer(cfg, log);
  const { server, shutdown } = runtime;

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

  if (attachProcessHandlers) {
    process.on('SIGTERM', () => shutdown('SIGTERM', { exitProcess: exitOnShutdown }));
    process.on('SIGINT', () => shutdown('SIGINT', { exitProcess: exitOnShutdown }));

    process.on('uncaughtException', (error) => {
      log('error', 'uncaught exception', { error: error.stack || String(error) });
      shutdown('uncaughtException', { exitProcess: exitOnShutdown });
    });

    process.on('unhandledRejection', (error) => {
      log('error', 'unhandled rejection', { error: String(error) });
    });
  }

  return runtime;
}
