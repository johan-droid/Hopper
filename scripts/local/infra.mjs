#!/usr/bin/env node
/**
 * Hopper — Local Infrastructure Control
 *
 *   npm run infra:up     start PostgreSQL + pgvector (preserves data)
 *   npm run infra:down   stop containers (preserves volumes)
 *   npm run infra:reset  DESTROY the local database volume (requires --force)
 */

import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, PORTS } from './config.mjs';
import { COLORS } from './logger.mjs';
import { checkPostgresHealth, waitForCondition } from './health-check.mjs';

const action = process.argv[2] || 'up';

function run(command) {
  console.log(`${COLORS.gray}$ ${command}${COLORS.reset}`);
  execSync(command, { cwd: REPO_ROOT, stdio: 'inherit' });
}

/**
 * `container_name` is pinned in docker-compose.yml, so a `hopper-postgres`
 * left behind by another checkout (renamed or re-cloned repo directory) makes
 * `docker compose up` fail with a name conflict. Reclaim it; volumes survive.
 */
export function reclaimStalePostgresContainer() {
  let project;
  let status;
  try {
    project = execSync(
      `docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' hopper-postgres`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    status = execSync(
      `docker inspect -f '{{ .State.Status }}' hopper-postgres`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
  } catch {
    return; // no container to reclaim
  }
  const ownProject = path.basename(REPO_ROOT).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (project === ownProject && status === 'running') return;
  run('docker rm -f hopper-postgres');
  console.log(
    `${COLORS.yellow}[WARN]${COLORS.reset} Reclaimed stale hopper-postgres container (${status || 'stopped'}) from compose project "${project}".`
  );
}

async function main() {
  if (action === 'up') {
    reclaimStalePostgresContainer();
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`${COLORS.red}Infrastructure command failed:${COLORS.reset} ${err.message}`);
    process.exit(1);
  });
}