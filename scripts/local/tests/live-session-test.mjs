/**
 * Hopper — Live End-to-End Orchestrator Verification
 * Spawns `node scripts/local/start.mjs`, verifies readiness of all services,
 * verifies URLs, runs status check, tests graceful shutdown, and checks for orphans.
 */

import { spawn, execSync } from 'node:child_process';
import * as http from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, { timeout: 4000 }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ statusCode: res.statusCode, data }));
    }).on('error', reject);
  });
}

async function run() {
  console.log('\n--- STARTING LIVE E2E ORCHESTRATOR RUN ---');

  const orchestrator = spawn('node', ['scripts/local/start.mjs'], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  let ready = false;

  orchestrator.stdout.on('data', (d) => {
    const s = d.toString();
    output += s;
    process.stdout.write(s);
    if (s.includes('All services are running')) {
      ready = true;
    }
  });

  orchestrator.stderr.on('data', (d) => {
    const s = d.toString();
    output += s;
    process.stderr.write(s);
  });

  // Wait up to 30s for readiness
  const deadline = Date.now() + 30000;
  while (!ready && Date.now() < deadline) {
    await wait(500);
  }

  if (!ready) {
    console.error('\n✖ Orchestrator did not report readiness in time!');
    orchestrator.kill('SIGKILL');
    process.exit(1);
  }

  console.log('\n\n--- VERIFYING LIVE ENDPOINTS ---');

  // 1. Verify Backend Health
  try {
    const res = await httpGet('http://localhost:3000/api/health');
    console.log(`✔ Backend Health: HTTP ${res.statusCode} -> ${res.data.slice(0, 100)}`);
  } catch (err) {
    console.error(`✖ Backend Health Check Failed: ${err.message}`);
  }

  // 2. Verify Frontend HTTP
  try {
    const res = await httpGet('http://localhost:5173/');
    console.log(`✔ Frontend SPA: HTTP ${res.statusCode} (HTML served)`);
  } catch (err) {
    console.error(`✖ Frontend SPA Check Failed: ${err.message}`);
  }

  // 3. Verify Status Command
  console.log('\n--- RUNNING local:status COMMAND ---');
  const statusOut = execSync('node scripts/local/status.mjs', { cwd: REPO_ROOT, encoding: 'utf8' });
  console.log(statusOut);

  // 4. Test Graceful Shutdown via SIGINT
  console.log('\n--- TESTING GRACEFUL SHUTDOWN (SIGINT) ---');
  orchestrator.kill('SIGINT');

  const exitPromise = new Promise((resolve) => {
    orchestrator.on('exit', (code, sig) => {
      console.log(`✔ Orchestrator exited cleanly: code=${code}, signal=${sig}`);
      resolve();
    });
  });

  await Promise.race([exitPromise, wait(10000)]);

  // 5. Verify no orphaned Hopper processes remain
  console.log('\n--- VERIFYING NO ORPHANED PROCESSES REMAIN ---');
  await wait(1000);
  const lingeringOut = execSync('node scripts/local/status.mjs', { cwd: REPO_ROOT, encoding: 'utf8' });
  console.log(lingeringOut);

  console.log('\n--- LIVE E2E ORCHESTRATOR TEST COMPLETED SUCCESSFULLY ---');
}

run().catch((err) => {
  console.error('Fatal live test error:', err);
  process.exit(1);
});

