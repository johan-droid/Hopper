#!/usr/bin/env node
/**
 * Hopper — Single-Command Local Development Orchestrator
 *
 * `npm run dev` starts PostgreSQL (Docker), migrations, the API, the durable
 * queue worker and the Vite frontend, with dependency readiness gates and
 * safe cleanup. No Cloudflare account, Wrangler or cloudflared is required.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import {
  REPO_ROOT,
  BACKEND_DIR,
  FRONTEND_DIR,
  PORTS,
  URLS,
  TIMEOUTS,
  LOCAL_RUNTIME_ENV,
} from './config.mjs';
import {
  printBanner,
  printStep,
  printStepSuccess,
  printStepWarning,
  printStepFailed,
  printDashboard,
  orchestratorLog,
} from './logger.mjs';
import {
  checkPostgresHealth,
  checkBackendHealth,
  verifyWebhookRoute,
  checkFrontendHealth,
  waitForCondition,
} from './health-check.mjs';
import {
  acquireLock,
  releaseLock,
  saveSession,
  clearSession,
  findHopperProcesses,
  detectPortConflict,
  terminateProcess,
  spawnSupervisedProcess,
} from './process-manager.mjs';

const TOTAL_STEPS = 8;
let isShuttingDown = false;

const activeProcesses = { backend: null, worker: null, frontend: null };
const infrastructureState = { postgresManaged: false };

async function gracefulShutdown(signal = 'SIGINT') {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n\n[orchestrator] ${signal} received; stopping Hopper local dev...`);

  for (const name of ['frontend', 'backend', 'worker']) {
    const proc = activeProcesses[name];
    if (!proc) continue;
    try {
      orchestratorLog(`Stopping ${name}...`);
      await proc.stop();
    } catch (err) {
      orchestratorLog(`${name} shutdown warning: ${err.message}`, 'warn');
    }
  }

  if (infrastructureState.postgresManaged) {
    orchestratorLog('PostgreSQL container and data volume preserved for the next session.');
  }

  releaseLock();
  clearSession();
  orchestratorLog('Hopper local development environment stopped.', 'success');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

function ensureEnvFile(dir, label) {
  const envPath = path.join(dir, '.env');
  const examplePath = path.join(dir, '.env.example');
  if (!fs.existsSync(envPath) && fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
    orchestratorLog(`Created ${label}/.env from ${label}/.env.example`);
  }
}

function run(command, options = {}) {
  return execSync(command, { cwd: REPO_ROOT, stdio: 'pipe', encoding: 'utf8', ...options });
}

async function main() {
  printBanner();
  const statusList = [];

  // ---------------------------------------------------------------- 1. prereqs
  printStep(1, TOTAL_STEPS, 'Checking prerequisites');

  const nodeMajor = parseInt(process.version.slice(1).split('.')[0], 10);
  if (nodeMajor < 20) {
    printStepFailed(`Node.js 20+ required. Current: ${process.version}`);
    process.exit(1);
  }

  let hasDocker = false;
  try {
    run('docker --version');
    run('docker compose version');
    hasDocker = true;
  } catch {
    printStepFailed('Docker + Docker Compose are required for local PostgreSQL.');
    process.exit(1);
  }

  ensureEnvFile(BACKEND_DIR, 'backend');
  ensureEnvFile(FRONTEND_DIR, 'frontend');

  if (!fs.existsSync(path.join(REPO_ROOT, 'node_modules'))) {
    printStepFailed("Dependencies are missing. Run 'npm install' first.");
    process.exit(1);
  }

  try {
    acquireLock();
  } catch (err) {
    printStepFailed(err.message);
    process.exit(1);
  }

  printStepSuccess(`Node ${process.version}, Docker ${hasDocker ? 'ready' : 'missing'}, lock acquired`);
  statusList.push({ name: 'Environment', status: 'ok', detail: `Node ${process.version}` });

  // ------------------------------------------------------- 2. port conflicts
  printStep(2, TOTAL_STEPS, 'Inspecting ports and stale processes');

  for (const [port, name] of [
    [PORTS.backend, 'Backend'],
    [PORTS.frontend, 'Frontend'],
  ]) {
    const conflict = detectPortConflict(port, name);
    if (!conflict.hasConflict) continue;

    if (conflict.isHopper) {
      orchestratorLog(`Reclaiming port ${port} from stale Hopper ${conflict.component} (PID ${conflict.pid})`);
      await terminateProcess(conflict.pid, { label: `stale ${conflict.component}` });
    } else {
      printStepFailed(conflict.error);
      releaseLock();
      process.exit(1);
    }
  }

  for (const proc of findHopperProcesses()) {
    if (['worker', 'backend', 'frontend'].includes(proc.type)) {
      orchestratorLog(`Terminating orphaned ${proc.type} (PID ${proc.pid})`);
      await terminateProcess(proc.pid, { label: `orphaned ${proc.type}` });
    }
  }

  const pgConflict = detectPortConflict(PORTS.postgres, 'PostgreSQL');
  if (pgConflict.hasConflict && !pgConflict.isHopper) {
    orchestratorLog(
      `Port ${PORTS.postgres} is already in use (PID ${pgConflict.pid}); reusing that PostgreSQL instance.`,
      'warn'
    );
  }

  printStepSuccess(`Ports ${PORTS.backend} and ${PORTS.frontend} available`);
  statusList.push({ name: 'Ports', status: 'ok', detail: `${PORTS.backend}, ${PORTS.frontend}` });

  // ----------------------------------------------------------- 3. PostgreSQL
  printStep(3, TOTAL_STEPS, 'Starting PostgreSQL + pgvector');

  let pgHealth = await checkPostgresHealth(PORTS.postgres);
  if (!pgHealth.healthy) {
    orchestratorLog('Starting hopper-postgres via docker compose...');
    try {
      run('docker compose up -d hopper-postgres');
      infrastructureState.postgresManaged = true;
    } catch (err) {
      printStepFailed(`docker compose failed: ${err.message}`);
      releaseLock();
      process.exit(1);
    }
  } else {
    orchestratorLog('Reusing the already-running PostgreSQL instance.');
  }

  try {
    await waitForCondition(
      () => checkPostgresHealth(PORTS.postgres),
      TIMEOUTS.infraReadyMs,
      500,
      'PostgreSQL'
    );
    printStepSuccess(`PostgreSQL healthy on port ${PORTS.postgres}`);
    statusList.push({ name: 'PostgreSQL', status: 'ok', detail: `port ${PORTS.postgres}` });
  } catch (err) {
    printStepFailed(err.message);
    releaseLock();
    process.exit(1);
  }

  // ------------------------------------------------------------ 4. migrations
  printStep(4, TOTAL_STEPS, 'Applying database migrations');
  try {
    const output = run('npm --prefix backend run migrate', { timeout: TIMEOUTS.migrationTimeoutMs });
    const summary = output.trim().split('\n').filter(Boolean).slice(-1)[0] || 'applied';
    printStepSuccess(summary.slice(0, 160));
    statusList.push({ name: 'Migrations', status: 'ok', detail: 'up to date' });
  } catch (err) {
    printStepFailed(`Migration failed: ${(err.stdout || err.message || '').toString().slice(0, 600)}`);
    await gracefulShutdown('MIGRATION_FAILURE');
  }

  const onChildFatal = async ({ name, pid, code, error }) => {
    if (isShuttingDown) return;
    orchestratorLog(`CRITICAL: ${name} [PID ${pid}] exited unexpectedly (code ${code})`, 'error');
    if (error) orchestratorLog(error.message, 'error');
    await gracefulShutdown('CHILD_CRASH');
  };

  // -------------------------------------------------------------- 5. backend
  printStep(5, TOTAL_STEPS, 'Starting API server');
  activeProcesses.backend = spawnSupervisedProcess({
    name: 'backend',
    command: 'npm',
    args: ['--prefix', 'backend', 'run', 'dev'],
    cwd: REPO_ROOT,
    env: LOCAL_RUNTIME_ENV,
    onFatalExit: onChildFatal,
  });

  try {
    const health = await waitForCondition(
      () => checkBackendHealth(URLS.backendHealth),
      TIMEOUTS.backendReadyMs,
      500,
      'Backend API'
    );
    printStepSuccess(`API healthy (${health.detail})`);
    statusList.push({ name: 'API', status: 'ok', detail: `port ${PORTS.backend}` });
  } catch (err) {
    printStepFailed(err.message);
    await gracefulShutdown('BACKEND_INIT_FAILURE');
  }

  const webhook = await verifyWebhookRoute(URLS.backend, URLS.webhookPath);
  if (!webhook.verified) {
    printStepWarning(`Webhook route probe: ${webhook.detail}`);
  }

  // --------------------------------------------------------------- 6. worker
  printStep(6, TOTAL_STEPS, 'Starting durable queue worker');
  activeProcesses.worker = spawnSupervisedProcess({
    name: 'worker',
    command: 'npm',
    args: ['--prefix', 'backend', 'run', 'worker'],
    cwd: REPO_ROOT,
    env: LOCAL_RUNTIME_ENV,
    onFatalExit: onChildFatal,
  });
  await new Promise((r) => setTimeout(r, 1200));
  printStepSuccess('Worker draining the PostgreSQL job queue');
  statusList.push({ name: 'Queue worker', status: 'ok', detail: 'postgres outbox' });

  // ------------------------------------------------------------- 7. frontend
  printStep(7, TOTAL_STEPS, 'Starting frontend');
  activeProcesses.frontend = spawnSupervisedProcess({
    name: 'frontend',
    command: 'npm',
    args: ['--prefix', 'frontend', 'run', 'dev'],
    cwd: REPO_ROOT,
    env: { VITE_API_URL: URLS.backend },
    onFatalExit: onChildFatal,
  });

  try {
    await waitForCondition(
      () => checkFrontendHealth(URLS.frontend),
      TIMEOUTS.frontendReadyMs,
      500,
      'Frontend'
    );
    printStepSuccess(`Frontend ready at ${URLS.frontend}`);
    statusList.push({ name: 'Frontend', status: 'ok', detail: `port ${PORTS.frontend}` });
  } catch (err) {
    printStepWarning(`Frontend warm-up: ${err.message}`);
    statusList.push({ name: 'Frontend', status: 'warn', detail: 'still compiling' });
  }

  // -------------------------------------------------------------- 8. summary
  printStep(8, TOTAL_STEPS, 'Local environment ready');

  const session = {
    sessionId: `hopper-${Date.now()}`,
    orchestratorPid: process.pid,
    startedAt: new Date().toISOString(),
    processes: {
      backend: { pid: activeProcesses.backend?.pid, port: PORTS.backend },
      worker: { pid: activeProcesses.worker?.pid },
      frontend: { pid: activeProcesses.frontend?.pid, port: PORTS.frontend },
    },
    infrastructure: {
      postgres: { port: PORTS.postgres, managed: infrastructureState.postgresManaged },
    },
    urls: {
      frontend: URLS.frontend,
      backend: URLS.backend,
      health: URLS.backendHealth,
      webhookPath: URLS.webhookPath,
    },
  };

  saveSession(session);
  printDashboard({ statusList, urls: session.urls });
}

main().catch(async (err) => {
  console.error('\n[orchestrator] Fatal startup error:', err.message);
  releaseLock();
  await gracefulShutdown('STARTUP_ERROR');
});
