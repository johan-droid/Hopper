/**
 * Phase 15 Extended User Journeys (H, I, J)
 *
 * Validates:
 * - Workflow H: Quota Exhaustion, Rate Limiting, and Billing Upgrade Resumption
 * - Workflow I: Ad-hoc CI Diagnostic Sandbox with Secret Scrubbing & Zod Validation
 * - Workflow J: Signature Inspection, Deduplicated Patterns & Cross-Run Timeline
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../src/server/index.js';
import { getDatabasePool } from '../src/db/client.js';
import { OrganizationRepository } from '../src/db/repositories/organization.repository.js';
import { RepositoryRepository } from '../src/db/repositories/repository.repository.js';
import { FailureSignatureRepository } from '../src/db/repositories/failure-signature.repository.js';
import { WorkflowFailureRepository } from '../src/db/repositories/workflow-failure.repository.js';
import { processWorkflowJob } from '../src/workers/processors/workflow-job.processor.js';
import { WorkflowJobEventData } from '../src/queue/types.js';
import { handleStripeWebhookEvent } from '../src/lib/billing/stripe-handler.js';
import crypto from 'node:crypto';
import { DEFAULT_DEV_JWT_SECRET } from '../src/server/middleware/auth.js';

function createTestToken(userId: string, email: string) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(
    JSON.stringify({
      sub: userId,
      email,
      aud: 'authenticated',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', DEFAULT_DEV_JWT_SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

describe('Phase 15: Extended User Journeys (H, I, J)', () => {
  let server: any;
  let port: number;
  const pool = getDatabasePool();
  const orgRepo = new OrganizationRepository();
  const repoRepo = new RepositoryRepository();
  const sigRepo = new FailureSignatureRepository();
  const failureRepo = new WorkflowFailureRepository();

  const testOrgLogin = 'journey-hij-org';
  let orgId: string;
  let repoId: string;
  let createdSigId: string;

  beforeAll(async () => {
    const app = createServer();
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address();
    port = typeof address === 'object' && address ? address.port : 0;

    // Cleanup residual data
    await pool.query('DELETE FROM diagnostic_reports WHERE failure_id IN (SELECT id FROM workflow_failures WHERE repo_id IN (SELECT id FROM repositories WHERE full_name = $1))', ['journey-hij-org/service-x']);
    await pool.query('DELETE FROM workflow_failures WHERE repo_id IN (SELECT id FROM repositories WHERE full_name = $1)', ['journey-hij-org/service-x']);
    await pool.query('DELETE FROM failure_signatures WHERE repo_id IN (SELECT id FROM repositories WHERE full_name = $1)', ['journey-hij-org/service-x']);
    await pool.query('DELETE FROM repositories WHERE full_name = $1', ['journey-hij-org/service-x']);
    await pool.query('DELETE FROM organizations WHERE github_account_login = $1', [testOrgLogin]);

    // Create test organization with Free tier (30 limit)
    const org = await orgRepo.upsert({
      githubInstallationId: 77889911,
      githubAccountLogin: testOrgLogin,
      githubAccountType: 'Organization',
      plan: 'free',
      monthlyRunLimit: 30,
    });
    orgId = org.id;

    // Create test repository
    const repo = await repoRepo.upsert({
      orgId: org.id,
      githubRepoId: 99112233,
      fullName: 'journey-hij-org/service-x',
      defaultBranch: 'main',
    });
    repoId = repo.id;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await pool.query('DELETE FROM diagnostic_reports WHERE failure_id IN (SELECT id FROM workflow_failures WHERE repo_id IN (SELECT id FROM repositories WHERE full_name = $1))', ['journey-hij-org/service-x']);
    await pool.query('DELETE FROM workflow_failures WHERE repo_id IN (SELECT id FROM repositories WHERE full_name = $1)', ['journey-hij-org/service-x']);
    await pool.query('DELETE FROM failure_signatures WHERE repo_id IN (SELECT id FROM repositories WHERE full_name = $1)', ['journey-hij-org/service-x']);
    await pool.query('DELETE FROM repositories WHERE full_name = $1', ['journey-hij-org/service-x']);
    await pool.query('DELETE FROM organizations WHERE github_account_login = $1', [testOrgLogin]);
  });

  // ============================================================================
  // WORKFLOW H: Quota Exhaustion & Resumption
  // ============================================================================
  it('Workflow H: Enforces monthly run limits, rejects over-quota runs, and resumes after upgrade', async () => {
    // 1. Artificially set usage to 30 (hitting monthly limit of 30)
    await pool.query(
      `UPDATE organizations SET runs_used_this_period = 30 WHERE id = $1`,
      [orgId]
    );

    // 2. Submit workflow job when quota is full
    const overQuotaEvent: WorkflowJobEventData = {
      installationId: 77889911,
      orgLogin: testOrgLogin,
      accountType: 'Organization',
      repoFullName: 'journey-hij-org/service-x',
      githubRepoId: 99112233,
      workflowName: 'CI',
      jobName: 'Test',
      stepName: 'test',
      githubRunId: 50001,
      githubJobId: 60001,
      githubRunAttempt: 1,
      commitSha: 'sha-quota-test-1111',
      branch: 'main',
      prNumber: null,
      actorLogin: 'developer',
      conclusion: 'failure',
      rawLog: 'AssertionError: failure on quota full',
      modifiedFiles: [],
      runUrl: 'https://github.com/journey-hij-org/service-x/actions/runs/50001',
    };

    const quotaResult = await processWorkflowJob(overQuotaEvent);
    expect(quotaResult.status).toBe('quota_exceeded');
    expect(quotaResult.reason).toContain('Monthly Free Quota Reached');

    // 3. User upgrades to Pro Dev (limit 250) via Stripe webhook
    const upgradeWebhook = {
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: orgId,
          customer: 'cus_journey_h',
          subscription: 'sub_journey_h',
          metadata: { plan: 'pro_dev' },
        },
      },
    };
    const upgradeResult = await handleStripeWebhookEvent(upgradeWebhook, orgRepo);
    expect(upgradeResult.handled).toBe(true);
    expect(upgradeResult.plan).toBe('pro_dev');

    // 4. Retry ingestion now that limit is 250 (30 < 250)
    const resumedResult = await processWorkflowJob(overQuotaEvent);
    expect(resumedResult.status).toBe('diagnosed');
    expect(resumedResult.signatureHash).toBeDefined();
  });

  // ============================================================================
  // WORKFLOW I: Ad-hoc Diagnostic Sandbox with Secret Redaction & Contract Schema
  // ============================================================================
  it('Workflow I: Processes ad-hoc raw CI log, scrubs credentials, and returns structured diagnosis', async () => {
    const rawNoisyLog = `
2026-11-06T12:00:00.000Z [INFO] Initializing CI test runner
2026-11-06T12:00:01.000Z [DEBUG] Connecting with AWS_SECRET_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
2026-11-06T12:00:02.000Z [DEBUG] DATABASE_URL=postgres://app_user:SuperSecretPassword123@db.prod.internal:5432/core
2026-11-06T12:00:03.000Z [ERROR] tests/api/auth.spec.ts:35:11 › Login Flow › Timeout of 30000ms exceeded
2026-11-06T12:00:04.000Z [INFO] Test run failed with code 1
    `;

    const res = await fetch(`http://127.0.0.1:${port}/api/diagnose/adhoc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawLog: rawNoisyLog,
        jobName: 'E2E Testing',
        stepName: 'npx playwright test',
        modifiedFiles: ['tests/api/auth.spec.ts', 'src/services/auth.ts'],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;

    // Verify contract schema completeness
    expect(body.signatureHash).toMatch(/^([a-f0-9]{40,64}|sha256:[a-f0-9]{40,64})$/);
    expect(typeof body.flakinessScore).toBe('number');
    expect(body.diagnosis).toBeDefined();
    expect(body.diagnosis.root_cause_clues).toBeDefined();
    expect(Array.isArray(body.diagnosis.relevant_log_lines)).toBe(true);
    expect(Array.isArray(body.diagnosis.recommended_next_checks)).toBe(true);

    // Verify secret scrubbing occurred: sensitive passwords and keys must not appear in root_cause or log lines
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('SuperSecretPassword123');
    expect(serialized).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(serialized).toContain('[REDACTED_AWS_KEY]');
  });

  // ============================================================================
  // WORKFLOW J: Signature Detail & Cross-Run Timeline Inspection
  // ============================================================================
  it('Workflow J: Queries signature details with cross-run timeline and flakiness metrics', async () => {
    // 1. Insert a signature directly for testing the inspector
    const sig = await sigRepo.upsert({
      repoId,
      signatureHash: 'sha256:j_workflow_test_hash_1234567890abcdef',
      normalizedTemplate: 'Error: Timeout waiting for DOM selector [data-testid=submit-btn]',
      testIdentifier: 'tests/e2e/checkout.spec.ts › Submit Order',
      errorCategory: 'timeout',
      flakinessScore: 87.5,
      cachedRootCause: 'Race condition waiting for checkout button to be enabled after credit card tokenization.',
      cachedNextCheck: 'Add page.waitForResponse for payment tokenization API before asserting button state.',
    });
    createdSigId = sig.id;

    // 2. Create two workflow failure records linked to this signature
    await failureRepo.create({
      repoId,
      signatureId: sig.id,
      workflowName: 'E2E Suite',
      jobName: 'E2E Playwright',
      githubRunId: 77001,
      githubJobId: 88001,
      githubRunAttempt: 1,
      commitSha: 'a1b2c3d4e5f6',
      branch: 'feat/checkout',
      prNumber: 99,
      actorLogin: 'dev_user',
      durationMs: 32000,
      exitCode: 1,
      failedStepName: 'Run Playwright',
      sanitizedLogSnippet: 'Timeout of 30000ms exceeded waiting for selector [data-testid=submit-btn]',
    });

    await failureRepo.create({
      repoId,
      signatureId: sig.id,
      workflowName: 'E2E Suite',
      jobName: 'E2E Playwright',
      githubRunId: 77002,
      githubJobId: 88002,
      githubRunAttempt: 2,
      commitSha: 'a1b2c3d4e5f6',
      branch: 'feat/checkout',
      prNumber: 99,
      actorLogin: 'dev_user',
      durationMs: 14000,
      exitCode: 0,
      failedStepName: 'Run Playwright (Retry)',
      sanitizedLogSnippet: '[Retry passed without code change - Flakiness confirmed]',
    });

    // 3. Query the signature endpoint
    const testJwt = createTestToken('00000000-0000-0000-0000-000000000099', 'tester@journey-hij.dev');
    const sigRes = await fetch(`http://127.0.0.1:${port}/api/signatures/${createdSigId}`, {
      headers: { Authorization: `Bearer ${testJwt}` },
    });
    expect(sigRes.status).toBe(200);

    const sigData = (await sigRes.json()) as any;
    expect(sigData.id).toBe(createdSigId);
    expect(sigData.signatureHash).toBe('sha256:j_workflow_test_hash_1234567890abcdef');
    expect(sigData.testIdentifier).toBe('tests/e2e/checkout.spec.ts › Submit Order');
    expect(sigData.flakinessScore).toBe(87.5);
    expect(sigData.cachedRootCause).toContain('Race condition');
    expect(sigData.cachedNextCheck).toContain('waitForResponse');

    // 4. Verify timeline items
    expect(Array.isArray(sigData.crossRunTimeline)).toBe(true);
    expect(sigData.crossRunTimeline.length).toBeGreaterThanOrEqual(2);

    const failItem = sigData.crossRunTimeline.find((t: any) => t.exitCode === 1);
    expect(failItem).toBeDefined();
    expect(failItem.commitSha).toBe('a1b2c3d4e5f6');
    expect(failItem.prNumber).toBe(99);
    expect(failItem.branch).toBe('feat/checkout');

    const passItem = sigData.crossRunTimeline.find((t: any) => t.exitCode === 0);
    expect(passItem).toBeDefined();
    expect(passItem.commitSha).toBe('a1b2c3d4e5f6');
  });
});
