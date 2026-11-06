/**
 * Hopper Local Development — Console Logger & Dashboard
 */

export const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const LABEL_WIDTH = 12;

export function log(component, message, level = 'info') {
  const color =
    level === 'error'
      ? COLORS.red
      : level === 'warn'
        ? COLORS.yellow
        : level === 'success'
          ? COLORS.green
          : COLORS.cyan;

  const label = `[${component}]`.padEnd(LABEL_WIDTH);
  console.log(`${color}${label}${COLORS.reset} ${message}`);
}

export function orchestratorLog(message, level = 'info') {
  log('orchestrator', message, level);
}

export function writeLogToFile() {
  // Combined logs are streamed to stdout; the orchestrator does not persist a
  // duplicate log file (session metadata lives in .runtime/local/session.json).
}

export function printBanner() {
  console.log(`\n${COLORS.bold}${COLORS.cyan}==================================================`);
  console.log(`                  H O P P E R                     `);
  console.log(`     CI Failure Diagnosis Engine — Local Dev      `);
  console.log(`==================================================${COLORS.reset}`);
  console.log(`${COLORS.gray}Vercel-native stack · PostgreSQL + pgvector · no Redis${COLORS.reset}\n`);
}

export function printStep(step, total, title) {
  console.log(`\n${COLORS.bold}[${step}/${total}]${COLORS.reset} ${title}`);
}

export function printStepSuccess(detail) {
  console.log(`  ${COLORS.green}[OK]${COLORS.reset} ${detail}`);
}

export function printStepWarning(detail) {
  console.log(`  ${COLORS.yellow}[WARN]${COLORS.reset} ${detail}`);
}

export function printStepFailed(detail) {
  console.log(`  ${COLORS.red}[FAIL]${COLORS.reset} ${detail}`);
}

export function printDashboard({ statusList = [], urls = {} }) {
  console.log(`\n${COLORS.bold}${COLORS.green}Hopper is running.${COLORS.reset}\n`);

  for (const item of statusList) {
    const mark =
      item.status === 'ok'
        ? `${COLORS.green}[OK]${COLORS.reset}`
        : item.status === 'warn'
          ? `${COLORS.yellow}[WARN]${COLORS.reset}`
          : `${COLORS.red}[FAIL]${COLORS.reset}`;
    console.log(`  ${mark} ${item.name.padEnd(22)} ${COLORS.gray}${item.detail || ''}${COLORS.reset}`);
  }

  console.log(`\n${COLORS.bold}Endpoints${COLORS.reset}`);
  console.log(`  Frontend        ${COLORS.cyan}${urls.frontend}${COLORS.reset}`);
  console.log(`  API             ${COLORS.cyan}${urls.backend}${COLORS.reset}`);
  console.log(`  Health          ${COLORS.cyan}${urls.health}${COLORS.reset}`);
  console.log(`  GitHub webhook  ${COLORS.cyan}${urls.backend}${urls.webhookPath}${COLORS.reset}`);
  console.log(
    `\n${COLORS.gray}Queue: PostgreSQL durable outbox (Vercel Queues in production).${COLORS.reset}`
  );
  console.log(`${COLORS.gray}Stop with Ctrl+C, then 'npm run stop' if anything lingers.${COLORS.reset}\n`);
}
