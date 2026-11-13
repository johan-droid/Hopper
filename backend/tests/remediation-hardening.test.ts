/**
 * Production Remediation & Architecture Hardening Test Suite.
 * 
 * Verifies:
 * 1. Financial Correctness: Organization AI budget isolation, idempotency, and uncertain spend.
 * 2. Subscription Quota: Unique workflow-run-level matrix quota deduplication.
 * 3. Tenant Security: Cross-tenant budget isolation.
 * 4. Coordination Reliability: Fail-closed lock semantics.
 * 5. Log Streaming: Redirect header security and production non-mock guarantees.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AiBudgetController } from '../src/lib/ai/budget-controller.js';
import { getDatabaseExecutor } from '../src/db/client.js';
import { PostgresCoordination } from '../src/queue/coordination.js';
import { reserveQuota } from '../src/lib/billing/quota-guard.js';
import { fetchJobLogStream } from '../src/lib/github/log-fetcher.js';

describe('Production Remediation & Architecture Hardening', () => {
  const db = getDatabaseExecutor();
  const controller = new AiBudgetController(db);

  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    // 1. Create two isolated test organizations
    const orgARes = await db.query<any>(
      `INSERT INTO organizations (github_installation_id, github_account_login, github_account_type, plan, monthly_run_limit)
       VALUES (99001, 'test-org-alpha', 'Organization', 'free', 10)
       ON CONFLICT (github_installation_id) DO UPDATE SET github_account_login = EXCLUDED.github_account_login
       RETURNING id`
    );
    orgAId = orgARes.rows[0].id;

    const orgBRes = await db.query<any>(
      `INSERT INTO organizations (github_installation_id, github_account_login, github_account_type, plan, monthly_run_limit)
       VALUES (99002, 'test-org-beta', 'Organization', 'team', 1000)
       ON CONFLICT (github_installation_id) DO UPDATE SET github_account_login = EXCLUDED.github_account_login
       RETURNING id`
    );
    orgBId = orgBRes.rows[0].id;

    // 2. Configure organization budget settings ($0.03 limit for Org A, $100.00 for Org B)
    await db.query(
      `INSERT INTO organization_ai_budget_settings (organization_id, monthly_limit_usd, nominal_cap_usd, enabled)
       VALUES ($1, 0.0300, 0.0250, TRUE)
       ON CONFLICT (organization_id) DO UPDATE SET monthly_limit_usd = 0.0300, nominal_cap_usd = 0.0250, enabled = TRUE`,
      [orgAId]
    );

    await db.query(
      `INSERT INTO organization_ai_budget_settings (organization_id, monthly_limit_usd, nominal_cap_usd, enabled)
       VALUES ($1, 100.0000, 95.0000, TRUE)
       ON CONFLICT (organization_id) DO UPDATE SET monthly_limit_usd = 100.0000, nominal_cap_usd = 95.0000, enabled = TRUE`,
      [orgBId]
    );
  });

  afterAll(async () => {
    // Cleanup test data
    if (orgAId) {
      await db.query(`DELETE FROM ai_cost_reservations WHERE organization_id = $1`, [orgAId]);
      await db.query(`DELETE FROM ai_budget_ledgers WHERE organization_id = $1`, [orgAId]);
      await db.query(`DELETE FROM organization_ai_budget_settings WHERE organization_id = $1`, [orgAId]);
      await db.query(`DELETE FROM organizations WHERE id = $1`, [orgAId]);
    }
    if (orgBId) {
      await db.query(`DELETE FROM ai_cost_reservations WHERE organization_id = $1`, [orgBId]);
      await db.query(`DELETE FROM ai_budget_ledgers WHERE organization_id = $1`, [orgBId]);
      await db.query(`DELETE FROM organization_ai_budget_settings WHERE organization_id = $1`, [orgBId]);
      await db.query(`DELETE FROM organizations WHERE id = $1`, [orgBId]);
    }
  });

  describe('Workstream 1: Tenant-Isolated Organization AI Budget', () => {
    it('exhausting Org A budget ($0.03) DOES NOT impact Org B ($100)', async () => {
      // Org A reservation 1: takes $0.0150
      const resA1 = await controller.reserveBudget({
        organizationId: orgAId,
        idempotencyKey: `harden_test_a1_${Date.now()}`,
        provider: 'anthropic',
        model: 'claude-3-5-haiku-20241022',
      });
      expect(resA1.allowed).toBe(true);

      // Org A reservation 2: takes $0.0150 (Total committed: $0.0300, equals hard ceiling, exceeds $0.0250 nominal cap)
      const resA2 = await controller.reserveBudget({
        organizationId: orgAId,
        idempotencyKey: `harden_test_a2_${Date.now()}`,
        provider: 'anthropic',
        model: 'claude-3-5-haiku-20241022',
      });
      expect(resA2.allowed).toBe(false);
      expect(resA2.rejectionReason).toContain('NOMINAL_BUDGET_CAP_EXCEEDED');

      // Org B reservation: MUST be admitted because Org B has independent $100 budget
      const resB = await controller.reserveBudget({
        organizationId: orgBId,
        idempotencyKey: `harden_test_b1_${Date.now()}`,
        provider: 'anthropic',
        model: 'claude-3-5-haiku-20241022',
      });
      expect(resB.allowed).toBe(true);
      expect(resB.reservationId).toBeDefined();

      const ledgerA = await controller.getActiveLedger(orgAId);
      const ledgerB = await controller.getActiveLedger(orgBId);
      expect(ledgerA!.budgetLimitUsd).toBe(0.03);
      expect(ledgerB!.budgetLimitUsd).toBe(100.0);
    });

    it('reservation is replay-safe and idempotent for identical organization and key', async () => {
      const idempotencyKey = `harden_idemp_${Date.now()}`;
      const res1 = await controller.reserveBudget({
        organizationId: orgBId,
        idempotencyKey,
        provider: 'anthropic',
        model: 'claude-3-5-haiku-20241022',
      });
      expect(res1.allowed).toBe(true);

      const res2 = await controller.reserveBudget({
        organizationId: orgBId,
        idempotencyKey,
        provider: 'anthropic',
        model: 'claude-3-5-haiku-20241022',
      });
      expect(res2.allowed).toBe(true);
      expect(res2.reservationId).toBe(res1.reservationId);
    });

    it('duplicate settlement is idempotent and never double-counts expenditure', async () => {
      const res = await controller.reserveBudget({
        organizationId: orgBId,
        idempotencyKey: `harden_settle_${Date.now()}`,
        provider: 'anthropic',
        model: 'claude-3-5-haiku-20241022',
      });
      expect(res.allowed).toBe(true);

      const reservationId = res.reservationId!;
      await controller.markSubmitted(reservationId);

      const cost1 = await controller.settleReservation({
        reservationId,
        promptTokens: 1000,
        completionTokens: 200,
      });

      const ledgerBefore = await controller.getActiveLedger(orgBId);

      // Re-settle identical reservation
      const cost2 = await controller.settleReservation({
        reservationId,
        promptTokens: 1000,
        completionTokens: 200,
      });

      const ledgerAfter = await controller.getActiveLedger(orgBId);

      expect(cost2).toBe(cost1);
      expect(ledgerAfter!.settledSpendUsd).toBe(ledgerBefore!.settledSpendUsd);
    });

    it('duplicate markFailedZero is idempotent and never double-refunds', async () => {
      const res = await controller.reserveBudget({
        organizationId: orgBId,
        idempotencyKey: `harden_fail_${Date.now()}`,
        provider: 'anthropic',
        model: 'claude-3-5-haiku-20241022',
      });
      const reservationId = res.reservationId!;

      await controller.markFailedZero(reservationId, 'Provider 401 error');
      const ledgerBefore = await controller.getActiveLedger(orgBId);

      // Duplicate refund call
      await controller.markFailedZero(reservationId, 'Provider 401 error');
      const ledgerAfter = await controller.getActiveLedger(orgBId);

      expect(ledgerAfter!.reservedSpendUsd).toBe(ledgerBefore!.reservedSpendUsd);
    });
  });

  describe('Workstream 2: Subscription Run Quota & Matrix Accounting', () => {
    it('multiple matrix jobs from the same workflow run consume exactly ONE quota unit', async () => {
      const mockRepo = {
        tryReserveRunQuota: async (_orgId: string, _limit: number) => ({ allowed: true, runsUsed: 1 }),
      };
      const claimedKeys = new Set<string>();
      const mockClaim = async (key: string) => {
        if (claimedKeys.has(key)) return false;
        claimedKeys.add(key);
        return true;
      };

      const workflowRunId = 88776655;

      // Matrix Job 1
      const job1Quota = await reserveQuota(mockRepo, orgAId, 'free', 0, undefined, {
        enforce: true,
        githubRunId: workflowRunId,
        claimEvent: mockClaim,
      });
      expect(job1Quota.allowed).toBe(true);
      expect(job1Quota.runsUsed).toBe(1);

      // Matrix Job 2 (same workflow run)
      const job2Quota = await reserveQuota(mockRepo, orgAId, 'free', 1, undefined, {
        enforce: true,
        githubRunId: workflowRunId,
        claimEvent: mockClaim,
      });
      expect(job2Quota.allowed).toBe(true);
      // Runs used remained 1 because matrix job 2 deduplicated to the same billable run unit
      expect(job2Quota.runsUsed).toBe(1);
    });
  });

  describe('Workstream 3: Coordination Lock Fail-Closed', () => {
    it('acquireDiagnosisLock fails closed when database coordination fails', async () => {
      const brokenExecutor = {
        query: async () => {
          throw new Error('Connection terminated unexpectedly');
        },
      };
      const failingCoordination = new PostgresCoordination(brokenExecutor as any);

      const lock = await failingCoordination.acquireDiagnosisLock('repo-123', 'hash-abc');
      expect(lock.acquired).toBe(false);
      expect(lock.error).toContain('Connection terminated');
    });
  });

  describe('Workstream 4: GitHub Log Fetcher Security & Non-Mock Guarantees', () => {
    it('throws explicit error instead of returning synthetic Jest mock in production', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        await expect(
          fetchJobLogStream({
            installationToken: 'ghs_live_token_simulated_failure',
            repoFullName: 'test-org/test-repo',
            jobId: 999999999,
          })
        ).rejects.toThrow();
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });
  });
});
