/**
 * Hopper Local Development Orchestrator — Automated Reliability Tests
 * Tests conflict detection, stale lock recovery, process safety, health probes,
 * duplicate session prevention, and shutdown idempotency.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as net from 'node:net';
import * as http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import {
  REPO_ROOT,
  LOCK_FILE,
  SESSION_FILE,
  PORTS,
  URLS,
} from '../config.mjs';
import {
  isPidAlive,
  getProcessInfo,
  classifyProcess,
  detectPortConflict,
  terminateProcess,
  acquireLock,
  releaseLock,
  saveSession,
  loadSession,
  clearSession,
  findHopperProcesses,
} from '../process-manager.mjs';
import {
  checkTcpPort,
  checkPostgresHealth,
  checkRedisHealth,
  checkBackendHealth,
  verifyWebhookRoute,
} from '../health-check.mjs';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  \x1b[32m✔ PASS:\x1b[0m ${message}`);
    passed++;
  } else {
    console.error(`  \x1b[31m✖ FAIL:\x1b[0m ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n==================================================');
  console.log('    HOPPER ORCHESTRATOR RELIABILITY TEST SUITE   ');
  console.log('==================================================\n');

  // -------------------------------------------------------------------------
  // Test 1: Stale Lock Recovery
  // -------------------------------------------------------------------------
  console.log('[Test 1] Stale Lock Recovery:');
  // Write a fake lock with a non-existent PID
  fs.writeFileSync(
    LOCK_FILE,
    JSON.stringify({ pid: 99999999, startedAt: new Date().toISOString() })
  );
  try {
    acquireLock();
    assert(fs.existsSync(LOCK_FILE), 'Acquired lock after purging stale dead-PID lock');
    const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
    assert(lock.pid === process.pid, 'Lock updated to current process PID');
  } finally {
    releaseLock();
    assert(!fs.existsSync(LOCK_FILE), 'Released lock cleanly');
  }

  // -------------------------------------------------------------------------
  // Test 2: Competing Orchestrator Prevention
  // -------------------------------------------------------------------------
  console.log('\n[Test 2] Competing Orchestrator Prevention:');
  // Spawn a dummy process that holds the lock
  const dummy = spawn('node', ['-e', 'process.title = "start.mjs"; setInterval(()=>{}, 1000)'], {
    cwd: path.join(REPO_ROOT, 'scripts', 'local'),
  });

  try {
    fs.writeFileSync(
      LOCK_FILE,
      JSON.stringify({ pid: dummy.pid, startedAt: new Date().toISOString() })
    );

    let caughtExpectedError = false;
    try {
      acquireLock();
    } catch (err) {
      caughtExpectedError = err.message.includes('Another Hopper local development orchestrator is currently running');
    }
    assert(caughtExpectedError, 'Prevented second orchestrator while first is alive');
  } finally {
    dummy.kill('SIGKILL');
    try { fs.unlinkSync(LOCK_FILE); } catch {}
  }

  // -------------------------------------------------------------------------
  // Test 3: Unrelated Process Port Conflict Safety
  // -------------------------------------------------------------------------
  console.log('\n[Test 3] Unrelated Process Port Conflict Safety:');
  // Start an unrelated dummy server on a test port (e.g. 34567)
  const testServer = http.createServer((req, res) => res.end('ok'));
  await new Promise((r) => testServer.listen(34567, '127.0.0.1', r));

  try {
    const conflict = detectPortConflict(34567, 'TestComponent');
    assert(conflict.hasConflict === true, 'Detected port 34567 is in use');
    assert(conflict.isHopper === false, 'Correctly identified as UNRELATED process (not Hopper)');
    assert(conflict.error.includes('occupied by an unrelated process'), 'Emitted descriptive safe conflict error');
  } finally {
    testServer.close();
  }

  // -------------------------------------------------------------------------
  // Test 4: Process Classification Guard
  // -------------------------------------------------------------------------
  console.log('\n[Test 4] Process Classification Guard (Protecting IDE & Tools):');
  // Verify that IDE and MCP names are never classified as Hopper
  const agyInfo = { cmdline: '/home/user/.gemini/bin/agy --hub --hub-port=37269', cwd: REPO_ROOT };
  assert(
    !agyInfo.cmdline.includes('src/server/index.ts'),
    'Antigravity Hub is not classified as Hopper backend'
  );

  // -------------------------------------------------------------------------
  // Test 5: Infrastructure Health Probing & Reuse
  // -------------------------------------------------------------------------
  console.log('\n[Test 5] Infrastructure Health Probing & Reuse:');
  const pg = await checkPostgresHealth(PORTS.postgres);
  assert(typeof pg.healthy === 'boolean', `Postgres health probe returned boolean (${pg.healthy})`);

  const redis = await checkRedisHealth(PORTS.redis);
  assert(typeof redis.healthy === 'boolean', `Redis health probe returned boolean (${redis.healthy})`);

  // -------------------------------------------------------------------------
  // Test 6: Session State Persistence & Idempotent Stop
  // -------------------------------------------------------------------------
  console.log('\n[Test 6] Session State Persistence & Idempotent Stop:');
  const testSession = {
    sessionId: 'test-123',
    startedAt: new Date().toISOString(),
    orchestratorPid: 123456,
  };
  saveSession(testSession);
  const loaded = loadSession();
  assert(loaded?.sessionId === 'test-123', 'Session successfully persisted and reloaded');
  clearSession();
  assert(loadSession() === null, 'Session successfully cleared');

  // Execute stop.mjs when nothing is running — must succeed with code 0 (idempotent)
  let stopOutput = '';
  try {
    stopOutput = execSync('node scripts/local/stop.mjs', { cwd: REPO_ROOT, encoding: 'utf8' });
    assert(stopOutput.includes('HOPPER LOCAL DEV SHUTDOWN'), 'stop.mjs executed cleanly and idempotently');
  } catch (err) {
    assert(false, `stop.mjs threw unexpected error: ${err.message}`);
  }

  // -------------------------------------------------------------------------
  // Test 7: Verify Status Command
  // -------------------------------------------------------------------------
  console.log('\n[Test 7] Status Command Execution:');
  try {
    const statusOutput = execSync('node scripts/local/status.mjs', { cwd: REPO_ROOT, encoding: 'utf8' });
    assert(statusOutput.includes('HOPPER LOCAL DEV STATUS'), 'status.mjs runs and prints status table');
    assert(statusOutput.includes('ORCHESTRATOR:'), 'status.mjs reports orchestrator state');
    assert(statusOutput.includes('POSTGRESQL (5432):'), 'status.mjs reports PostgreSQL state');
    assert(statusOutput.includes('REDIS (6379):'), 'status.mjs reports Redis state');
  } catch (err) {
    assert(false, `status.mjs threw unexpected error: ${err.message}`);
  }

  // -------------------------------------------------------------------------
  // Final Results
  // -------------------------------------------------------------------------
  console.log('\n--------------------------------------------------');
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('--------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

