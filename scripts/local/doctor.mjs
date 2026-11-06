#!/usr/bin/env node
/**
 * Hopper — Local Environment Doctor
 *
 * Non-destructive diagnostics for the Vercel-native local stack.
 * Exit code 0 = healthy, 1 = at least one blocking failure.
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
  parseEnvFile,
} from './config.mjs';
import { COLORS } from './logger.mjs';
import { checkPostgresHealth, checkBackendHealth, checkFrontendHealth } from './health-check.mjs';
import { detectPortConflict } from './process-manager.mjs';

const results = [];
function record(name, status, detail) {
  results.push({ name, status, detail });
}

function commandWorks(command) {
  try {
    execSync(command, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`\n${COLORS.bold}${COLORS.cyan}HOPPER DOCTOR${COLORS.reset}\n`);

  // Toolchain
  const nodeMajor = parseInt(process.version.slice(1).split('.')[0], 10);
  record('Node.js >= 20', nodeMajor >= 20 ? 'ok' : 'fail', process.version);
  record('npm', commandWorks('npm --version') ? 'ok' : 'fail', commandWorks('npm --version') ? 'available' : 'missing');
  record('Docker', commandWorks('docker --version') ? 'ok' : 'fail', 'required for local PostgreSQL');
  record(
    'Docker Compose',
    commandWorks('docker compose version') ? 'ok' : 'fail',
    'v2 plugin required'
  );

  // Dependencies
  record('Root dependencies', fs.existsSync(path.join(REPO_ROOT, 'node_modules')) ? 'ok' : 'fail', 'node_modules');
  record('Backend dependencies', fs.existsSync(path.join(BACKEND_DIR, 'node_modules')) ? 'ok' : 'fail', 'backend/node_modules');
  record('Frontend dependencies', fs.existsSync(path.join(FRONTEND_DIR, 'node_modules')) ? 'ok' : 'fail', 'frontend/node_modules');

  // Environment files
  const backendEnvPath = path.join(BACKEND_DIR, '.env');
  const frontendEnvPath = path.join(FRONTEND_DIR, '.env');
  record('backend/.env', fs.existsSync(backendEnvPath) ? 'ok' : 'warn', "copy from backend/.env.example");
  record('frontend/.env', fs.existsSync(frontendEnvPath) ? 'ok' : 'warn', 'copy from frontend/.env.example');

  const backendEnv = parseEnvFile(backendEnvPath);
  record('DATABASE_URL', backendEnv.DATABASE_URL ? 'ok' : 'fail', 'PostgreSQL connection string');
  record(
    'GITHUB_APP_WEBHOOK_SECRET',
    backendEnv.GITHUB_APP_WEBHOOK_SECRET ? 'ok' : 'warn',
    'required for signed webhook ingress'
  );
  record(
    'AI_PROVIDER',
    ['mock', 'openai', 'anthropic'].includes(backendEnv.AI_PROVIDER || 'mock') ? 'ok' : 'warn',
    backendEnv.AI_PROVIDER || 'mock'
  );

  // Retired platform residue
  const retired = ['wrangler.toml', 'deploy/cloudflare', '.env.backup'];
  for (const rel of retired) {
    record(`No ${rel}`, fs.existsSync(path.join(REPO_ROOT, rel)) ? 'warn' : 'ok', 'Cloudflare artifact');
  }

  // Ports and services
  const pg = await checkPostgresHealth(PORTS.postgres);
  record('PostgreSQL', pg.healthy ? 'ok' : 'fail', pg.detail);

  const backendPort = detectPortConflict(PORTS.backend, 'Backend');
  record(
    'Port 3000',
    backendPort.hasConflict ? (backendPort.isHopper ? 'warn' : 'fail') : 'ok',
    backendPort.hasConflict ? `in use by PID ${backendPort.pid}` : 'free or Hopper-owned'
  );

  const backend = await checkBackendHealth(URLS.backendHealth);
  record('API health', backend.healthy ? 'ok' : 'warn', backend.detail);

  const frontend = await checkFrontendHealth(URLS.frontend);
  record('Frontend', frontend.healthy ? 'ok' : 'warn', frontend.detail);

  // Print
  for (const r of results) {
    const mark =
      r.status === 'ok'
        ? `${COLORS.green}[PASS]${COLORS.reset}`
        : r.status === 'warn'
          ? `${COLORS.yellow}[WARN]${COLORS.reset}`
          : `${COLORS.red}[FAIL]${COLORS.reset}`;
    console.log(`  ${mark} ${r.name.padEnd(28)} ${COLORS.gray}${r.detail || ''}${COLORS.reset}`);
  }

  const failures = results.filter((r) => r.status === 'fail');
  const warnings = results.filter((r) => r.status === 'warn');

  console.log(
    `\n${COLORS.bold}Summary:${COLORS.reset} ${results.filter((r) => r.status === 'ok').length} passed, ` +
      `${warnings.length} warnings, ${failures.length} failures\n`
  );

  if (failures.length > 0) {
    console.log(`${COLORS.red}Resolve the failures above before starting Hopper.${COLORS.reset}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Doctor failed:', err.message);
  process.exit(1);
});
