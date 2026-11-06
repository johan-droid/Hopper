#!/usr/bin/env node
/**
 * Hopper — Graceful Local Shutdown
 *
 * Stops only Hopper-owned processes (identified by /proc inspection) and never
 * removes PostgreSQL data volumes.
 */

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
  let stopped = 0;

  if (session?.processes) {
    for (const name of ['frontend', 'backend', 'worker']) {
      const pid = session.processes[name]?.pid;
      if (pid && isPidAlive(pid)) {
        console.log(`Stopping ${name} (PID ${pid})...`);
        await terminateProcess(pid, { label: name });
        stopped++;
      }
    }
  }

  if (session?.orchestratorPid && session.orchestratorPid !== process.pid && isPidAlive(session.orchestratorPid)) {
    console.log(`Stopping orchestrator (PID ${session.orchestratorPid})...`);
    await terminateProcess(session.orchestratorPid, { label: 'orchestrator' });
    stopped++;
  }

  for (const proc of findHopperProcesses()) {
    if (proc.pid === process.pid) continue;
    console.log(`Stopping leftover Hopper ${proc.type} (PID ${proc.pid})...`);
    await terminateProcess(proc.pid, { label: `leftover ${proc.type}` });
    stopped++;
  }

  releaseLock();
  clearSession();

  if (stopped > 0) {
    console.log(`\n${COLORS.green}${COLORS.bold}[OK] Stopped ${stopped} Hopper process(es).${COLORS.reset}`);
  } else {
    console.log(`\n${COLORS.gray}No Hopper development processes were running.${COLORS.reset}`);
  }

  console.log(
    `${COLORS.gray}PostgreSQL container and data volume are preserved. Use 'npm run infra:down' to stop the container.${COLORS.reset}\n`
  );
}

main().catch((err) => {
  console.error('Error during Hopper shutdown:', err.message);
  process.exit(1);
});
