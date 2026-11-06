#!/usr/bin/env node
/**
 * Hopper — Local Infrastructure Control
 *
 *   npm run infra:up     start PostgreSQL + pgvector (preserves data)
 *   npm run infra:down   stop containers (preserves volumes)
 *   npm run infra:reset  DESTROY the local database volume (requires --force)
 */

import { execSync } from 'node:child_process';
import { REPO_ROOT, PORTS } from './config.mjs';
import { COLORS } from './logger.mjs';
import { checkPostgresHealth, waitForCondition } from './health-check.mjs';

const action = process.argv[2] || 'up';

function run(command) {
  console.log(`${COLORS.gray}$ ${command}${COLORS.reset}`);
  execSync(command, { cwd: REPO_ROOT, stdio: 'inherit' });
}

async function main() {
  if (action === 'up') {
    run('docker compose up -d hopper-postgres');
    await waitForCondition(() => checkPostgresHealth(PORTS.postgres), 45000, 500, 'PostgreSQL');
    console.log(`${COLORS.green}[OK]${COLORS.reset} PostgreSQL ready on port ${PORTS.postgres}`);
    return;
  }

  if (action === 'down') {
    // `stop` preserves containers and named volumes.
    run('docker compose stop hopper-postgres');
    console.log(`${COLORS.green}[OK]${COLORS.reset} PostgreSQL stopped; data volume preserved.`);
    return;
  }

  if (action === 'reset') {
    if (!process.argv.includes('--force')) {
      console.error(
        `${COLORS.red}Refusing to delete the local database volume.${COLORS.reset}\n` +
          `Re-run with: npm run infra:reset -- --force`
      );
      process.exit(1);
    }
    run('docker compose down -v');
    console.log(`${COLORS.yellow}[WARN]${COLORS.reset} Local database volume removed.`);
    return;
  }

  console.error(`Unknown action "${action}". Use: up | down | reset`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`${COLORS.red}Infrastructure command failed:${COLORS.reset} ${err.message}`);
  process.exit(1);
});
