/**
 * Hopper Local Development — Health Checks & Route Verifier
 */

import * as net from 'node:net';
import * as http from 'node:http';
import { execSync } from 'node:child_process';
import { URLS, PORTS } from './config.mjs';

/** Low-level TCP connect check with timeout. */
export function checkTcpPort(port, host = '127.0.0.1', timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

/** PostgreSQL readiness via pg_isready, falling back to a TCP probe. */
export async function checkPostgresHealth(port = PORTS.postgres) {
  try {
    const output = execSync(`pg_isready -h 127.0.0.1 -p ${port} -U postgres -t 2 2>&1`, {
      encoding: 'utf8',
    });
    if (output.includes('accepting connections')) {
      return { healthy: true, detail: 'accepting connections (pg_isready)' };
    }
  } catch {
    // pg_isready unavailable; fall back to TCP
  }

  const tcpOk = await checkTcpPort(port, '127.0.0.1', 1500);
  return tcpOk
    ? { healthy: true, detail: `port ${port} listening` }
    : { healthy: false, detail: `PostgreSQL port ${port} unreachable` };
}

/** Backend health via GET /api/health. */
export async function checkBackendHealth(healthUrl = URLS.backendHealth) {
  return new Promise((resolve) => {
    const req = http.get(healthUrl, { timeout: 4000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          resolve({ healthy: false, detail: `HTTP ${res.statusCode}` });
          return;
        }
        try {
          const json = JSON.parse(body);
          if (json.status === 'healthy') {
            resolve({ healthy: true, detail: 'HTTP 200 healthy', data: json });
          } else {
            resolve({ healthy: false, detail: `status: ${json.status}`, data: json });
          }
        } catch {
          resolve({ healthy: true, detail: 'HTTP 200 (non-JSON)' });
        }
      });
    });
    req.on('error', (err) => resolve({ healthy: false, detail: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ healthy: false, detail: 'request timed out' });
    });
  });
}

/**
 * Verify the GitHub webhook route is mounted. An unsigned request must return
 * 401/400/503 — anything but 404 proves the router exists.
 */
export async function verifyWebhookRoute(backendUrl = URLS.backend, webhookPath = URLS.webhookPath) {
  return new Promise((resolve) => {
    const url = new URL(webhookPath, backendUrl);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Hopper-HealthCheck/1.0' },
        timeout: 4000,
      },
      (res) => {
        res.resume();
        resolve(
          res.statusCode !== 404
            ? { verified: true, statusCode: res.statusCode, detail: `HTTP ${res.statusCode}` }
            : { verified: false, statusCode: 404, detail: `route ${webhookPath} not found` }
        );
      }
    );
    req.on('error', (err) => resolve({ verified: false, detail: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ verified: false, detail: 'probe timed out' });
    });
    req.write('{}');
    req.end();
  });
}

/** Frontend readiness. */
export async function checkFrontendHealth(frontendUrl = URLS.frontend) {
  return new Promise((resolve) => {
    const req = http.get(frontendUrl, { timeout: 4000 }, (res) => {
      res.resume();
      resolve(
        res.statusCode && res.statusCode < 400
          ? { healthy: true, detail: `HTTP ${res.statusCode}` }
          : { healthy: false, detail: `HTTP ${res.statusCode}` }
      );
    });
    req.on('error', (err) => resolve({ healthy: false, detail: err.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ healthy: false, detail: 'probe timed out' });
    });
  });
}

/** Poll until the condition reports healthy or the timeout elapses. */
export async function waitForCondition(checkFn, timeoutMs = 30000, intervalMs = 500, label = 'service') {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const result = await checkFn();
      last = result;
      if (result && result.healthy) return result;
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout waiting for ${label} after ${timeoutMs}ms${last?.detail ? ` (${last.detail})` : ''}`);
}
