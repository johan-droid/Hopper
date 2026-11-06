/**
 * Hopper Local Development Orchestrator — Health Checks & Route Verifier
 */

import * as net from 'node:net';
import * as http from 'node:http';
import { execSync } from 'node:child_process';
import { URLS, PORTS } from './config.mjs';

/**
 * Low-level TCP connect check with timeout.
 */
export function checkTcpPort(port, host = '127.0.0.1', timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isConnected = false;

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      isConnected = true;
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

/**
 * Check PostgreSQL health via pg_isready or TCP socket.
 */
export async function checkPostgresHealth(port = PORTS.postgres) {
  try {
    const output = execSync(`pg_isready -h 127.0.0.1 -p ${port} -U postgres -t 2 2>&1`, { encoding: 'utf8' });
    if (output.includes('accepting connections')) {
      return { healthy: true, detail: 'accepting connections via pg_isready' };
    }
  } catch {
    // pg_isready might not be installed or returned error, fallback to TCP probe
  }

  const tcpOk = await checkTcpPort(port, '127.0.0.1', 1500);
  if (tcpOk) {
    return { healthy: true, detail: `port ${port} open and listening` };
  }

  return { healthy: false, detail: `PostgreSQL port ${port} unreachable` };
}

/**
 * Check Redis health via redis-cli PING or TCP socket PING.
 */
export async function checkRedisHealth(port = PORTS.redis) {
  try {
    const output = execSync(`redis-cli -h 127.0.0.1 -p ${port} ping 2>&1`, { encoding: 'utf8' }).trim();
    if (output === 'PONG') {
      return { healthy: true, detail: 'responded PONG via redis-cli' };
    }
  } catch {
    // redis-cli might not be installed, test via raw TCP ping
  }

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let received = '';

    socket.setTimeout(1500);

    socket.on('connect', () => {
      socket.write('PING\r\n');
    });

    socket.on('data', (data) => {
      received += data.toString();
      if (received.includes('+PONG')) {
        socket.destroy();
        resolve({ healthy: true, detail: 'responded +PONG via TCP socket' });
      }
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ healthy: false, detail: 'Redis socket timeout' });
    });

    socket.on('error', (err) => {
      socket.destroy();
      resolve({ healthy: false, detail: `Redis connection error: ${err.message}` });
    });

    socket.connect(port, '127.0.0.1');
  });
}

/**
 * Check Backend API Health via GET /api/health.
 */
export async function checkBackendHealth(healthUrl = URLS.backendHealth) {
  return new Promise((resolve) => {
    const req = http.get(healthUrl, { timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(body);
            if (json.status === 'healthy') {
              resolve({ healthy: true, detail: 'HTTP 200 healthy', data: json });
            } else {
              resolve({ healthy: false, detail: `Status degraded: ${json.status}`, data: json });
            }
          } catch {
            resolve({ healthy: true, detail: 'HTTP 200 OK (non-JSON)' });
          }
        } else {
          resolve({ healthy: false, detail: `HTTP ${res.statusCode}` });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ healthy: false, detail: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ healthy: false, detail: 'Request timed out' });
    });
  });
}

/**
 * Verify that the GitHub Webhook Route exists and is mounted on the backend.
 * Hopper expects POST /api/webhooks/github. An unsigned request returns 401/400 (NOT 404).
 */
export async function verifyWebhookRoute(backendUrl = URLS.backend, webhookPath = URLS.webhookPath) {
  return new Promise((resolve) => {
    const url = new URL(webhookPath, backendUrl);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Hopper-Orchestrator-HealthCheck/1.0',
      },
      timeout: 3000,
    };

    const req = http.request(options, (res) => {
      // 401 Unauthorized or 400 Bad Request indicates the route exists and is actively protecting HMAC signatures.
      // 404 indicates the route does not exist.
      if (res.statusCode !== 404) {
        resolve({
          verified: true,
          statusCode: res.statusCode,
          detail: `Route exists (responded HTTP ${res.statusCode} to unsigned probe)`,
        });
      } else {
        resolve({
          verified: false,
          statusCode: res.statusCode,
          detail: `Route ${webhookPath} returned 404 Not Found`,
        });
      }
    });

    req.on('error', (err) => {
      resolve({ verified: false, detail: `Connection error: ${err.message}` });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ verified: false, detail: 'Probe timed out' });
    });

    req.write('{}');
    req.end();
  });
}

/**
 * Check Frontend HTTP Server readiness.
 */
export async function checkFrontendHealth(frontendUrl = URLS.frontend) {
  return new Promise((resolve) => {
    const req = http.get(frontendUrl, { timeout: 3000 }, (res) => {
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
        resolve({ healthy: true, detail: `HTTP ${res.statusCode}` });
      } else {
        resolve({ healthy: false, detail: `HTTP ${res.statusCode}` });
      }
    });

    req.on('error', (err) => {
      resolve({ healthy: false, detail: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ healthy: false, detail: 'Probe timed out' });
    });
  });
}

/**
 * Polling helper that waits for a condition function to return true or truthy.
 */
export async function waitForCondition(checkFn, timeoutMs = 30000, intervalMs = 500, label = 'service') {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = await checkFn();
      if (result && result.healthy) {
        return result;
      }
    } catch {
      // Keep polling
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout waiting for ${label} to be ready after ${timeoutMs}ms`);
}

