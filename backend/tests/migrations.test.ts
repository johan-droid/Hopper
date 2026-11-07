import { describe, it, expect } from 'vitest';
import { runMigrations } from '../src/db/migrator.js';
import { DatabaseExecutor, QueryResultLike } from '../src/db/client.js';

describe('Database Migrations', () => {
  it('applies every SQL migration in order, including the HNSW index', async () => {
    const executed: string[] = [];
    const executor: DatabaseExecutor = {
      query: async <T = any>(sql: string): Promise<QueryResultLike<T>> => {
        executed.push(sql);
        return { rows: [] as T[], rowCount: 0 };
      },
    };

    const result = await runMigrations(executor, process.cwd());

    expect(result.applied).toBe(true);
    expect(executed).toHaveLength(10);
    expect(executed[9]).toContain('hopper_job_queue');
    expect(executed[9]).toContain('hopper_claim_jobs');
    expect(executed[0]).toContain('CREATE TABLE IF NOT EXISTS organizations');
    expect(executed[1]).toContain('CREATE INDEX CONCURRENTLY IF NOT EXISTS');
    expect(executed[1]).toContain('USING hnsw (embedding vector_cosine_ops)');
    expect(executed[1]).toContain('m = 16, ef_construction = 64');
    expect(executed[2]).toContain('0003: GAP RECONCILIATION');
    expect(executed[3]).toContain('CREATE TABLE IF NOT EXISTS user_profiles');
    expect(executed[4]).toContain('ROW LEVEL SECURITY');
    expect(executed[4]).toContain('user_profiles_select_policy');
    expect(executed[4]).toContain('workspaces_select_policy');
    expect(executed[5]).toContain('SECURITY DEFINER');
    expect(executed[5]).toContain('get_user_workspace_ids');
    expect(executed[6]).toContain('0007_link_workspace_organizations.sql');
    expect(executed[6]).toContain('workspace_id UUID REFERENCES workspaces(id)');
    expect(executed[7]).toContain('0008_dedicated_runtime_role_and_rls_hardening.sql');
    expect(executed[7]).toContain('FORCE ROW LEVEL SECURITY');
    expect(executed[8]).toContain('0009_ai_budget_controller_ledger.sql');
    expect(executed[8]).toContain('ai_budget_ledgers');
  });
});
