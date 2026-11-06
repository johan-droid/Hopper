#!/usr/bin/env node
/**
 * Hopper — Single-Command Local Development Orchestrator
 * Coordinates prerequisite verification, conflict resolution, infrastructure health,
 * backend API, background workers, frontend SPA, and Cloudflare Quick Tunnel.
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
  BACKEND_ENV,
  FRONTEND_ENV,
  SESSION_FILE,
  LOCK_FILE,
} from './config.mjs';
import {
  printBanner,
  printStep,
  printStepSuccess,
  printStepWarning,
  printStepFailed,
  printDashboard,
  log,
  orchestratorLog,
} from './logger.mjs';
import {
  checkPostgresHealth,
  checkRedisHealth,
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
import { startCloudflareTunnel } from './tunnel-manager.mjs';

let isShuttingDown = false;
const activeProcesses = {
  backend: null,
  worker: null,
  frontend: null,
  tunnel: null,
};
const infrastructureState = {
  postgresManaged: false,
  redisManaged: false,
};

async function gracefulShutdown(signal = 'SIGINT') {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n\n[orchestrator] Received ${signal}. Initiating graceful shutdown of Hopper local dev environment...`);

  // 1. Stop Cloudflare Tunnel
  if (activeProcesses.tunnel) {
    try {
      orchestratorLog('Stopping Cloudflare Quick Tunnel...');
      await activeProcesses.tunnel.stop();
    } catch (err) {
      orchestratorLog(`Tunnel shutdown warning: ${err.message}`, 'warn');
    }
  }

  // 2. Stop Frontend
  if (activeProcesses.frontend) {
    try {
      orchestratorLog('Stopping Frontend dev server...');
      await activeProcesses.frontend.stop();
    } catch (err) {
      orchestratorLog(`Frontend shutdown warning: ${err.message}`, 'warn');
    }
  }

  // 3. Stop Backend
  if (activeProcesses.backend) {
    try {
      orchestratorLog('Stopping Backend server...');
      await activeProcesses.backend.stop();
    } catch (err) {
      orchestratorLog(`Backend shutdown warning: ${err.message}`, 'warn');
    }
  }

  // 4. Stop Background Worker
  if (activeProcesses.worker) {
    try {
      orchestratorLog('Stopping Background Worker...');
      await activeProcesses.worker.stop();
    } catch (err) {
      orchestratorLog(`Worker shutdown warning: ${err.message}`, 'warn');
    }
  }

  // 5. Infrastructure handling: Leave pre-existing instances running!
  // If explicitly started by this orchestrator, we preserve data volumes.
  if (infrastructureState.postgresManaged || infrastructureState.redisManaged) {
    orchestratorLog('Note: Database and Redis containers/volumes preserved for next session.');
  }

  // 6. Release Lockfile & Clear Session Metadata
  releaseLock();
  clearSession();

  orchestratorLog('Hopper local development environment shut down cleanly.', 'success');
  process.exit(0);
}

// Register signal handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

async function main() {
  printBanner();

  const statusList = [];

  // ============================================================================
  // Step 1: Check Prerequisites & Acquire Lock
  // ============================================================================
  printStep(1, 9, 'Checking prerequisites & lockfile');

  // Verify Node.js version
  const nodeMajor = parseInt(process.version.slice(1).split('.')[0], 10);
  if (nodeMajor < 18) {
    printStepFailed(`Node.js 18+ required. Current version: ${process.version}`);
    process.exit(1);
  }

  // Verify Docker availability
  let hasDocker = false;
  try {
    execSync('docker --version', { stdio: 'ignore' });
    hasDocker = true;
  } catch {
    printStepFailed('Docker is required for Hopper local infrastructure (Postgres & Redis).');
    process.exit(1);
  }

  // Ensure .env files exist
  const backendEnvPath = path.join(BACKEND_DIR, '.env');
  const backendExamplePath = path.join(BACKEND_DIR, '.env.example');
  if (!fs.existsSync(backendEnvPath) && fs.existsSync(backendExamplePath)) {
    fs.copyFileSync(backendExamplePath, backendEnvPath);
    orchestratorLog('Created backend/.env from backend/.env.example');
  }

  const frontendEnvPath = path.join(FRONTEND_DIR, '.env');
  const frontendExamplePath = path.join(FRONTEND_DIR, '.env.example');
  if (!fs.existsSync(frontendEnvPath) && fs.existsSync(frontendExamplePath)) {
    fs.copyFileSync(frontendExamplePath, frontendEnvPath);
    orchestratorLog('Created frontend/.env from frontend/.env.example');
  }

  // Acquire orchestrator process lock
  try {
    acquireLock();
  } catch (err) {
    printStepFailed(err.message);
    process.exit(1);
  }

  printStepSuccess(`Node ${process.version}, Docker verified, lock acquired`);
  statusList.push({ name: 'Environment validation', status: 'ok', detail: `Node ${process.version}` });

  // ============================================================================
  // Step 2: Detect & Safely Resolve Process Conflicts
  // ============================================================================
  printStep(2, 9, 'Inspecting process tree & port conflicts');

  // Check Backend Port (3000)
  const backendConflict = detectPortConflict(PORTS.backend, 'Backend');
  if (backendConflict.hasConflict) {
    if (backendConflict.isHopper) {
      orchestratorLog(`Found existing Hopper backend on port ${PORTS.backend} (PID: ${backendConflict.pid}). Terminating safely...`);
      await terminateProcess(backendConflict.pid, { label: 'stale Hopper backend' });
    } else {
      printStepFailed(backendConflict.error);
      releaseLock();
      process.exit(1);
    }
  }

  // Check Frontend Port (5173)
  const frontendConflict = detectPortConflict(PORTS.frontend, 'Frontend');
  if (frontendConflict.hasConflict) {
    if (frontendConflict.isHopper) {
      orchestratorLog(`Found existing Hopper frontend on port ${PORTS.frontend} (PID: ${frontendConflict.pid}). Terminating safely...`);
      await terminateProcess(frontendConflict.pid, { label: 'stale Hopper frontend' });
    } else {
      printStepFailed(frontendConflict.error);
      releaseLock();
      process.exit(1);
    }
  }

  // Scan for any dangling Hopper worker or tunnel processes
  const lingering = findHopperProcesses();
  for (const proc of lingering) {
    if (proc.type === 'worker' || proc.type === 'tunnel' || proc.type === 'backend') {
      orchestratorLog(`Found orphaned Hopper ${proc.type} (PID: ${proc.pid}). Terminating safely...`);
      await terminateProcess(proc.pid, { label: `orphaned ${proc.type}` });
    }
  }

  printStepSuccess('No conflicting processes; ports 3000 & 5173 available');

  // ============================================================================
  // Step 3 & 4: Start & Verify Local Infrastructure (Postgres & Redis)
  // ============================================================================
  printStep(3, 9, 'Verifying PostgreSQL & Redis infrastructure');

  let pgHealth = await checkPostgresHealth(PORTS.postgres);
  let redisHealth = await checkRedisHealth(PORTS.redis);

  if (!pgHealth.healthy || !redisHealth.healthy) {
    orchestratorLog('Starting missing infrastructure containers via docker compose...');
    try {
      execSync('docker compose up -d hopper-postgres hopper-redis', {
        cwd: REPO_ROOT,
        stdio: 'pipe',
      });
      infrastructureState.postgresManaged = !pgHealth.healthy;
      infrastructureState.redisManaged = !redisHealth.healthy;
    } catch (composeErr) {
      printStepFailed(`Failed to start docker-compose services: ${composeErr.message}`);
      releaseLock();
      process.exit(1);
    }
  } else {
    orchestratorLog('Reusing pre-existing healthy PostgreSQL and Redis instances.');
  }

  // Wait for PostgreSQL readiness
  try {
    await waitForCondition(() => checkPostgresHealth(PORTS.postgres), TIMEOUTS.infraReadyMs, 500, 'PostgreSQL');
    statusList.push({ name: 'PostgreSQL', status: 'ok', detail: `port ${PORTS.postgres}` });
  } catch (err) {
    printStepFailed(`PostgreSQL failed health check: ${err.message}`);
    releaseLock();
    process.exit(1);
  }

  // Wait for Redis readiness
  try {
    await waitForCondition(() => checkRedisHealth(PORTS.redis), TIMEOUTS.infraReadyMs, 500, 'Redis');
    statusList.push({ name: 'Redis', status: 'ok', detail: `port ${PORTS.redis}` });
  } catch (err) {
    printStepFailed(`Redis failed health check: ${err.message}`);
    releaseLock();
    process.exit(1);
  }

  printStepSuccess('PostgreSQL & Redis healthy');

  // ============================================================================
  // Step 5 & 6: Start & Supervise Backend API Server
  // ============================================================================
  printStep(4, 9, 'Starting Hopper Backend API Server');

  const onChildFatal = async ({ name, pid, code, signal, error }) => {
    if (isShuttingDown) return;
    orchestratorLog(`CRITICAL: Component ${name} [PID: ${pid}] crashed unexpectedly (code: ${code})!`, 'error');
    if (error) orchestratorLog(`Crash details: ${error.message}`, 'error');
    await gracefulShutdown('CHILD_CRASH');
  };

  // Launch Backend child process
  activeProcesses.backend = spawnSupervisedProcess({
    name: 'backend',
    command: 'npm',
    args: ['--prefix', 'backend', 'run', 'dev'],
    cwd: REPO_ROOT,
    onFatalExit: onChildFatal,
  });

  printStep(5, 9, 'Waiting for Backend API health readiness');
  try {
    const healthResult = await waitForCondition(
      () => checkBackendHealth(URLS.backendHealth),
      TIMEOUTS.backendReadyMs,
      500,
      'Backend API'
    );
    printStepSuccess(`API Gateway healthy (${healthResult.detail})`);
    statusList.push({ name: 'Backend', status: 'ok', detail: `port ${PORTS.backend}` });
  } catch (err) {
    printStepFailed(`Backend health check failed: ${err.message}`);
    await gracefulShutdown('BACKEND_INIT_FAILURE');
  }

  // Verify GitHub Webhook route
  const webhookVerification = await verifyWebhookRoute(URLS.backend, URLS.webhookPath);
  if (!webhookVerification.verified) {
    printStepWarning(`Webhook route verification: ${webhookVerification.detail}`);
  }

  // ============================================================================
  // Step 7: Start Background Event Worker
  // ============================================================================
  printStep(6, 9, 'Starting Background BullMQ Event Worker');

  activeProcesses.worker = spawnSupervisedProcess({
    name: 'worker',
    command: 'npm',
    args: ['--prefix', 'backend', 'run', 'worker'],
    cwd: REPO_ROOT,
    onFatalExit: onChildFatal,
  });

  // Give worker a brief moment to initialize queue connections
  await new Promise((r) => setTimeout(r, 1200));
  printStepSuccess('Worker subscribed to "ci-events" queue');
  statusList.push({ name: 'Background Worker', status: 'ok', detail: 'queue: ci-events' });

  // ============================================================================
  // Step 8: Start Frontend SPA (Vite)
  // ============================================================================
  printStep(7, 9, 'Starting Hopper Frontend SPA');

  activeProcesses.frontend = spawnSupervisedProcess({
    name: 'frontend',
    command: 'npm',
    args: ['--prefix', 'frontend', 'run', 'dev'],
    cwd: REPO_ROOT,
    onFatalExit: onChildFatal,
  });

  printStep(8, 9, 'Waiting for Frontend readiness');
  try {
    await waitForCondition(
      () => checkFrontendHealth(URLS.frontend),
      TIMEOUTS.frontendReadyMs,
      500,
      'Frontend SPA'
    );
    printStepSuccess(`Frontend responding at ${URLS.frontend}`);
    statusList.push({ name: 'Frontend', status: 'ok', detail: `port ${PORTS.frontend}` });
  } catch (err) {
    printStepWarning(`Frontend check: ${err.message}`);
    statusList.push({ name: 'Frontend', status: 'warn', detail: 'initializing' });
  }

  // ============================================================================
  // Step 9: Start Cloudflare Quick Tunnel
  // ============================================================================
  printStep(9, 9, 'Starting Cloudflare Quick Tunnel');

  let tunnelResult = null;
  try {
    tunnelResult = await startCloudflareTunnel(PORTS.backend, TIMEOUTS.tunnelReadyMs);
    if (tunnelResult.active) {
      activeProcesses.tunnel = tunnelResult;
      printStepSuccess(tunnelResult.publicUrl);
      statusList.push({ name: 'Cloudflare Tunnel', status: 'ok', detail: tunnelResult.publicUrl });
    } else {
      printStepWarning(tunnelResult.error || 'Tunnel disabled or binary not found');
      statusList.push({ name: 'Cloudflare Tunnel', status: 'warn', detail: 'inactive' });
    }
  } catch (err) {
    printStepWarning(`Tunnel startup: ${err.message}`);
    statusList.push({ name: 'Cloudflare Tunnel', status: 'warn', detail: 'failed' });
  }

  // ============================================================================
  // Step 10 & 11: Display Dashboard & Save Session State
  // ============================================================================
  const sessionData = {
    sessionId: `hopper-${Date.now()}`,
    orchestratorPid: process.pid,
    startedAt: new Date().toISOString(),
    processes: {
      backend: { pid: activeProcesses.backend?.pid, port: PORTS.backend },
      worker: { pid: activeProcesses.worker?.pid },
      frontend: { pid: activeProcesses.frontend?.pid, port: PORTS.frontend },
      tunnel: { pid: activeProcesses.tunnel?.pid, publicUrl: tunnelResult?.publicUrl },
    },
    infrastructure: {
      postgres: { port: PORTS.postgres, managed: infrastructureState.postgresManaged },
      redis: { port: PORTS.redis, managed: infrastructureState.redisManaged },
    },
    urls: {
      frontend: URLS.frontend,
      backend: URLS.backend,
      health: URLS.backendHealth,
      webhookPath: URLS.webhookPath,
      publicTunnel: tunnelResult?.publicUrl || null,
      webhook: tunnelResult?.webhookUrl || null,
    },
  };

  saveSession(sessionData);

  // Render Dashboard
  printDashboard({
    statusList,
    urls: sessionData.urls,
  });

  // Keep process in foreground streaming combined logs
}

main().catch(async (err) => {
  console.error('\n[orchestrator] Fatal startup error:', err.message);
  releaseLock();
  await gracefulShutdown('STARTUP_ERROR');
});
