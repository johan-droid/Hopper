#!/usr/bin/env node
/**
 * Hopper — Local Development Status Reporter
 * Inspects running processes, ports, Docker containers, and live HTTP health endpoints.
 */

import {
  PORTS,
  URLS,
  LOCK_FILE,
  SESSION_FILE,
} from './config.mjs';
import { COLORS } from './logger.mjs';
import {
  checkPostgresHealth,
  checkRedisHealth,
  checkBackendHealth,
  verifyWebhookRoute,
  checkFrontendHealth,
} from './health-check.mjs';
import {
  loadSession,
  isPidAlive,
  getProcessInfo,
  findHopperProcesses,
} from './process-manager.mjs';

async function main() {
  console.log(`\n${COLORS.bold}${COLORS.cyan}==================================================`);
  console.log(`            HOPPER LOCAL DEV STATUS               `);
  console.log(`==================================================${COLORS.reset}\n`);

  const session = loadSession();
  const lingeringProcesses = findHopperProcesses();

  // Check Orchestrator
  let orchestratorStatus = `${COLORS.gray}NOT RUNNING${COLORS.reset}`;
  let orchestratorDetail = 'No active session lock';

  if (session?.orchestratorPid) {
    if (isPidAlive(session.orchestratorPid)) {
      orchestratorStatus = `${COLORS.green}[OK] RUNNING${COLORS.reset}`;
      orchestratorDetail = `PID ${session.orchestratorPid} (started ${session.startedAt})`;
    } else {
      orchestratorStatus = `${COLORS.yellow}[WARN] STALE${COLORS.reset}`;
      orchestratorDetail = `PID ${session.orchestratorPid} exited unexpectedly`;
    }
  }

  console.log(`${COLORS.bold}ORCHESTRATOR:${COLORS.reset}      ${orchestratorStatus} ${COLORS.gray}(${orchestratorDetail})${COLORS.reset}`);

  // Infrastructure Checks
  const pgHealth = await checkPostgresHealth(PORTS.postgres);
  const redisHealth = await checkRedisHealth(PORTS.redis);

  console.log(
    `${COLORS.bold}POSTGRESQL (5432):${COLORS.reset} ${
      pgHealth.healthy ? `${COLORS.green}[OK] HEALTHY${COLORS.reset}` : `${COLORS.red}[FAIL] UNHEALTHY${COLORS.reset}`
    } ${COLORS.gray}(${pgHealth.detail})${COLORS.reset}`
  );

  console.log(
    `${COLORS.bold}REDIS (6379):${COLORS.reset}      ${
      redisHealth.healthy ? `${COLORS.green}[OK] HEALTHY${COLORS.reset}` : `${COLORS.red}[FAIL] UNHEALTHY${COLORS.reset}`
    } ${COLORS.gray}(${redisHealth.detail})${COLORS.reset}`
  );

  // Backend Health
  const backendHealth = await checkBackendHealth(URLS.backendHealth);
  const backendPid = session?.processes?.backend?.pid;
  const backendPidAlive = backendPid ? isPidAlive(backendPid) : false;

  console.log(
    `${COLORS.bold}BACKEND (3000):${COLORS.reset}    ${
      backendHealth.healthy ? `${COLORS.green}[OK] HEALTHY${COLORS.reset}` : `${COLORS.red}[FAIL] OFFLINE${COLORS.reset}`
    } ${COLORS.gray}(${backendHealth.detail}${backendPid ? `, PID: ${backendPid} ${backendPidAlive ? 'alive' : 'dead'}` : ''})${COLORS.reset}`
  );

  // Webhook Route Verification
  if (backendHealth.healthy) {
    const webhookCheck = await verifyWebhookRoute(URLS.backend, URLS.webhookPath);
    console.log(
      `${COLORS.bold}WEBHOOK ROUTE:${COLORS.reset}     ${
        webhookCheck.verified ? `${COLORS.green}[OK] VERIFIED${COLORS.reset}` : `${COLORS.yellow}[WARN] DEGRADED${COLORS.reset}`
      } ${COLORS.gray}(${webhookCheck.detail})${COLORS.reset}`
    );
  }

  // Worker Status
  const workerPid = session?.processes?.worker?.pid;
  const workerAlive = workerPid ? isPidAlive(workerPid) : false;
  console.log(
    `${COLORS.bold}WORKER:${COLORS.reset}            ${
      workerAlive ? `${COLORS.green}[OK] RUNNING${COLORS.reset}` : `${COLORS.gray}NOT RUNNING${COLORS.reset}`
    } ${COLORS.gray}(${workerPid ? `PID: ${workerPid}` : 'no worker registered'})${COLORS.reset}`
  );

  // Frontend Health
  const frontendHealth = await checkFrontendHealth(URLS.frontend);
  const frontendPid = session?.processes?.frontend?.pid;
  const frontendPidAlive = frontendPid ? isPidAlive(frontendPid) : false;

  console.log(
    `${COLORS.bold}FRONTEND (5173):${COLORS.reset}   ${
      frontendHealth.healthy ? `${COLORS.green}[OK] READY${COLORS.reset}` : `${COLORS.gray}OFFLINE${COLORS.reset}`
    } ${COLORS.gray}(${frontendHealth.detail}${frontendPid ? `, PID: ${frontendPid} ${frontendPidAlive ? 'alive' : 'dead'}` : ''})${COLORS.reset}`
  );

  // Tunnel Status
  const tunnelPid = session?.processes?.tunnel?.pid;
  const tunnelAlive = tunnelPid ? isPidAlive(tunnelPid) : false;
  const publicUrl = session?.urls?.publicTunnel;

  if (tunnelAlive && publicUrl) {
    console.log(
      `${COLORS.bold}CLOUDFLARE TUNNEL:${COLORS.reset} ${COLORS.green}[OK] ACTIVE${COLORS.reset} ${COLORS.gray}(PID: ${tunnelPid})${COLORS.reset}`
    );
    console.log(`  Public URL:      ${COLORS.cyan}${publicUrl}${COLORS.reset}`);
    console.log(`  Webhook URL:     ${COLORS.cyan}${session.urls.webhook}${COLORS.reset}`);
  } else {
    console.log(`${COLORS.bold}CLOUDFLARE TUNNEL:${COLORS.reset} ${COLORS.gray}INACTIVE${COLORS.reset}`);
  }

  // Active / Lingering Hopper Processes
  if (lingeringProcesses.length > 0) {
    console.log(`\n${COLORS.bold}DETECTED HOPPER PROCESSES:${COLORS.reset}`);
    for (const p of lingeringProcesses) {
      console.log(`  - [${p.type.padEnd(10)}] PID: ${p.pid} (${p.info?.cmdline?.slice(0, 70) || 'unknown'})`);
    }
  }

  console.log(`\n${COLORS.bold}${'-'.repeat(50)}${COLORS.reset}\n`);
}

main().catch((err) => {
  console.error('Error checking Hopper status:', err.message);
  process.exit(1);
});
