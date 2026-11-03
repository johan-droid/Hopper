import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  setDatabaseExecutor,
  getDatabaseExecutor,
  query,
  withTransaction,
  checkDatabaseHealth,
  DatabaseExecutor,
  QueryResultLike,
  getDatabaseConnectionString,
} from '../src/db/client.js';

describe('Database Client & Pool Infrastructure', () => {
  beforeEach(() => {
    setDatabaseExecutor(null);
  });

  afterEach(() => {
    setDatabaseExecutor(null);
  });

  it('resolves database connection string with default fallback', () => {
    const connStr = getDatabaseConnectionString();
    expect(connStr).toBeDefined();
    expect(typeof connStr).toBe('string');
  });

  it('allows injecting a custom database executor', async () => {
    const mockExecutor: DatabaseExecutor = {
      query: async <T = any>(sql: string, params?: any[]): Promise<QueryResultLike<T>> => {
        return {
          rows: [{ mocked_result: 42, sql, params: params || [] }] as unknown as T[],
          rowCount: 1,
        };
      },
    };

    setDatabaseExecutor(mockExecutor);
    expect(getDatabaseExecutor()).toBe(mockExecutor);

    const result = await query('SELECT $1::int AS test_val', [42]);
    expect(result.rows.length).toBe(1);
    expect((result.rows[0] as any).mocked_result).toBe(42);
  });

  it('executes withTransaction using custom executor', async () => {
    let transactionExecuted = false;
    const mockExecutor: DatabaseExecutor = {
      query: async <T = any>(): Promise<QueryResultLike<T>> => {
        return { rows: [] as T[], rowCount: 0 };
      },
    };

    setDatabaseExecutor(mockExecutor);

    const res = await withTransaction(async (tx) => {
      transactionExecuted = true;
      expect(tx).toBeDefined();
      return 'transaction_ok';
    });

    expect(transactionExecuted).toBe(true);
    expect(res).toBe('transaction_ok');
  });

  it('reports database health accurately via checkDatabaseHealth with mock executor', async () => {
    const mockExecutor: DatabaseExecutor = {
      query: async <T = any>(sql: string): Promise<QueryResultLike<T>> => {
        if (sql.includes('version()')) {
          return { rows: [{ version: 'PostgreSQL 16.1 on x86_64' }] as unknown as T[], rowCount: 1 };
        }
        if (sql.includes('pg_extension')) {
          return { rows: [{ extname: 'vector' }] as unknown as T[], rowCount: 1 };
        }
        return { rows: [] as T[], rowCount: 0 };
      },
    };

    setDatabaseExecutor(mockExecutor);

    const health = await checkDatabaseHealth();
    expect(health.isHealthy).toBe(true);
    expect(health.pgVersion).toContain('PostgreSQL 16.1');
    expect(health.hasPgvector).toBe(true);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('handles database error gracefully in checkDatabaseHealth', async () => {
    const brokenExecutor: DatabaseExecutor = {
      query: async (): Promise<QueryResultLike<any>> => {
        throw new Error('Connection refused to PostgreSQL host:5432');
      },
    };

    setDatabaseExecutor(brokenExecutor);

    const health = await checkDatabaseHealth();
    expect(health.isHealthy).toBe(false);
    expect(health.error).toContain('Connection refused');
  });
});
