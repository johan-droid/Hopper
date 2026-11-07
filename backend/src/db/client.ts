/**
 * Database Connection Pool & Client Management.
 * Supports connection pooling, transactional execution, and health checks
 * for PostgreSQL 16 with pgvector extension.
 */

import pg from 'pg';

const { Pool } = pg;

export interface QueryResultLike<T = any> {
  rows: T[];
  rowCount: number | null;
}

export interface DatabaseExecutor {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResultLike<T>>;
}

let activePool: pg.Pool | null = null;
let customExecutor: DatabaseExecutor | null = null;

export function getDatabaseConnectionString(): string {
  return (
    process.env.DIRECT_URL ||
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/hopper_db'
  );
}

export function createPool(): pg.Pool {
  let connectionString = getDatabaseConnectionString();
  const isSsl =
    connectionString.includes('sslmode=require') ||
    connectionString.includes('supabase.co') ||
    connectionString.includes('supabase.com') ||
    connectionString.includes('neon.tech') ||
    process.env.PGSSLMODE === 'require';

  // Strip sslmode from connectionString query parameter so pg-connection-string
  // does not override ssl: { rejectUnauthorized: false } with strict CA validation.
  if (isSsl) {
    try {
      const parsed = new URL(connectionString);
      if (parsed.searchParams.has('sslmode')) {
        parsed.searchParams.delete('sslmode');
        connectionString = parsed.toString();
      }
    } catch {
      connectionString = connectionString.replace(/[?&]sslmode=[^&]+/g, '');
    }
  }

  return new Pool({
    connectionString,
    max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '10000', 10),
    ssl: isSsl ? { rejectUnauthorized: false } : undefined,
  });
}

export function getDatabasePool(): pg.Pool {
  if (!activePool) {
    activePool = createPool();
  }
  return activePool;
}

/**
 * Set a custom executor for testing or dependency injection.
 */
export function setDatabaseExecutor(executor: DatabaseExecutor | null): void {
  customExecutor = executor;
}

/**
 * Returns the current active database executor (custom mock or live pg pool).
 */
export function getDatabaseExecutor(): DatabaseExecutor {
  if (customExecutor) {
    return customExecutor;
  }
  return getDatabasePool();
}

/**
 * Execute a parameterized query.
 */
export async function query<T = any>(
  sql: string,
  params: any[] = []
): Promise<QueryResultLike<T>> {
  const executor = getDatabaseExecutor();
  return executor.query<T>(sql, params);
}

/**
 * Execute a series of statements inside a single transaction.
 */
export async function withTransaction<T>(
  callback: (executor: DatabaseExecutor) => Promise<T>
): Promise<T> {
  if (customExecutor) {
    return callback(customExecutor);
  }

  const pool = getDatabasePool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Execute a series of statements inside a single transaction with authenticated tenant context.
 * Scopes PostgreSQL session setting 'request.jwt.claim.sub' locally to the transaction,
 * ensuring database kernel-level Row-Level Security (RLS) policies are enforced without
 * connection pool leakage.
 */
export async function withTenantContext<T>(
  userId: string,
  callback: (executor: DatabaseExecutor) => Promise<T>
): Promise<T> {
  if (customExecutor) {
    return callback(customExecutor);
  }

  const pool = getDatabasePool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['request.jwt.claim.sub', userId]);
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface DatabaseHealthStatus {
  isHealthy: boolean;
  latencyMs: number;
  pgVersion?: string;
  hasPgvector?: boolean;
  error?: string;
}

/**
 * Verify database connectivity and pgvector extension readiness.
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealthStatus> {
  const start = Date.now();
  try {
    const executor = getDatabaseExecutor();
    const verRes = await executor.query<{ version: string }>('SELECT version()');
    const pgVersion = verRes.rows[0]?.version || 'unknown';

    // Verify pgvector extension
    const extRes = await executor.query<{ extname: string }>(
      "SELECT extname FROM pg_extension WHERE extname = 'vector'"
    );
    const hasPgvector = extRes.rows.length > 0;

    return {
      isHealthy: true,
      latencyMs: Date.now() - start,
      pgVersion,
      hasPgvector,
    };
  } catch (err: any) {
    return {
      isHealthy: false,
      latencyMs: Date.now() - start,
      error: err.message || 'Database connection error',
    };
  }
}

/**
 * Gracefully close the database connection pool.
 */
export async function closeDatabasePool(): Promise<void> {
  if (activePool) {
    await activePool.end();
    activePool = null;
  }
  customExecutor = null;
}
