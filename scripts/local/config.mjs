/**
 * Hopper Local Development — Central Configuration
 *
 * Vercel-native, Redis-free. PostgreSQL (pgvector) is the only local
 * infrastructure dependency; the durable job queue lives in the same database.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const REPO_ROOT = path.resolve(__dirname, '../..');
export const BACKEND_DIR = path.join(REPO_ROOT, 'backend');
export const FRONTEND_DIR = path.join(REPO_ROOT, 'frontend');
export const RUNTIME_DIR = path.join(REPO_ROOT, '.runtime', 'local');
export const LOGS_DIR = path.join(RUNTIME_DIR, 'logs');
export const PIDS_DIR = path.join(RUNTIME_DIR, 'pids');

export const LOCK_FILE = path.join(RUNTIME_DIR, 'orchestrator.lock');
export const SESSION_FILE = path.join(RUNTIME_DIR, 'session.json');

for (const dir of [RUNTIME_DIR, LOGS_DIR, PIDS_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Parse a simple KEY=VALUE .env file without external dependencies. */
export function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const result = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    val = val.replace(/^["']|["']$/g, '');
    result[key] = val;
  }
  return result;
}

export const BACKEND_ENV = parseEnvFile(path.join(BACKEND_DIR, '.env'));
export const FRONTEND_ENV = parseEnvFile(path.join(FRONTEND_DIR, '.env'));

export const PORTS = {
  backend: parseInt(process.env.BACKEND_PORT || BACKEND_ENV.PORT || '3000', 10),
  frontend: parseInt(process.env.FRONTEND_PORT || FRONTEND_ENV.VITE_PORT || '5173', 10),
  postgres: parseInt(process.env.POSTGRES_PORT || '5432', 10),
};

export const URLS = {
  backend: `http://localhost:${PORTS.backend}`,
  backendHealth: `http://localhost:${PORTS.backend}/api/health`,
  frontend: `http://localhost:${PORTS.frontend}`,
  webhookPath: '/api/webhooks/github',
};

export const TIMEOUTS = {
  infraReadyMs: 45000,
  backendReadyMs: 40000,
  workerReadyMs: 15000,
  frontendReadyMs: 30000,
  migrationTimeoutMs: 60000,
  gracefulShutdownMs: 5000,
  healthPollIntervalMs: 500,
};

export const DOCKER_COMPOSE_SERVICES = ['hopper-postgres'];

/** Environment injected into locally spawned processes (durable local queue). */
export const LOCAL_RUNTIME_ENV = {
  QUEUE_STORE: 'postgres',
  QUEUE_TRANSPORT: 'off',
  COORDINATION_BACKEND: 'postgres',
};
