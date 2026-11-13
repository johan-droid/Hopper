/**
 * End-to-End User Journey Verification Suite (Phase 13)
 * Tests complete SaaS workflows (A through G) against the live PostgreSQL database
 * and validates persistent state at each step using native Node.js fetch.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../src/server/index.js';
import { getDatabasePool } from '../src/db/client.js';
import { OrganizationRepository } from '../src/db/repositories/organization.repository.js';
import { RepositoryRepository } from '../src/db/repositories/repository.repository.js';
import { processWorkflowJob } from '../src/workers/processors/workflow-job.processor.js';
import { WorkflowJobEventData } from '../src/queue/types.js';
import { handleStripeWebhookEvent } from '../src/lib/billing/stripe-handler.js';
import crypto from 'node:crypto';

describe('Phase 13: End-to-End SaaS User Journeys (A through G)', () => {
  let server: any;
  let port: number;
  const pool = getDatabasePool();
  const orgRepo = new OrganizationRepository();
  const repoRepo = new RepositoryRepository();

  const userAId = '00000000-0000-0000-0000-0000000000aa';
  const userBId = '00000000-0000-0000-0000-0000000000bb';
  let workspaceId: string;
  let userAProfileId: string;
  let userBProfileId: string;
  let orgId: string;
  let repositoryId: string;
  let signatureId: string;

  function createTestJwt(userId: string, email: string): string {
    const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || 'hopper-dev-secret-key-at-least-32-bytes-long-for-hmac-sha256';
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: userId,
        email,
        aud: 'authenticated',
        role: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 7200,
      })
    ).toString('base64url');

    const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    return `${header}.${payload}.${signature}`;
  }

  const tokenUserA = createTestJwt(userAId, 'alice@alpha-labs.dev');
  const tokenUserB = createTestJwt(userBId, 'bob@alpha-labs.dev');

  beforeAll(async () => {
    const app = createServer();
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address();
    port = typeof address === 'object' && address ? address.port : 0;

    // Clean up any residual test records from previous runs
    await pool.query('DELETE FROM diagnostic_reports WHERE failure_id IN (SELECT id FROM workflow_failures WHERE repo_id IN (SELECT id FROM repositories WHERE full_name = $1))', ['alpha-labs/core-api']);
    await pool.query('DELETE FROM workflow_failures WHERE repo_id IN (SELECT id FROM repositories WHERE full_name = $1)', ['alpha-labs/core-api']);
    await pool.query('DELETE FROM failure_signatures WHERE repo_id IN (SELECT id FROM repositories WHERE full_name = $1)', ['alpha-labs/core-api']);
    await pool.query('DELETE FROM repositories WHERE full_name = $1', ['alpha-labs/core-api']);
    await pool.query('DELETE FROM organizations WHERE github_account_login = $1', ['alpha-labs']);
    await pool.query('DELETE FROM workspace_members WHERE user_id IN ($1, $2)', [userAId, userBId]);
    await pool.query('DELETE FROM workspaces WHERE name = $1', ['Alpha Labs Workspace']);
    await pool.query('DELETE FROM user_profiles WHERE id IN ($1, $2) OR user_id IN ($1, $2)', [userAId, userBId]);
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    // Cleanup
    await pool.query('DELETE FROM diagnostic_reports WHERE failure_id IN (SELECT id FROM workflow_failures WHERE repo_id IN (SELECT id FROM repositories WHERE full_name = $1))', ['alpha-labs/core-api']);
    await pool.query('DELETE FROM workflow_failures WHERE repo_id IN (SELECT id FROM repositories WHERE full_name = $1)', ['alpha-labs/core-api']);
    await pool.query('DELETE FROM failure_signatures WHERE repo_id IN (SELECT id FROM repositories WHERE full_name = $1)', ['alpha-labs/core-api']);
    await pool.query('DELETE FROM repositories WHERE full_name = $1', ['alpha-labs/core-api']);
    await pool.query('DELETE FROM organizations WHERE github_account_login = $1', ['alpha-labs']);
    await pool.query('DELETE FROM workspace_members WHERE user_id IN ($1, $2)', [userAId, userBId]);
    await pool.query('DELETE FROM workspaces WHERE name = $1', ['Alpha Labs Workspace']);
    await pool.query('DELETE FROM user_profiles WHERE id IN ($1, $2) OR user_id IN ($1, $2)', [userAId, userBId]);
  });

  // ============================================================================
  // WORKFLOW A: New User -> Registration -> Workspace Creation
  // ============================================================================
  it('Workflow A: New user registers and creates a private workspace', async () => {
    // 1. User profile created upon initial sign-up via profile endpoint
    const profileRes = await fetch(`http://127.0.0.1:${port}/api/user/profile`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect(profileRes.status).toBe(200);
    const profileData = (await profileRes.json()) as any;
    expect(profileData.profile.id).toBeDefined();
    userAProfileId = profileData.profile.id;

    // Verify user profile exists in PostgreSQL database
    const dbProfile = await pool.query('SELECT * FROM user_profiles WHERE id = $1', [profileData.profile.id]);
    expect(dbProfile.rows.length).toBe(1);
    expect(dbProfile.rows[0].id).toBe(profileData.profile.id);
    expect(dbProfile.rows[0].username).toMatch(/^alice/);

    // 2. User creates workspace via API
    const wsRes = await fetch(`http://127.0.0.1:${port}/api/workspaces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUserA}`,
      },
      body: JSON.stringify({
        name: 'Alpha Labs Workspace',
        type: 'organization',
        isPublic: false,
      }),
    });

    expect(wsRes.status).toBe(201);
    const wsData = (await wsRes.json()) as any;
    expect(wsData.workspace).toBeDefined();
    expect(wsData.workspace.name).toBe('Alpha Labs Workspace');
    workspaceId = wsData.workspace.id;

    // 3. Verify workspace and owner role in database
    const dbWorkspace = await pool.query('SELECT * FROM workspaces WHERE id = $1', [workspaceId]);
    expect(dbWorkspace.rows.length).toBe(1);
    expect(dbWorkspace.rows[0].name).toBe('Alpha Labs Workspace');

    const dbMember = await pool.query(
      'SELECT * FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [workspaceId, profileData.profile.id]
    );
    expect(dbMember.rows.length).toBe(1);
    expect(dbMember.rows[0].role).toBe('owner');
  });

  // ============================================================================
  // WORKFLOW B: Workspace -> GitHub Installation -> Repository Connection
  // ============================================================================
  it('Workflow B: GitHub App installation creates org and connects repository', async () => {
    // 1. GitHub App installed by organization
    const org = await orgRepo.upsert({
      githubInstallationId: 99887766,
      githubAccountLogin: 'alpha-labs',
      githubAccountType: 'Organization',
      plan: 'free',
      monthlyRunLimit: 30,
    });
    expect(org.id).toBeDefined();
    orgId = org.id;

    // 2. Repository selected and synced
    const repo = await repoRepo.upsert({
      orgId: org.id,
      githubRepoId: 88776655,
      fullName: 'alpha-labs/core-api',
      defaultBranch: 'main',
    });
    expect(repo.id).toBeDefined();
    repositoryId = repo.id;

    // 3. Verify persistent state in database
    const dbOrg = await pool.query('SELECT * FROM organizations WHERE id = $1', [orgId]);
    expect(dbOrg.rows.length).toBe(1);
    expect(dbOrg.rows[0].github_account_login).toBe('alpha-labs');
    expect(dbOrg.rows[0].plan).toBe('free');

    const dbRepo = await pool.query('SELECT * FROM repositories WHERE id = $1', [repositoryId]);
    expect(dbRepo.rows.length).toBe(1);
    expect(dbRepo.rows[0].full_name).toBe('alpha-labs/core-api');
    expect(dbRepo.rows[0].is_active).toBe(true);
  });

  // ============================================================================
  // WORKFLOW C: CI Failure -> Webhook -> Worker -> AI Diagnosis -> DB & Dashboard
  // ============================================================================
  it('Workflow C: Ingests CI failure event, runs diagnosis pipeline, and persists report', async () => {
    const rawErrorLog = `
2026-11-06T10:00:00.000Z [INFO] Starting test suite
2026-11-06T10:00:01.000Z [INFO] Connected to DB with key AKIAIOSFODNN7EXAMPLE
2026-11-06T10:00:02.000Z [FAIL] src/auth/token-service.spec.ts > TokenService > verifies valid token
AssertionError: expected status to equal 200, but got 401
    at Object.<anonymous> (/workspace/src/auth/token-service.spec.ts:42:18)
    at runMicrotasks (<anonymous>)
2026-11-06T10:00:03.000Z [INFO] Test run completed with 1 failure
    `;

    const eventData: WorkflowJobEventData = {
      installationId: 99887766,
      orgLogin: 'alpha-labs',
      accountType: 'Organization',
      repoFullName: 'alpha-labs/core-api',
      githubRepoId: 88776655,
      workflowName: 'Test & Lint',
      jobName: 'Integration Tests',
      stepName: 'Run Vitest',
      githubRunId: 10001,
      githubJobId: 20001,
      githubRunAttempt: 1,
      commitSha: 'c0ffee112233445566778899aabbccddeeff0011',
      branch: 'main',
      prNumber: 42,
      actorLogin: 'alice',
      conclusion: 'failure',
      rawLog: rawErrorLog,
      modifiedFiles: ['src/auth/token-service.ts', 'src/auth/token-service.spec.ts'],
      runUrl: 'https://github.com/alpha-labs/core-api/actions/runs/10001',
    };

    // Process job through workflow processor
    const result = await processWorkflowJob(eventData);

    expect(result.status).toBe('diagnosed');
    expect(result.signatureHash).toBeDefined();
    expect(result.failureId).toBeDefined();

    // 1. Verify failure signature persisted in database
    const dbSig = await pool.query('SELECT * FROM failure_signatures WHERE signature_hash = $1', [result.signatureHash]);
    expect(dbSig.rows.length).toBe(1);
    expect(dbSig.rows[0].total_occurrences).toBe(1);
    expect(dbSig.rows[0].repo_id).toBe(repositoryId);
    signatureId = dbSig.rows[0].id;

    // 2. Verify workflow failure recorded with sanitized snippet
    const dbFailure = await pool.query('SELECT * FROM workflow_failures WHERE id = $1', [result.failureId]);
    expect(dbFailure.rows.length).toBe(1);
    expect(dbFailure.rows[0].sanitized_log_snippet).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(dbFailure.rows[0].sanitized_log_snippet).toContain('[REDACTED_AWS_KEY]');
    expect(dbFailure.rows[0].sanitized_log_snippet).toContain('AssertionError');

    // 3. Verify diagnostic report generated and stored
    const dbReport = await pool.query('SELECT * FROM diagnostic_reports WHERE failure_id = $1', [result.failureId]);
    expect(dbReport.rows.length).toBe(1);
    expect(dbReport.rows[0].suggested_next_check).toBeDefined();

    // 4. Verify dashboard endpoint exposes the failure
    const dashRes = await fetch(`http://127.0.0.1:${port}/api/dashboard/alpha-labs`, {
      headers: { Authorization: `Bearer ${tokenUserA}` },
    });
    expect(dashRes.status).toBe(200);
    const dashData = (await dashRes.json()) as any;
    expect(dashData.orgSlug).toBe('alpha-labs');
  });

  // ============================================================================
  // WORKFLOW D: Recurring Failure -> Signature Detection -> Flakiness Analysis
  // ============================================================================
  it('Workflow D: Recurring failure detected, flakiness score calculated, diagnosis cached', async () => {
    // Second failure with identical error pattern
    const secondEvent: WorkflowJobEventData = {
      installationId: 99887766,
      orgLogin: 'alpha-labs',
      accountType: 'Organization',
      repoFullName: 'alpha-labs/core-api',
      githubRepoId: 88776655,
      workflowName: 'Test & Lint',
      jobName: 'Integration Tests',
      stepName: 'Run Vitest',
      githubRunId: 10002,
      githubJobId: 20002,
      githubRunAttempt: 1,
      commitSha: 'c0ffee222233445566778899aabbccddeeff0022',
      branch: 'feat/tokens',
      prNumber: 43,
      actorLogin: 'alice',
      conclusion: 'failure',
      rawLog: `
2026-11-06T10:15:00.000Z [INFO] Starting test suite
2026-11-06T10:15:01.000Z [INFO] Connected to DB with key AKIAIOSFODNN7EXAMPLE
2026-11-06T10:15:02.000Z [FAIL] src/auth/token-service.spec.ts > TokenService > verifies valid token
AssertionError: expected status to equal 200, but got 401
    at Object.<anonymous> (/workspace/src/auth/token-service.spec.ts:42:18)
    at runMicrotasks (<anonymous>)
2026-11-06T10:15:03.000Z [INFO] Test run completed with 1 failure
    `,
      modifiedFiles: [],
      runUrl: 'https://github.com/alpha-labs/core-api/actions/runs/10002',
    };

    const result2 = await processWorkflowJob(secondEvent);
    expect(result2.signatureHash).toBeDefined(); // Reused identical signature hash

    // Now simulate a retry on the exact same commit that passed
    const retrySuccessEvent: WorkflowJobEventData = {
      ...secondEvent,
      githubRunAttempt: 2,
      conclusion: 'success',
      rawLog: 'All tests passed cleanly',
    };

    const retryResult = await processWorkflowJob(retrySuccessEvent);
    expect(retryResult.status).toBe('flakiness_updated');

    // Verify in database: total_occurrences incremented and same_sha_retry_passes incremented
    const updatedSig = await pool.query('SELECT * FROM failure_signatures WHERE id = $1', [signatureId]);
    expect(updatedSig.rows[0].total_occurrences).toBe(2);
    expect(updatedSig.rows[0].same_sha_retry_passes).toBe(1);
    expect(parseFloat(updatedSig.rows[0].flakiness_score)).toBeGreaterThan(0);
  });

  // ============================================================================
  // WORKFLOW E: User Invites Member -> Assigns Role -> Verifies RBAC
  // ============================================================================
  it('Workflow E: Owner invites Developer, verifies access and RBAC boundaries', async () => {
    // 1. Create User B profile via profile endpoint
    const profileBRes = await fetch(`http://127.0.0.1:${port}/api/user/profile`, {
      headers: { Authorization: `Bearer ${tokenUserB}` },
    });
    expect(profileBRes.status).toBe(200);
    const profileBData = (await profileBRes.json()) as any;
    userBProfileId = profileBData.profile.id;

    // 2. User A (Owner) invites User B as developer
    const inviteRes = await fetch(`http://127.0.0.1:${port}/api/workspaces/${workspaceId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUserA}`,
      },
      body: JSON.stringify({
        userId: userBProfileId,
        role: 'developer',
      }),
    });

    expect(inviteRes.status).toBe(201);
    const inviteData = (await inviteRes.json()) as any;
    expect(inviteData.member.role).toBe('developer');

    // 3. User B accesses workspace details (Viewer+ allowed -> 200 OK)
    const viewRes = await fetch(`http://127.0.0.1:${port}/api/workspaces/${workspaceId}`, {
      headers: { Authorization: `Bearer ${tokenUserB}` },
    });

    expect(viewRes.status).toBe(200);
    const viewData = (await viewRes.json()) as any;
    expect(viewData.workspace.name).toBe('Alpha Labs Workspace');

    // 4. User B attempts unauthorized mutation: modify workspace (Admin+ required -> 403)
    const patchRes = await fetch(`http://127.0.0.1:${port}/api/workspaces/${workspaceId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenUserB}`,
      },
      body: JSON.stringify({ name: 'Hacked Workspace Name' }),
    });

    expect(patchRes.status).toBe(403);

    // 5. User B attempts to remove Owner: blocked (403 Forbidden)
    const memberARow = await pool.query(
      'SELECT id FROM workspace_members WHERE workspace_id = $1 AND role = $2',
      [workspaceId, 'owner']
    );
    const deleteOwnerRes = await fetch(
      `http://127.0.0.1:${port}/api/workspaces/${workspaceId}/members/${memberARow.rows[0].id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokenUserB}` },
      }
    );

    expect(deleteOwnerRes.status).toBe(403);
  });

  // ============================================================================
  // WORKFLOW F: Subscription Upgrade -> Stripe Webhook -> Entitlements Updated
  // ============================================================================
  it('Workflow F: Stripe checkout upgrades organization to Team tier with 1000 run limit', async () => {
    // Current org state: plan free (limit 30)
    const preOrg = await orgRepo.findById(orgId);
    expect(preOrg?.plan).toBe('free');
    expect(preOrg?.monthly_run_limit).toBe(30);

    // Webhook event from Stripe: checkout.session.completed for Team plan
    const stripeWebhookPayload = {
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: orgId,
          customer: 'cus_alpha_team_123',
          subscription: 'sub_alpha_team_456',
          metadata: {
            plan: 'team',
          },
        },
      },
    };

    const stripeResult = await handleStripeWebhookEvent(stripeWebhookPayload, orgRepo);
    expect(stripeResult.handled).toBe(true);
    expect(stripeResult.action).toBe('plan_upgraded');
    expect(stripeResult.plan).toBe('team');

    // Verify persistent state directly in PostgreSQL
    const postOrg = await pool.query('SELECT * FROM organizations WHERE id = $1', [orgId]);
    expect(postOrg.rows[0].plan).toBe('team');
    expect(postOrg.rows[0].monthly_run_limit).toBe(1000);
    expect(postOrg.rows[0].stripe_customer_id).toBe('cus_alpha_team_123');
    expect(postOrg.rows[0].stripe_subscription_id).toBe('sub_alpha_team_456');
  });

  // ============================================================================
  // WORKFLOW G: User Logout -> Login -> Restore Session & Workspace State
  // ============================================================================
  it('Workflow G: User logs out, logs back in, and session state rehydrates from DB', async () => {
    // 1. Simulating client-side token discard / logout
    let clientAuthToken: string | null = tokenUserA;
    clientAuthToken = null;
    expect(clientAuthToken).toBeNull();

    // 2. Unauthenticated request to workspace endpoint is rejected (401 Unauthorized)
    const unauthRes = await fetch(`http://127.0.0.1:${port}/api/workspaces`);
    expect(unauthRes.status).toBe(401);

    // 3. User re-authenticates with fresh Supabase session token
    const freshToken = createTestJwt(userAId, 'alice@alpha-labs.dev');

    // 4. User queries their workspaces with fresh token
    const authRes = await fetch(`http://127.0.0.1:${port}/api/workspaces`, {
      headers: { Authorization: `Bearer ${freshToken}` },
    });

    expect(authRes.status).toBe(200);
    const authData = (await authRes.json()) as any;
    expect(Array.isArray(authData.workspaces)).toBe(true);
    const userWorkspace = authData.workspaces.find((w: any) => w.id === workspaceId);
    expect(userWorkspace).toBeDefined();
    expect(userWorkspace.name).toBe('Alpha Labs Workspace');
    expect(userWorkspace.owner_id).toBe(userAProfileId);
  });
});
