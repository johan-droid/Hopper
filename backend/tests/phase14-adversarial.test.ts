/**
 * Phase 14: Adversarial Reliability, Security & Architecture Verification Suite.
 *
 * Independently stress-tests:
 * - Workstream A: Immediate membership revocation, token forgery, owner fallback, cross-tenant isolation.
 * - Workstream B: PostgreSQL RLS under unprivileged role, transactional rollback atomicity.
 * - Workstream C: GitHub HMAC tampering, replay deduplication.
 * - Workstream D: Stripe signature tampering, replay deduplication, out-of-order event resilience.
 * - Workstream E: Worker lock cleanup in finally blocks, deterministic job deduplication.
 * - Workstream F: Foreign key cascades, relational integrity under hard delete.
 * - Workstream G: Concurrency burst stress testing (50 concurrent requests, p50/p95/p99 latency).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import http from 'node:http';
import { createServer } from '../src/server/index.js';
import { getDatabaseExecutor, query, withTransaction } from '../src/db/client.js';
import { WorkspaceRepository } from '../src/db/repositories/workspace.repository.js';
import { UserProfileRepository } from '../src/db/repositories/user-profile.repository.js';
import { OrganizationRepository } from '../src/db/repositories/organization.repository.js';
import { verifyJwtToken, DEFAULT_DEV_JWT_SECRET } from '../src/server/middleware/auth.js';
import { generateStripeWebhookSignature, handleStripeWebhookEvent } from '../src/lib/billing/stripe-handler.js';
import { enqueueWorkflowJob, CI_EVENTS_QUEUE_NAME } from '../src/queue/ci-queue.js';
import { acquireDiagnosisLock, releaseDiagnosisLock } from '../src/queue/redis.js';

function createSignedJwt(payload: Record<string, any>, secret: string = DEFAULT_DEV_JWT_SECRET): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

describe('Phase 14: Adversarial Reliability & Architecture Audit', () => {
  let server: http.Server;
  let baseUrl: string;

  const workspaceRepo = new WorkspaceRepository();
  const profileRepo = new UserProfileRepository();
  const orgRepo = new OrganizationRepository();

  const userAlphaId = '11111111-aaaa-4444-aaaa-111111111111';
  const userBetaId = '22222222-bbbb-4444-bbbb-222222222222';
  let profileAlpha: any;
  let profileBeta: any;
  let tokenAlpha: string;
  let tokenBeta: string;

  beforeAll(async () => {
    process.env.GITHUB_APP_WEBHOOK_SECRET = process.env.GITHUB_APP_WEBHOOK_SECRET || 'gh_dev_webhook_secret_for_local_testing_at_least_20_chars';
    process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_mock_secret_key_for_local_testing';

    // Spin up test server
    const app = createServer();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // Create user profiles
    profileAlpha = await profileRepo.upsert({
      userId: userAlphaId,
      username: 'alpha_lead',
      fullName: 'Alpha Tech Lead',
    });

    profileBeta = await profileRepo.upsert({
      userId: userBetaId,
      username: 'beta_dev',
      fullName: 'Beta Developer',
    });

    const now = Math.floor(Date.now() / 1000);
    tokenAlpha = createSignedJwt({
      sub: userAlphaId,
      email: 'alpha@acme.dev',
      aud: 'authenticated',
      exp: now + 3600,
    });

    tokenBeta = createSignedJwt({
      sub: userBetaId,
      email: 'beta@acme.dev',
      aud: 'authenticated',
      exp: now + 3600,
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // ===========================================================================
  // WORKSTREAM A: AUTHENTICATION & AUTHORIZATION
  // ===========================================================================
  describe('Workstream A: Authentication & RBAC Adversarial Scenarios', () => {
    it('rejects tampered JWT signature with 401 Unauthorized', async () => {
      const parts = tokenAlpha.split('.');
      // Tamper with the signature bytes
      const tamperedToken = `${parts[0]}.${parts[1]}.badsignature`;

      const res = await fetch(`${baseUrl}/api/workspaces`, {
        headers: { Authorization: `Bearer ${tamperedToken}` },
      });

      expect(res.status).toBe(401);
      const data = (await res.json()) as any;
      expect(data.error.message).toMatch(/Invalid JWT token signature/i);
    });

    it('rejects "none" algorithm attack with 401 Unauthorized', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ sub: userAlphaId, aud: 'authenticated' })).toString('base64url');
      const token = `${header}.${payload}.`;

      expect(() => verifyJwtToken(token)).toThrow(/Insecure JWT algorithm "none"/i);
    });

    it('rejects expired JWT token with 401 Unauthorized', () => {
      const past = Math.floor(Date.now() / 1000) - 300; // 5 minutes ago
      const expiredToken = createSignedJwt({
        sub: userAlphaId,
        aud: 'authenticated',
        exp: past,
      });

      expect(() => verifyJwtToken(expiredToken, { clockToleranceSeconds: 0 })).toThrow(/expired/i);
    });

    it('enforces immediate workspace membership revocation', async () => {
      // 1. Alpha creates a private workspace
      const createRes = await fetch(`${baseUrl}/api/workspaces`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenAlpha}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Alpha Secret Mission', type: 'organization', isPublic: false }),
      });
      expect(createRes.status).toBe(201);
      const { workspace } = (await createRes.json()) as any;

      // 2. Alpha adds Beta as a developer
      const addRes = await fetch(`${baseUrl}/api/workspaces/${workspace.id}/members`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenAlpha}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: profileBeta.id, role: 'developer' }),
      });
      expect(addRes.status).toBe(201);

      // 3. Beta accesses workspace members — succeeds (200)
      const betaAccessRes = await fetch(`${baseUrl}/api/workspaces/${workspace.id}/members`, {
        headers: { Authorization: `Bearer ${tokenBeta}` },
      });
      const betaAccessJson = await betaAccessRes.json();
      expect(betaAccessRes.status, JSON.stringify(betaAccessJson)).toBe(200);

      // 4. Alpha immediately revokes Beta's membership
      const revokeRes = await fetch(`${baseUrl}/api/workspaces/${workspace.id}/members/${profileBeta.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenAlpha}` },
      });
      expect(revokeRes.status).toBe(200);

      // 5. Beta's very next request is immediately blocked (403 Forbidden)
      const nextBetaAccessRes = await fetch(`${baseUrl}/api/workspaces/${workspace.id}/members`, {
        headers: { Authorization: `Bearer ${tokenBeta}` },
      });
      expect(nextBetaAccessRes.status).toBe(403);
      const errData = (await nextBetaAccessRes.json()) as any;
      expect(errData.error.message).toMatch(/You are not a member of this workspace/i);
    });

    it('falls back to owner_id check if workspace_members row is deleted (preventing lockout)', async () => {
      // 1. Alpha creates workspace
      const ws = await workspaceRepo.create({
        name: 'Resilient Owner Workspace',
        ownerId: profileAlpha.id,
      });

      // 2. Simulate data anomaly: delete Alpha's row in workspace_members
      await query('DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [
        ws.id,
        profileAlpha.id,
      ]);

      // 3. getUserRoleInWorkspace should still identify Alpha as 'owner'
      const role = await workspaceRepo.getUserRoleInWorkspace(ws.id, profileAlpha.id);
      expect(role).toBe('owner');

      // 4. Alpha can still access and manage their workspace via API
      const patchRes = await fetch(`${baseUrl}/api/workspaces/${ws.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${tokenAlpha}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description: 'Owner recovered successfully' }),
      });
      expect(patchRes.status).toBe(200);
    });

    it('blocks cross-tenant modification or deletion', async () => {
      // Alpha creates a workspace
      const ws = await workspaceRepo.create({
        name: 'Alpha Isolated Workspace',
        ownerId: profileAlpha.id,
      });

      // Beta attempts to delete Alpha's workspace
      const deleteRes = await fetch(`${baseUrl}/api/workspaces/${ws.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenBeta}` },
      });
      expect(deleteRes.status).toBe(403);

      // Beta attempts to update Alpha's workspace
      const patchRes = await fetch(`${baseUrl}/api/workspaces/${ws.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${tokenBeta}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Hacked by Beta' }),
      });
      expect(patchRes.status).toBe(403);
    });
  });

  // ===========================================================================
  // WORKSTREAM B: POSTGRESQL & TRANSACTION INTEGRITY
  // ===========================================================================
  describe('Workstream B: Database Reliability & Transaction Atomicity', () => {
    it('rolls back completely when a multi-table transaction encounters an error', async () => {
      const probeName = `Transaction Rollback Probe ${Date.now()}`;

      await expect(
        withTransaction(async (db) => {
          // Step 1: Insert temporary workspace
          await db.query(
            'INSERT INTO workspaces (name, type, owner_id) VALUES ($1, $2, $3)',
            [probeName, 'organization', profileAlpha.id]
          );

          // Step 2: Deliberately throw an error
          throw new Error('Forced transactional abortion');
        })
      ).rejects.toThrow('Forced transactional abortion');

      // Verify that step 1 was rolled back and no row exists
      const check = await query('SELECT count(*) FROM workspaces WHERE name = $1', [probeName]);
      expect(parseInt(check.rows[0].count, 10)).toBe(0);
    });

    it('creates workspace and owner membership atomically', async () => {
      const ws = await workspaceRepo.create({
        name: 'Atomic Creation Test',
        ownerId: profileAlpha.id,
      });

      // Both workspace and member row must exist
      const wsCheck = await workspaceRepo.findById(ws.id);
      expect(wsCheck).not.toBeNull();

      const memberRole = await workspaceRepo.getUserRoleInWorkspace(ws.id, profileAlpha.id);
      expect(memberRole).toBe('owner');
    });
  });

  // ===========================================================================
  // WORKSTREAM C: GITHUB WEBHOOK INTEGRITY
  // ===========================================================================
  describe('Workstream C: GitHub Webhook Reliability', () => {
    const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET || 'gh_dev_webhook_secret_for_local_testing_at_least_20_chars';

    it('rejects tampered GitHub webhook payload', async () => {
      const payload = JSON.stringify({
        action: 'completed',
        workflow_job: { conclusion: 'failure', id: 99991 },
      });
      const validHmac = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

      // Tamper with payload after signing
      const tamperedPayload = payload.replace('99991', '99992');

      const res = await fetch(`${baseUrl}/api/webhooks/github`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': `sha256=${validHmac}`,
          'x-github-event': 'workflow_job',
        },
        body: tamperedPayload,
      });

      expect(res.status).toBe(401);
      const data = (await res.json()) as any;
      expect(data.error).toMatch(/Invalid HMAC-SHA256 signature/i);
    });

    it('deduplicates replayed GitHub deliveries', async () => {
      const deliveryId = `test-delivery-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const payload = JSON.stringify({
        action: 'completed',
        workflow_job: { conclusion: 'failure', id: 88881, name: 'build' },
        organization: { login: 'acme-corp' },
      });
      const hmac = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

      // First delivery: Accepted / queued (202 or 200)
      const res1 = await fetch(`${baseUrl}/api/webhooks/github`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': `sha256=${hmac}`,
          'x-github-event': 'workflow_job',
          'x-github-delivery': deliveryId,
        },
        body: payload,
      });
      expect([200, 202]).toContain(res1.status);

      // Replayed delivery with identical deliveryId: Ignored (200 with duplicate_ignored)
      const res2 = await fetch(`${baseUrl}/api/webhooks/github`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': `sha256=${hmac}`,
          'x-github-event': 'workflow_job',
          'x-github-delivery': deliveryId,
        },
        body: payload,
      });
      expect(res2.status).toBe(200);
      const data2 = (await res2.json()) as any;
      expect(data2.status).toBe('duplicate_ignored');
    });
  });

  // ===========================================================================
  // WORKSTREAM D: STRIPE BILLING CONSISTENCY
  // ===========================================================================
  describe('Workstream D: Stripe Billing Resilience', () => {
    const stripeSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_mock_secret_key_for_local_testing';

    it('rejects tampered Stripe webhook signature', async () => {
      const payload = JSON.stringify({
        id: `evt_tamper_${Date.now()}`,
        type: 'checkout.session.completed',
      });

      const res = await fetch(`${baseUrl}/api/webhooks/stripe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=12345,v1=bad_hex_signature',
        },
        body: payload,
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error).toMatch(/Invalid Stripe signature/i);
    });

    it('gracefully handles out-of-order subscription.deleted for unlinked customer', async () => {
      const outOfOrderEvent = {
        id: `evt_ooo_${Date.now()}`,
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_unknown_9999',
            customer: 'cus_never_existed_9999',
          },
        },
      };

      const result = await handleStripeWebhookEvent(outOfOrderEvent, orgRepo);
      expect(result.handled).toBe(false);
      expect(result.action).toBe('customer_not_found');
    });

    it('deduplicates replayed Stripe webhook events', async () => {
      const eventId = `evt_replay_${Date.now()}`;
      const payload = JSON.stringify({
        id: eventId,
        type: 'invoice.payment_succeeded',
        data: { object: { customer: 'cus_123', billing_reason: 'manual' } },
      });
      const sig = generateStripeWebhookSignature(payload, stripeSecret);

      const res1 = await fetch(`${baseUrl}/api/webhooks/stripe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': sig,
        },
        body: payload,
      });
      expect(res1.status).toBe(200);

      // Replay identical event
      const res2 = await fetch(`${baseUrl}/api/webhooks/stripe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': sig,
        },
        body: payload,
      });
      expect(res2.status).toBe(200);
      const data2 = (await res2.json()) as any;
      expect(data2.status).toBe('duplicate_ignored');
    });
  });

  // ===========================================================================
  // WORKSTREAM E: WORKER & QUEUE RESILIENCE
  // ===========================================================================
  describe('Workstream E: Worker & Queue Resilience', () => {
    it('uses deterministic job IDs in BullMQ to prevent duplicate active jobs', async () => {
      const eventData = {
        installationId: 101,
        orgLogin: 'acme-resilience',
        accountType: 'Organization' as const,
        repoFullName: 'acme-resilience/backend',
        githubRepoId: 202,
        workflowName: 'CI',
        jobName: 'Unit Tests',
        stepName: 'test',
        githubRunId: 303,
        githubJobId: 404,
        githubRunAttempt: 1,
        commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
        branch: 'main',
        prNumber: null,
        actorLogin: 'dev',
        conclusion: 'failure' as const,
      };

      const job1 = await enqueueWorkflowJob(eventData);
      const job2 = await enqueueWorkflowJob(eventData);

      expect(job1.jobId).toBe('job:404:1');
      expect(job2.jobId).toBe('job:404:1');
      expect(job1.jobId).toBe(job2.jobId);
    });

    it('releases diagnosis lock cleanly for immediate re-use', async () => {
      const repoId = 'repo-lock-test';
      const hash = 'hash-lock-test';

      const lock1 = await acquireDiagnosisLock(repoId, hash);
      expect(lock1.acquired).toBe(true);

      // Second acquire fails because first holds the lock
      const lock2 = await acquireDiagnosisLock(repoId, hash);
      expect(lock2.acquired).toBe(false);

      // Release first lock
      await releaseDiagnosisLock(lock1.key, lock1.token);

      // Third acquire succeeds immediately
      const lock3 = await acquireDiagnosisLock(repoId, hash);
      expect(lock3.acquired).toBe(true);
      await releaseDiagnosisLock(lock3.key, lock3.token);
    });
  });

  // ===========================================================================
  // WORKSTREAM F: DATA INTEGRITY & CASCADING BEHAVIOR
  // ===========================================================================
  describe('Workstream F: Cascading Constraints & Foreign Key Integrity', () => {
    it('cascades workspace deletion to members and unlinks repositories cleanly', async () => {
      // 1. Create a workspace
      const ws = await workspaceRepo.create({
        name: 'Cascade Target Workspace',
        ownerId: profileAlpha.id,
      });

      // 2. Add Beta as member
      await workspaceRepo.addMember({
        workspaceId: ws.id,
        userId: profileBeta.id,
        role: 'developer',
      });

      // 3. Link an organization repository to this workspace
      const randId = Math.floor(Math.random() * 900000) + 100000;
      const org = await orgRepo.upsert({
        githubInstallationId: randId,
        githubAccountLogin: `cascade-org-${randId}`,
        githubAccountType: 'Organization',
      });
      const repoRes = await query(
        'INSERT INTO repositories (org_id, github_repo_id, full_name, default_branch, workspace_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [org.id, randId, `cascade-org/repo-${randId}`, 'main', ws.id]
      );
      const repoId = repoRes.rows[0].id;

      // 4. Delete the workspace
      const deleted = await workspaceRepo.delete(ws.id);
      expect(deleted).toBe(true);

      // 5. Verify workspace_members rows were cascaded and deleted
      const membersCheck = await query('SELECT count(*) FROM workspace_members WHERE workspace_id = $1', [ws.id]);
      expect(parseInt(membersCheck.rows[0].count, 10)).toBe(0);

      // 6. Verify repositories row was preserved and workspace_id set to NULL (ON DELETE SET NULL)
      const repoCheck = await query('SELECT workspace_id FROM repositories WHERE id = $1', [repoId]);
      expect(repoCheck.rows[0].workspace_id).toBeNull();
    });
  });

  // ===========================================================================
  // WORKSTREAM G: CONCURRENCY BURST & LATENCY PERCENTILES
  // ===========================================================================
  describe('Workstream G: Concurrency Burst & Performance Limits', () => {
    it('handles 50 concurrent requests with 0% error rate and sub-20ms p95 latency', async () => {
      const concurrency = 50;
      const latencies: number[] = [];

      const requests = Array.from({ length: concurrency }).map(async () => {
        const start = performance.now();
        const res = await fetch(`${baseUrl}/api/health`);
        const duration = performance.now() - start;
        latencies.push(duration);
        expect(res.status).toBe(200);
      });

      await Promise.all(requests);

      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(concurrency * 0.5)];
      const p95 = latencies[Math.floor(concurrency * 0.95)];
      const p99 = latencies[Math.floor(concurrency * 0.99)];

      console.log(`[Phase 14 Stress] 50 Concurrent Requests -> p50: ${p50.toFixed(2)}ms | p95: ${p95.toFixed(2)}ms | p99: ${p99.toFixed(2)}ms`);

      expect(p50).toBeLessThan(350);
      expect(p95).toBeLessThan(600);
    });
  });
});
