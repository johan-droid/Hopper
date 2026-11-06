#!/usr/bin/env node
/**
 * Hopper — Local Development Status Reporter
 */

import { PORTS, URLS } from './config.mjs';
import { COLORS } from './logger.mjs';
import {
  checkPostgresHealth,
  checkBackendHealth,
  verifyWebhookRoute,
  checkFrontendHealth,
} from './health-check.mjs';
import { loadSession, isPidAlive, findHopperProcesses } from './process-manager.mjs';

async function main() {
  console.log(`\n${COLORS.bold}${COLORS.cyan}==================================================`);
  console.log(`            HOPPER LOCAL DEV STATUS               `);
  console.log(`==================================================${COLORS.reset}\n`);

  const session = loadSession();
  const lingering = findHopperProcesses();

  const orchestrator =
    session?.orchestratorPid && isPidAlive(session.orchestratorPid)
      ? `${COLORS.green}[OK] RUNNING${COLORS.reset} ${COLORS.gray}(PID ${session.orchestratorPid})${COLORS.reset}`
      : `${COLORS.gray}NOT RUNNING${COLORS.reset}`;
  console.log(`${COLORS.bold}ORCHESTRATOR:${COLORS.reset}   ${orchestrator}`);

  const pg = await checkPostgresHealth(PORTS.postgres);
  console.log(
    `${COLORS.bold}POSTGRESQL:${COLORS.reset}     ${
      pg.healthy ? `${COLORS.green}[OK] HEALTHY${COLORS.reset}` : `${COLORS.red}[FAIL] DOWN${COLORS.reset}`
    } ${COLORS.gray}(${pg.detail})${COLORS.reset}`
  );

  const backend = await checkBackendHealth(URLS.backendHealth);
  console.log(
    `${COLORS.bold}API:${COLORS.reset}            ${
      backend.healthy ? `${COLORS.green}[OK] HEALTHY${COLORS.reset}` : `${COLORS.red}[FAIL] OFFLINE${COLORS.reset}`
    } ${COLORS.gray}(${backend.detail})${COLORS.reset}`
  );

  if (backend.healthy && backend.data?.dependencies) {
    const deps = backend.data.dependencies;
    console.log(
      `${COLORS.bold}DATABASE:${COLORS.reset}       ${COLORS.gray}${deps.database?.status}${COLORS.reset} · ` +
        `${COLORS.bold}QUEUE:${COLORS.reset} ${COLORS.gray}${deps.queue?.status}${COLORS.reset}`
    );
    if (deps.queue?.metrics) {
      const m = deps.queue.metrics;
      console.log(
        `${COLORS.gray}  jobs: pending=${m.pending} processing=${m.processing} completed=${m.completed} failed=${m.failed} dead=${m.dead} · dlq=${deps.queue.deadLetters ?? 0}${COLORS.reset}`
      );
    }

    const webhook = await verifyWebhookRoute(URLS.backend, URLS.webhookPath);
    console.log(
      `${COLORS.bold}WEBHOOK:${COLORS.reset}        ${
        webhook.verified ? `${COLORS.green}[OK] MOUNTED${COLORS.reset}` : `${COLORS.yellow}[WARN] UNVERIFIED${COLORS.reset}`
      } ${COLORS.gray}(${webhook.detail})${COLORS.reset}`
    );
  }

  const workerPid = session?.processes?.worker?.pid;
  console.log(
    `${COLORS.bold}WORKER:${COLORS.reset}         ${
      workerPid && isPidAlive(workerPid)
        ? `${COLORS.green}[OK] RUNNING${COLORS.reset} ${COLORS.gray}(PID ${workerPid})${COLORS.reset}`
        : `${COLORS.gray}NOT RUNNING${COLORS.reset}`
    }`
  );

  const frontend = await checkFrontendHealth(URLS.frontend);
  console.log(
    `${COLORS.bold}FRONTEND:${COLORS.reset}       ${
      frontend.healthy ? `${COLORS.green}[OK] READY${COLORS.reset}` : `${COLORS.gray}OFFLINE${COLORS.reset}`
    } ${COLORS.gray}(${frontend.detail})${COLORS.reset}`
  );

  if (lingering.length > 0) {
    console.log(`\n${COLORS.bold}HOPPER PROCESSES:${COLORS.reset}`);
    for (const p of lingering) {
      console.log(`  - [${p.type.padEnd(12)}] PID ${p.pid}`);
    }
  }

  console.log(`\n${COLORS.gray}No Redis, Wrangler or cloudflared components are part of this stack.${COLORS.reset}\n`);
}

main().catch((err) => {
  console.error('Error checking Hopper status:', err.message);
  process.exit(1);
});
