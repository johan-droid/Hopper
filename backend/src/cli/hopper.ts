#!/usr/bin/env node
/**
 * Hopper CLI: Next-Gen CI Failure Diagnosis & Unified SDLC Lifecycle Runner.
 */

import { Command } from 'commander';
import { runEntireLifecycle } from './lifecycle.js';
import { createServer } from '../server/index.js';
import { sliceFailedStepLog } from '../lib/parser/log-slicer.js';
import { computeFailureSignature } from '../lib/parser/fingerprinter.js';
import { calculateFlakinessScore } from '../lib/moat/flakiness-engine.js';
import { synthesizeDiagnosis } from '../lib/ai/diagnose.js';
import { renderGitHubPrComment } from '../lib/github/pr-reporter.js';
import { SAMPLE_RAW_LOGS } from '../lib/github/log-fetcher.js';
import fs from 'node:fs';
import path from 'node:path';

const program = new Command();

program
  .name('hopper')
  .description('Hopper - CI Failure Diagnosis SaaS Engine & Unified SDLC Lifecycle Runner')
  .version('1.0.0');

// Command: lifecycle (The All-In-One Lifecycle Bringup)
program
  .command('lifecycle')
  .description('Bring up and verify the entire project building life cycle in one command')
  .action(async () => {
    try {
      await runEntireLifecycle(process.cwd());
    } catch (err: any) {
      console.error('Lifecycle failed:', err);
      process.exit(1);
    }
  });

// Command: doctor
program
  .command('doctor')
  .description('Run system preflight diagnostic checks')
  .action(() => {
    console.log('\n🔍 Hopper System Doctor:');
    console.log(`  - Node.js Version: ${process.version}`);
    console.log(`  - Platform:        ${process.platform}`);
    console.log(`  - Architecture:    ${process.arch}`);
    console.log(`  - Working Dir:     ${process.cwd()}`);

    const envExists = fs.existsSync(path.join(process.cwd(), '.env'));
    console.log(`  - .env Config:     ${envExists ? '✔ Found' : '✖ Missing (.env.example available)'}`);

    const migrationExists = fs.existsSync(path.join(process.cwd(), 'supabase', 'migrations', '0001_initial_schema.sql'));
    console.log(`  - SQL Migration:   ${migrationExists ? '✔ Found' : '✖ Missing migration DDL'}`);

    console.log('\nDoctor status: Ready for development & production building.\n');
  });

// Command: migrate
program
  .command('migrate')
  .description('Run PostgreSQL DDL migrations and seed optional demo data')
  .option('--seed', 'Seed sample organizations and signatures after migration')
  .action(async (options) => {
    try {
      console.log('\n📦 Running Hopper Database Migrations...');
      const { runMigrations, seedInitialData, checkDatabaseHealth } = await import('../db/index.js');

      const health = await checkDatabaseHealth();
      if (!health.isHealthy) {
        console.warn(`  ⚠️ Database connection warning: ${health.error}`);
        console.log('  Ensure PostgreSQL is running or start it via docker-compose up -d hopper-postgres\n');
        return;
      }

      const res = await runMigrations();
      console.log(`  ✔ Migration status: ${res.details}`);

      if (options.seed) {
        const seedRes = await seedInitialData();
        console.log(`  ✔ Seed status: ${seedRes.details}`);
      }
      console.log('\nDatabase setup complete.\n');
    } catch (err: any) {
      console.error('\n✖ Migration failed:', err.message, '\n');
      process.exit(1);
    }
  });

// Command: simulate
program
  .command('simulate')
  .description('Simulate an end-to-end failure diagnosis from raw CI logs')
  .option('-s, --scenario <scenario>', 'Scenario: jest, timeout, or oom', 'jest')
  .action(async (options) => {
    const scenarioKey =
      options.scenario === 'timeout'
        ? 'flaky_network_timeout'
        : options.scenario === 'oom'
        ? 'docker_runner_oom'
        : 'jest_assertion_fail';

    console.log(`\n🚀 Simulating CI Failure Ingestion [Scenario: ${options.scenario}]...`);
    const rawLog = SAMPLE_RAW_LOGS[scenarioKey];

    const sliced = sliceFailedStepLog(rawLog);
    console.log(`  [1/4] Parsed raw log: Extracted ${sliced.highlightedLines.length} high-signal lines.`);

    const signature = computeFailureSignature(
      'ci / test-job',
      'execute-tests',
      sliced.detectedTestIdentifier,
      sliced.cleanedSnippet
    );
    console.log(`  [2/4] Generated SHA-256 Fingerprint: ${signature.signatureHash}`);

    const flakiness = calculateFlakinessScore({
      sameShaRetryPasses: options.scenario === 'timeout' ? 2 : 0,
      uniquePrsAffected: options.scenario === 'timeout' ? 5 : 1,
      totalOccurrences: options.scenario === 'timeout' ? 14 : 1,
      mainBranchOccurrences: options.scenario === 'timeout' ? 3 : 0,
      cleanedSnippet: sliced.cleanedSnippet,
    });
    console.log(`  [3/4] Calculated Flakiness Score: ${flakiness}%`);

    const diagnosis = await synthesizeDiagnosis({
      workflowName: 'Continuous Integration',
      jobName: 'ci / test-job',
      stepName: 'execute-tests',
      exitCode: sliced.detectedExitCode,
      commitSha: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
      modifiedFiles: ['src/auth/jwt-verifier.ts'],
      historicalStats: {
        totalOccurrences: options.scenario === 'timeout' ? 14 : 1,
        uniquePrsAffected: options.scenario === 'timeout' ? 5 : 1,
        sameShaRetryPasses: options.scenario === 'timeout' ? 2 : 0,
        computedFlakinessScore: flakiness,
      },
      slicedLogSnippet: sliced.cleanedSnippet,
    });
    console.log(`  [4/4] AI Diagnosis Synthesized (${diagnosis.error_category})`);

    const prComment = renderGitHubPrComment({
      orgPlan: 'pro_dev',
      repoFullName: 'hopper-org/payments-core',
      workflowName: 'CI',
      jobName: 'test-job',
      stepName: 'execute-tests',
      commitSha: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
      runUrl: 'https://github.com/hopper-org/payments-core/actions/runs/12345678',
      dashboardReportUrl: `https://hopper.dev/reports/${signature.signatureHash}`,
      billingUpgradeUrl: 'https://hopper.dev/billing',
      flakinessScore: flakiness,
      historicalStats: {
        totalOccurrences: options.scenario === 'timeout' ? 14 : 1,
        uniquePrsAffected: options.scenario === 'timeout' ? 5 : 1,
        sameShaRetryPasses: options.scenario === 'timeout' ? 2 : 0,
      },
      diagnosis,
    });

    console.log('\n' + '='.repeat(70));
    console.log('  GENERATED STICKY PR COMMENT MARKDOWN:');
    console.log('='.repeat(70));
    console.log(prComment);
  });

// Command: serve
program
  .command('serve')
  .description('Start the Hopper Webhook Ingress & REST API Gateway')
  .option('-p, --port <port>', 'Port number to listen on', '3000')
  .action((options) => {
    const port = parseInt(options.port, 10);
    const app = createServer();
    app.listen(port, () => {
      console.log(`\n⚡ Hopper Gateway running on http://localhost:${port}`);
      console.log(`  - Health Check: GET http://localhost:${port}/api/health`);
      console.log(`  - GitHub Webhook: POST http://localhost:${port}/api/webhooks/github`);
      console.log(`  - Adhoc Diagnosis: POST http://localhost:${port}/api/diagnose/adhoc\n`);
    });
  });

program.parse(process.argv);
