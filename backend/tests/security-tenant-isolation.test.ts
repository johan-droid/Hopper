import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import pg from 'pg';
import { createServer } from '../src/server/index.js';
import { DEFAULT_DEV_JWT_SECRET } from '../src/server/middleware/auth.js';
import { OrganizationRepository } from '../src/db/repositories/organization.repository.js';
import { RepositoryRepository } from '../src/db/repositories/repository.repository.js';
import { FailureSignatureRepository } from '../src/db/repositories/failure-signature.repository.js';
import { WorkflowFailureRepository } from '../src/db/repositories/workflow-failure.repository.js';
import { DiagnosticReportRepository } from '../src/db/repositories/diagnostic-report.repository.js';

function createToken(userId: string, email: string) {
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

describe('Phase H Security Hardening: Tenant Isolation & Authentication', () => {
  const runSuffix = Math.floor(Math.random() * 899999 + 100000).toString();
  const tenantAOwnerId = `a1a1a1a1-0000-0000-0000-${runSuffix}000001`;
  const tenantBOutsiderId = `b2b2b2b2-0000-0000-0000-${runSuffix}000002`;
  const tenantCMemberId = `c3c3c3c3-0000-0000-0000-${runSuffix}000003`;

  const tenantAToken = createToken(tenantAOwnerId, `owner_${runSuffix}@tenant-a.com`);
  const tenantBToken = createToken(tenantBOutsiderId, `outsider_${runSuffix}@tenant-b.com`);
  const tenantCToken = createToken(tenantCMemberId, `member_${runSuffix}@tenant-c.com`);

  let server: any;
  let port: number;
  let workspaceAId: string;
  let workspaceBId: string;
  let tenantCProfileId: string;
  let repoA: any;
  let sigA: any;
  let failureA: any;
  let reportA: any;
  let orgA: any;
  const orgSlugA = `tenant-a-org-${runSuffix}`;

  beforeAll(async () => {
    const app = createServer();
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address();
    port = typeof address === 'object' && address ? address.port : 0;

    // 1. Initialize user profiles
    await fetch(`http://127.0.0.1:${port}/api/user/profile`, {
      headers: { Authorization: `Bearer ${tenantAToken}` },
    });
    await fetch(`http://127.0.0.1:${port}/api/user/profile`, {
      headers: { Authorization: `Bearer ${tenantBToken}` },
    });
    const resProfC = await fetch(`http://127.0.0.1:${port}/api/user/profile`, {
      headers: { Authorization: `Bearer ${tenantCToken}` },
    });
    const dataProfC = (await resProfC.json()) as any;
    tenantCProfileId = dataProfC.profile.id;

    // 2. Create private Workspace A for Tenant A
    const resWsA = await fetch(`http://127.0.0.1:${port}/api/workspaces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantAToken}`,
      },
      body: JSON.stringify({
        name: `Tenant A Workspace ${runSuffix}`,
        type: 'organization',
        isPublic: false,
      }),
    });
    const dataWsA = (await resWsA.json()) as any;
    workspaceAId = dataWsA.workspace.id;

    // 3. Create private Workspace B for Tenant B
    const resWsB = await fetch(`http://127.0.0.1:${port}/api/workspaces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantBToken}`,
      },
      body: JSON.stringify({
        name: `Tenant B Workspace ${runSuffix}`,
        type: 'organization',
        isPublic: false,
      }),
    });
    const dataWsB = (await resWsB.json()) as any;
    workspaceBId = dataWsB.workspace.id;

    // 4. Create Organization and link to Workspace A
    const orgRepo = new OrganizationRepository();
    const repoRepo = new RepositoryRepository();
    const sigRepo = new FailureSignatureRepository();
    const failureRepo = new WorkflowFailureRepository();
    const reportRepo = new DiagnosticReportRepository();

    orgA = await orgRepo.upsert({
      githubInstallationId: parseInt(runSuffix, 10),
      githubAccountLogin: orgSlugA,
      githubAccountType: 'Organization',
      plan: 'pro_dev',
      workspaceId: workspaceAId,
    });

    // 5. Create Repository under Org A / Workspace A
    repoA = await repoRepo.upsert({
      orgId: orgA.id,
      githubRepoId: parseInt(runSuffix, 10),
      fullName: `tenant-a/service-${runSuffix}`,
      defaultBranch: 'main',
      isActive: true,
      workspaceId: workspaceAId,
    });

    // 6. Create Signature & Failure for Repo A
    sigA = await sigRepo.upsert({
      repoId: repoA.id,
      signatureHash: `hash_${runSuffix}_a1b2c3d4e5f6`,
      normalizedTemplate: 'AssertionError: expected true to be false',
      errorCategory: 'test_assertion',
    });

    failureA = await failureRepo.create({
      repoId: repoA.id,
      signatureId: sigA.id,
      githubRunId: parseInt(runSuffix, 10) * 10,
      githubJobId: parseInt(runSuffix, 10) * 10 + 1,
      workflowName: 'Test & Lint',
      jobName: 'ci / test',
      failedStepName: 'vitest run',
      commitSha: 'a1b2c3d4e5f60000000000000000000000000000',
      branch: 'main',
      sanitizedLogSnippet: 'AssertionError: expected true to be false at line 42',
      exitCode: 1,
    });

    reportA = await reportRepo.create({
      failureId: failureA.id,
      rootCauseClues: 'Unit test assertion failed due to unexpected boolean state',
      likelyFlakyTest: 'vitest run',
      flakyConfidence: 15.0,
      relevantLogLines: [
        { line_number: 42, content: 'AssertionError: expected true to be false', explanation: 'Primary assertion' },
      ],
      suggestedNextCheck: 'Inspect mock setup in unit test file',
      llmModelUsed: 'deterministic-pattern-matcher',
      promptTokens: 0,
      completionTokens: 0,
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe('1. Repositories API Protection (/api/repositories)', () => {
    it('blocks unauthenticated requests with 401', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/repositories?workspaceId=${workspaceAId}`);
      expect(res.status).toBe(401);
    });

    it('blocks cross-tenant access to Workspace A repositories with 403', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/repositories?workspaceId=${workspaceAId}`, {
        headers: { Authorization: `Bearer ${tenantBToken}` },
      });
      expect(res.status).toBe(403);
    });

    it('allows Workspace A member to list repositories', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/repositories?workspaceId=${workspaceAId}`, {
        headers: { Authorization: `Bearer ${tenantAToken}` },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.success).toBe(true);
      expect(data.repositories.some((r: any) => r.id === repoA.id)).toBe(true);
    });

    it('blocks cross-tenant linking of repository to foreign workspace (IDOR defense)', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/repositories/${repoA.id}/link-workspace`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantBToken}`,
        },
        body: JSON.stringify({ workspaceId: workspaceBId }),
      });
      expect(res.status).toBe(403);
    });

    it('blocks cross-tenant inspection of repository failures with 403', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/repositories/${repoA.id}/failures`, {
        headers: { Authorization: `Bearer ${tenantBToken}` },
      });
      expect(res.status).toBe(403);
    });

    it('allows authorized workspace member to view repository failures', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/repositories/${repoA.id}/failures`, {
        headers: { Authorization: `Bearer ${tenantAToken}` },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.failureCount).toBeGreaterThanOrEqual(1);
      expect(data.failures[0].githubRunId).toBe(String(parseInt(runSuffix, 10) * 10));
    });
  });

  describe('2. Failure Signatures API Protection (/api/signatures)', () => {
    it('blocks unauthenticated access to signature with 401', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/signatures/${sigA.id}`);
      expect(res.status).toBe(401);
    });

    it('blocks cross-tenant access to failure signature with 403', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/signatures/${sigA.id}`, {
        headers: { Authorization: `Bearer ${tenantBToken}` },
      });
      expect(res.status).toBe(403);
    });

    it('allows authorized member to inspect failure signature cross-run timeline', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/signatures/${sigA.id}`, {
        headers: { Authorization: `Bearer ${tenantAToken}` },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.id).toBe(sigA.id);
      expect(data.crossRunTimeline).toHaveLength(1);
    });

    it('returns 404 for non-existent signature', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/signatures/00000000-0000-0000-0000-000000000000`, {
        headers: { Authorization: `Bearer ${tenantAToken}` },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('3. Dashboard API Protection (/api/dashboard)', () => {
    it('blocks unauthenticated access to dashboard with 401', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/dashboard/${orgSlugA}`);
      expect(res.status).toBe(401);
    });

    it('blocks cross-tenant access to organization dashboard with 403', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/dashboard/${orgSlugA}`, {
        headers: { Authorization: `Bearer ${tenantBToken}` },
      });
      expect(res.status).toBe(403);
    });

    it('allows authorized member to view organization dashboard without fake fallback data', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/dashboard/${orgSlugA}`, {
        headers: { Authorization: `Bearer ${tenantAToken}` },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.orgSlug).toBe(orgSlugA);
      expect(data.flakyTestLeaderboard).toBeInstanceOf(Array);
    });
  });

  describe('4. Diagnoses API Protection (/api/diagnose/history)', () => {
    it('blocks unauthenticated access to diagnosis history with 401', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/diagnose/history?workspaceId=${workspaceAId}`);
      expect(res.status).toBe(401);
    });

    it('blocks cross-tenant access to Workspace A diagnosis history with 403', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/diagnose/history?workspaceId=${workspaceAId}`, {
        headers: { Authorization: `Bearer ${tenantBToken}` },
      });
      expect(res.status).toBe(403);
    });

    it('allows authorized member to read Workspace A diagnosis history', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/diagnose/history?workspaceId=${workspaceAId}`, {
        headers: { Authorization: `Bearer ${tenantAToken}` },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.success).toBe(true);
      expect(data.count).toBeGreaterThanOrEqual(1);
      expect(data.diagnoses[0].rootCauseClues).toContain('Unit test assertion failed');
    });
  });

  describe('5. Workspace Organization Linking IDOR Defense', () => {
    it('blocks Tenant B from linking Tenant A organization into Workspace B with 403', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/workspaces/${workspaceBId}/organizations/link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantBToken}`,
        },
        body: JSON.stringify({ orgId: orgA.id }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe('6. Membership Revocation Access Termination', () => {
    it('immediately denies access after user membership in workspace is revoked', async () => {
      // 1. Add Tenant C as developer in Workspace A
      const addRes = await fetch(`http://127.0.0.1:${port}/api/workspaces/${workspaceAId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantAToken}`,
        },
        body: JSON.stringify({ userId: tenantCProfileId, role: 'developer' }),
      });
      expect(addRes.status).toBe(201);

      // 2. Tenant C can access Workspace A repositories
      const accessRes = await fetch(`http://127.0.0.1:${port}/api/repositories?workspaceId=${workspaceAId}`, {
        headers: { Authorization: `Bearer ${tenantCToken}` },
      });
      expect(accessRes.status).toBe(200);

      // 3. Tenant A revokes Tenant C
      const delRes = await fetch(`http://127.0.0.1:${port}/api/workspaces/${workspaceAId}/members/${tenantCProfileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tenantAToken}` },
      });
      expect(delRes.status).toBe(200);

      // 4. Tenant C is immediately blocked with 403
      const blockedRes = await fetch(`http://127.0.0.1:${port}/api/repositories?workspaceId=${workspaceAId}`, {
        headers: { Authorization: `Bearer ${tenantCToken}` },
      });
      expect(blockedRes.status).toBe(403);
    });
  });

  describe('7. PostgreSQL Kernel-Level Row-Level Security (hopper_app Runtime Role)', () => {
    let unprivClient: pg.Client;

    beforeAll(async () => {
      unprivClient = new pg.Client({
        connectionString: 'postgresql://hopper_app:hopper_app_secure_runtime_password@localhost:5432/hopper_db',
      });
      await unprivClient.connect();
    });

    afterAll(async () => {
      await unprivClient.end();
    });

    it('RLS hides Workspace A repositories from Tenant B in direct SQL query', async () => {
      await unprivClient.query('BEGIN');
      await unprivClient.query('SELECT set_config($1, $2, true)', ['request.jwt.claim.sub', tenantBOutsiderId]);

      const res = await unprivClient.query('SELECT * FROM repositories WHERE workspace_id = $1', [workspaceAId]);
      expect(res.rows).toHaveLength(0);

      await unprivClient.query('ROLLBACK');
    });

    it('RLS prevents Tenant B from updating Workspace A records (affects 0 rows)', async () => {
      await unprivClient.query('BEGIN');
      await unprivClient.query('SELECT set_config($1, $2, true)', ['request.jwt.claim.sub', tenantBOutsiderId]);

      const res = await unprivClient.query(
        'UPDATE repositories SET full_name = $1 WHERE id = $2',
        ['hacked/service', repoA.id]
      );
      expect(res.rowCount).toBe(0);

      await unprivClient.query('ROLLBACK');
    });

    it('RLS prevents Tenant B from deleting Workspace A records (affects 0 rows)', async () => {
      await unprivClient.query('BEGIN');
      await unprivClient.query('SELECT set_config($1, $2, true)', ['request.jwt.claim.sub', tenantBOutsiderId]);

      const res = await unprivClient.query('DELETE FROM repositories WHERE id = $1', [repoA.id]);
      expect(res.rowCount).toBe(0);

      await unprivClient.query('ROLLBACK');
    });

    it('RLS rejects Tenant B inserting repository into Workspace A with policy violation', async () => {
      await unprivClient.query('BEGIN');
      await unprivClient.query('SELECT set_config($1, $2, true)', ['request.jwt.claim.sub', tenantBOutsiderId]);

      await expect(
        unprivClient.query(
          `INSERT INTO repositories (org_id, github_repo_id, full_name, workspace_id)
           VALUES ($1, $2, $3, $4)`,
          [null, 99999999, 'injected/repo', workspaceAId]
        )
      ).rejects.toThrow(/violates row-level security policy/);

      await unprivClient.query('ROLLBACK');
    });
  });
});
