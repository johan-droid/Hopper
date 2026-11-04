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
    expect(executed).toHaveLength(2);
    expect(executed[0]).toContain('CREATE TABLE IF NOT EXISTS organizations');
    expect(executed[1]).toContain('CREATE INDEX CONCURRENTLY IF NOT EXISTS');
    expect(executed[1]).toContain('USING hnsw (embedding vector_cosine_ops)');
    expect(executed[1]).toContain('m = 16, ef_construction = 64');
  });
});
