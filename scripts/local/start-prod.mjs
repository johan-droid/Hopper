#!/usr/bin/env node
/**
 * Hopper — Production-Parity Local Start
 *
 * Runs the COMPILED application: backend from `backend/dist`, the built frontend
 * from `vite preview`, and the compiled queue worker. Use after `npm run build`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT, BACKEND_DIR, FRONTEND_DIR, PORTS, URLS, LOCAL_RUNTIME_ENV } from './config.mjs';
import { COLORS, printBanner } from './logger.mjs';
import { checkBackendHealth, checkFrontendHealth, waitForCondition } from './health-check.mjs';
import { spawnSupervisedProcess } from './process-manager.mjs';

const processes = { backend: null, worker: null, frontend: null };

function fail(message) {
  console.error(`${COLORS.red}[FAIL]${COLORS.reset} ${message}`);
  process.exit(1);
}

function shutdown() {
  for (const proc of Object.values(processes)) {
    if (proc) proc.stop().catch(() => undefined);
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function main() {
  printBanner();

  const backendEntry = path.join(BACKEND_DIR, 'dist', 'server', 'index.js');
  const workerEntry = path.join(BACKEND_DIR, 'dist', 'workers', 'worker-entry.js');

  if (!fs.existsSync(backendEntry)) {
    fail(`Compiled backend missing at ${backendEntry}. Run 'npm run build' first.`);
  }
  if (!fs.existsSync(path.join(FRONTEND_DIR, 'dist', 'index.html'))) {
    fail("Compiled frontend missing. Run 'npm run build' first.");
  }

  processes.backend = spawnSupervisedProcess({
    name: 'backend',
    command: 'node',
    args: [backendEntry],
    cwd: BACKEND_DIR,
    env: { ...LOCAL_RUNTIME_ENV, NODE_ENV: 'production', PORT: String(PORTS.backend) },
  });

  await waitForCondition(() => checkBackendHealth(URLS.backendHealth), 30000, 500, 'compiled API');
  console.log(`${COLORS.green}[OK]${COLORS.reset} Compiled API healthy on ${URLS.backend}`);

  if (fs.existsSync(workerEntry)) {
    processes.worker = spawnSupervisedProcess({
      name: 'worker',
      command: 'node',
      args: [workerEntry],
      cwd: BACKEND_DIR,
      env: { ...LOCAL_RUNTIME_ENV, NODE_ENV: 'production' },
    });
    console.log(`${COLORS.green}[OK]${COLORS.reset} Compiled queue worker started`);
  } else {
    console.log(`${COLORS.yellow}[WARN]${COLORS.reset} Compiled worker missing; webhook inline processing only`);
  }

  processes.frontend = spawnSupervisedProcess({
    name: 'frontend',
    command: 'npm',
    args: ['--prefix', 'frontend', 'run', 'preview', '--', '--port', String(PORTS.frontend)],
    cwd: REPO_ROOT,
  });

  await waitForCondition(() => checkFrontendHealth(URLS.frontend), 30000, 500, 'compiled frontend');
  console.log(`${COLORS.green}[OK]${COLORS.reset} Compiled frontend at ${URLS.frontend}`);

  console.log(`\n${COLORS.bold}Production-parity stack running.${COLORS.reset} Ctrl+C to stop.\n`);
}

main().catch((err) => {
  console.error(err.message);
  shutdown();
});
