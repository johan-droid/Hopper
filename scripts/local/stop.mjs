#!/usr/bin/env node
/**
 * Hopper — Graceful Local Development Shutdown Tool
 * Safely terminates the active Hopper session and any lingering Hopper development processes
 * without disturbing unrelated applications, databases, or system processes.
 */

import {
  SESSION_FILE,
  LOCK_FILE,
} from './config.mjs';
import { COLORS } from './logger.mjs';
import {
  loadSession,
  clearSession,
  releaseLock,
  isPidAlive,
  terminateProcess,
  findHopperProcesses,
} from './process-manager.mjs';

async function main() {
  console.log(`\n${COLORS.bold}${COLORS.yellow}==================================================`);
  console.log(`             HOPPER LOCAL DEV SHUTDOWN            `);
  console.log(`==================================================${COLORS.reset}\n`);

  const session = loadSession();
  let stoppedCount = 0;

  // 1. Terminate tracked child processes from session
  if (session?.processes) {
    const { tunnel, frontend, backend, worker } = session.processes;

    if (tunnel?.pid && isPidAlive(tunnel.pid)) {
      console.log(`Stopping Cloudflare Quick Tunnel (PID: ${tunnel.pid})...`);
      await terminateProcess(tunnel.pid, { label: 'Cloudflare Tunnel' });
      stoppedCount++;
    }

    if (frontend?.pid && isPidAlive(frontend.pid)) {
      console.log(`Stopping Frontend server (PID: ${frontend.pid})...`);
      await terminateProcess(frontend.pid, { label: 'Frontend' });
      stoppedCount++;
    }

    if (backend?.pid && isPidAlive(backend.pid)) {
      console.log(`Stopping Backend server (PID: ${backend.pid})...`);
      await terminateProcess(backend.pid, { label: 'Backend' });
      stoppedCount++;
    }

    if (worker?.pid && isPidAlive(worker.pid)) {
      console.log(`Stopping Background Worker (PID: ${worker.pid})...`);
      await terminateProcess(worker.pid, { label: 'Worker' });
      stoppedCount++;
    }
  }

  // 2. Terminate Orchestrator process if running separately
  if (session?.orchestratorPid && session.orchestratorPid !== process.pid && isPidAlive(session.orchestratorPid)) {
    console.log(`Stopping Orchestrator process (PID: ${session.orchestratorPid})...`);
    await terminateProcess(session.orchestratorPid, { label: 'Orchestrator' });
    stoppedCount++;
  }

  // 3. Scan for any remaining unmanaged/lingering Hopper development processes
  const lingering = findHopperProcesses();
  for (const proc of lingering) {
    if (proc.pid !== process.pid) {
      console.log(`Stopping leftover Hopper ${proc.type} process (PID: ${proc.pid})...`);
      await terminateProcess(proc.pid, { label: `leftover ${proc.type}` });
      stoppedCount++;
    }
  }

  // 4. Release locks and clean session file
  releaseLock();
  clearSession();

  if (stoppedCount > 0) {
    console.log(`\n${COLORS.green}${COLORS.bold}[OK] Successfully stopped ${stoppedCount} Hopper development process(es).${COLORS.reset}`);
  } else {
    console.log(`\n${COLORS.gray}No active Hopper development processes found.${COLORS.reset}`);
  }

  console.log(`${COLORS.gray}Note: Docker infrastructure (PostgreSQL & Redis) volumes and data are preserved.${COLORS.reset}\n`);
}

main().catch((err) => {
  console.error('Error during Hopper shutdown:', err.message);
  process.exit(1);
});

