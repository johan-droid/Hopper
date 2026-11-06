import { describe, it, expect } from 'vitest';
import { createServer } from '../src/server/index.js';
import { OrganizationRepository } from '../src/db/repositories/organization.repository.js';
import { RepositoryRepository } from '../src/db/repositories/repository.repository.js';
import { DatabaseExecutor } from '../src/db/client.js';

describe('Phase C: Workspace-Organization Bridge & Decoupled Routers', () => {
  it('links an organization to a workspace and updates repository association', async () => {
    const executedQueries: Array<{ sql: string; params: any[] }> = [];

    const mockExecutor: DatabaseExecutor = {
      query: async <T = any>(sql: string, params: any[] = []): Promise<{ rows: T[]; rowCount: number }> => {
        executedQueries.push({ sql, params });

        if (sql.includes('UPDATE organizations') && sql.includes('workspace_id = $2')) {
          return {
            rows: [
              {
                id: params[0],
                workspace_id: params[1],
                github_installation_id: 12345,
                github_account_login: 'acme-corp',
                github_account_type: 'Organization',
                plan: 'free',
                monthly_run_limit: 30,
                runs_used_this_period: 0,
                billing_period_reset_at: new Date(),
                slack_webhook_url: null,
                discord_webhook_url: null,
                auto_retry_policy: false,
                stripe_customer_id: null,
                stripe_subscription_id: null,
                created_at: new Date(),
                updated_at: new Date(),
              } as unknown as T,
            ],
            rowCount: 1,
          };
        }

        if (sql.includes('SELECT * FROM organizations WHERE workspace_id = $1')) {
          return {
            rows: [
              {
                id: 'org-1',
                workspace_id: params[0],
                github_installation_id: 12345,
                github_account_login: 'acme-corp',
                github_account_type: 'Organization',
                plan: 'free',
              } as unknown as T,
            ],
            rowCount: 1,
          };
        }

        if (sql.includes('SELECT r.* FROM repositories r')) {
          return {
            rows: [
              {
                id: 'repo-1',
                org_id: 'org-1',
                workspace_id: params[0],
                github_repo_id: 9999,
                full_name: 'acme-corp/web-app',
                default_branch: 'main',
                is_active: true,
                created_at: new Date(),
              } as unknown as T,
            ],
            rowCount: 1,
          };
        }

        return { rows: [], rowCount: 0 };
      },
    };

    const orgRepo = new OrganizationRepository(mockExecutor);
    const repoRepo = new RepositoryRepository(mockExecutor);

    // 1. Link org to workspace
    const linkedOrg = await orgRepo.linkWorkspace('org-1', 'ws-100');
    expect(linkedOrg.workspace_id).toBe('ws-100');

    // 2. Query orgs by workspace
    const orgs = await orgRepo.findByWorkspaceId('ws-100');
    expect(orgs).toHaveLength(1);
    expect(orgs[0].github_account_login).toBe('acme-corp');

    // 3. Query repositories by workspace
    const repos = await repoRepo.listByWorkspaceId('ws-100');
    expect(repos).toHaveLength(1);
    expect(repos[0].full_name).toBe('acme-corp/web-app');
  });

  it('serves checkout endpoint with validation free-tier response when monetization is deferred', async () => {
    const originalStripeKey = process.env.STRIPE_SECRET_KEY;
    const app = createServer();
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      process.env.STRIPE_SECRET_KEY = 'mock_stripe_key';

      const res = await fetch(`http://127.0.0.1:${port}/api/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: 'org-test-1',
          orgLogin: 'test-org',
          plan: 'pro_dev',
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.mode).toBe('validation_free_tier');
      expect(data.plan).toBe('pro_dev');
      expect(data.message).toContain('Hopper is currently running in unrestricted validation mode');
    } finally {
      process.env.STRIPE_SECRET_KEY = originalStripeKey;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('serves ad-hoc diagnostic endpoint via the decoupled diagnose route', async () => {
    const app = createServer();
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const sampleLog = `
        FAIL src/auth.spec.ts
        ● Auth test failed
          AssertionError: Expected 200 to equal 401
      `;

      const res = await fetch(`http://127.0.0.1:${port}/api/diagnose/adhoc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawLog: sampleLog,
          jobName: 'test',
          stepName: 'unit',
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.signatureHash).toBeDefined();
      expect(data.diagnosis).toBeDefined();
      expect(data.diagnosis.root_cause_clues).toBeDefined();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
