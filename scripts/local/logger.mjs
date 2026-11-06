/**
 * Hopper Local Development Orchestrator — Unified Logger & Terminal Dashboard
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { LOGS_DIR } from './config.mjs';

export const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgBlue: '\x1b[44m',
};

const COMPONENT_COLORS = {
  orchestrator: COLORS.cyan,
  infra: COLORS.blue,
  backend: COLORS.green,
  worker: COLORS.magenta,
  frontend: COLORS.yellow,
  tunnel: COLORS.cyan,
};

const COMBINED_LOG_PATH = path.join(LOGS_DIR, 'combined.log');

function timestamp() {
  const d = new Date();
  return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export function writeLogToFile(component, message) {
  try {
    const time = new Date().toISOString();
    const cleanMessage = message.replace(/\x1b\[[0-9;]*m/g, '');
    const line = `[${time}] [${component.toUpperCase()}] ${cleanMessage}\n`;
    fs.appendFileSync(COMBINED_LOG_PATH, line);
    fs.appendFileSync(path.join(LOGS_DIR, `${component}.log`), line);
  } catch {
    // Avoid crashing logger on write failure
  }
}

export function log(component, message, level = 'info') {
  const timeStr = timestamp();
  const color = COMPONENT_COLORS[component] || COLORS.white;
  const compTag = `${color}[${component.padEnd(12)}]${COLORS.reset}`;
  const timeTag = `${COLORS.gray}${timeStr}${COLORS.reset}`;

  let levelTag = '';
  if (level === 'error') {
    levelTag = ` ${COLORS.red}${COLORS.bold}[ERROR]${COLORS.reset}`;
  } else if (level === 'warn') {
    levelTag = ` ${COLORS.yellow}[WARN]${COLORS.reset}`;
  } else if (level === 'success') {
    levelTag = ` ${COLORS.green}[OK]${COLORS.reset}`;
  }

  process.stdout.write(`${compTag} ${timeTag}${levelTag} ${message}\n`);
  writeLogToFile(component, message);
}

export function orchestratorLog(message, level = 'info') {
  log('orchestrator', message, level);
}

export function printBanner() {
  console.log(`\n${COLORS.bold}${COLORS.cyan}==================================================`);
  console.log(`                 HOPPER LOCAL DEV                 `);
  console.log(`  Unified CI/CD Failure Diagnosis & SDLC Engine   `);
  console.log(`==================================================${COLORS.reset}\n`);
}

export function printStep(stepNum, totalSteps, stepName) {
  const prefix = `[${stepNum}/${totalSteps}]`;
  process.stdout.write(`${COLORS.bold}${prefix}${COLORS.reset} ${stepName.padEnd(46, '.')} `);
}

export function printStepSuccess(details = '') {
  console.log(`${COLORS.green}${COLORS.bold}[OK]${COLORS.reset}${details ? ` ${COLORS.gray}(${details})${COLORS.reset}` : ''}`);
}

export function printStepWarning(details = '') {
  console.log(`${COLORS.yellow}${COLORS.bold}[WARN]${COLORS.reset}${details ? ` ${COLORS.yellow}(${details})${COLORS.reset}` : ''}`);
}

export function printStepFailed(errorMsg = '') {
  console.log(`${COLORS.red}${COLORS.bold}[FAILED]${COLORS.reset}`);
  if (errorMsg) {
    console.log(`       ${COLORS.red}└─ ${errorMsg}${COLORS.reset}`);
  }
}

export function printDashboard(summary) {
  const line = '='.repeat(50);
  const subLine = '-'.repeat(50);

  console.log(`\n${COLORS.bold}${line}`);
  console.log('                 HOPPER LOCAL DEV');
  console.log(`${line}${COLORS.reset}\n`);

  for (const item of summary.statusList) {
    const mark = item.status === 'ok'
      ? `${COLORS.green}[OK]${COLORS.reset}`
      : item.status === 'warn'
      ? `${COLORS.yellow}[WARN]${COLORS.reset}`
      : `${COLORS.red}[FAIL]${COLORS.reset}`;
    console.log(`${mark} ${item.name}${item.detail ? ` ${COLORS.gray}(${item.detail})${COLORS.reset}` : ''}`);
  }

  console.log(`\n${COLORS.bold}${subLine}`);
  console.log('LOCAL URLS');
  console.log(`${subLine}${COLORS.reset}\n`);

  console.log(`Frontend:       ${COLORS.cyan}${summary.urls.frontend}${COLORS.reset}`);
  console.log(`Backend:        ${COLORS.cyan}${summary.urls.backend}${COLORS.reset}`);
  console.log(`Health:         ${COLORS.cyan}${summary.urls.health}${COLORS.reset}`);

  console.log(`\n${COLORS.bold}${subLine}`);
  console.log('GITHUB INTEGRATION');
  console.log(`${subLine}${COLORS.reset}\n`);

  if (summary.urls.publicTunnel) {
    console.log(`Public URL:     ${COLORS.green}${summary.urls.publicTunnel}${COLORS.reset}`);
    console.log(`Webhook URL:    ${COLORS.green}${summary.urls.webhook}${COLORS.reset}`);
    console.log(`${COLORS.gray}Note: Quick Tunnel URLs change upon new session creation.${COLORS.reset}`);
  } else {
    console.log(`Public URL:     ${COLORS.yellow}Not active (cloudflared not running or failed)${COLORS.reset}`);
    console.log(`Webhook URL:    ${COLORS.yellow}${summary.urls.backend}${summary.urls.webhookPath} (local only)${COLORS.reset}`);
  }

  console.log(`\n${COLORS.bold}${subLine}${COLORS.reset}\n`);
  console.log(`${COLORS.bold}${COLORS.green}All services are running.${COLORS.reset}\n`);
  console.log(`Press ${COLORS.bold}CTRL+C${COLORS.reset} to stop the Hopper development environment safely.\n`);
  console.log(`${COLORS.gray}--- Streaming Combined Logs Below ---${COLORS.reset}\n`);
}
