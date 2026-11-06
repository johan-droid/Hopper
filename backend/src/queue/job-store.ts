/**
 * Durable Job Store — PostgreSQL-backed queue state machine.
 *
 * This is the durable system of record for asynchronous CI work and replaces
 * BullMQ + Redis. Semantics:
 *   - At-least-once delivery, enforced by `hopper_claim_jobs` (FOR UPDATE SKIP LOCKED).
 *   - Explicit attempt accounting with exponential backoff.
 *   - Terminal failures move to `hopper_job_dead_letters` (Vercel Queues has no DLQ).
 *   - Expired consumer locks are reaped back into the queue, so a crashed
 *     Vercel Function cannot lose a GitHub event.
 *
 * An in-memory implementation exists strictly for unit tests and local
 * development, and is refused in production.
 */

import { DatabaseExecutor, getDatabaseExecutor } from '../db/client.js';
import {
  CI_EVENTS_QUEUE_NAME,
  QueueMessage,
  WorkflowJobEventData,
  buildWorkflowJobIdempotencyKey,
} from './types.js';

export interface QueuedJob {
  id: string;
  queueName: string;
  jobType: string;
  idempotencyKey: string;
  payload: WorkflowJobEventData;
  attempts: number;
  maxAttempts: number;
  orgLogin?: string | null;
  repoFullName?: string | null;
}

export interface EnqueueInput {
  payload: WorkflowJobEventData;
  idempotencyKey?: string;
  queueName?: string;
  jobType?: 'process-workflow-job';
  maxAttempts?: number;
}

export interface EnqueueResult {
  id: string;
  idempotencyKey: string;
  duplicate: boolean;
}

export interface ClaimOptions {
  workerId: string;
  queueName?: string;
  limit?: number;
  lockSeconds?: number;
}

export interface QueueMetrics {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  dead: number;
}

export interface FailOptions {
  error: string;
  /** Explicit delay override (retry/backoff). */
  delaySeconds?: number;
  maxAttempts?: number;
}

export interface JobStore {
  enqueue(input: EnqueueInput): Promise<EnqueueResult>;
  claim(options: ClaimOptions): Promise<QueuedJob[]>;
  complete(id: string, result: unknown): Promise<void>;
  fail(id: string, options: FailOptions): Promise<{ dead: boolean; attempts: number }>;
  retry(id: string, delaySeconds: number, reason: string): Promise<void>;
  reapExpired(): Promise<number>;
  metrics(): Promise<QueueMetrics>;
  deadLetterCount(): Promise<number>;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const BASE_BACKOFF_SECONDS = 5;
const MAX_BACKOFF_SECONDS = 900;

export function computeBackoffSeconds(attempts: number): number {
  const exponential = BASE_BACKOFF_SECONDS * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(exponential, MAX_BACKOFF_SECONDS);
}

/**
 * PostgreSQL implementation. All multi-row transitions happen inside the
 * database so two concurrent consumers can never claim the same job.
 */
export class PostgresJobStore implements JobStore {
  constructor(private readonly executor?: DatabaseExecutor) {}

  private get db(): DatabaseExecutor {
    return this.executor || getDatabaseExecutor();
  }

  async enqueue(input: EnqueueInput): Promise<EnqueueResult> {
    const queueName = input.queueName || CI_EVENTS_QUEUE_NAME;
    const idempotencyKey =
      input.idempotencyKey || buildWorkflowJobIdempotencyKey(input.payload);
    const jobType = input.jobType || 'process-workflow-job';
    const maxAttempts = input.maxAttempts || DEFAULT_MAX_ATTEMPTS;

    const inserted = await this.db.query<{ id: string }>(
      `INSERT INTO hopper_job_queue
         (queue_name, job_type, idempotency_key, payload, max_attempts, org_login, repo_full_name)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
       ON CONFLICT (queue_name, idempotency_key) DO NOTHING
       RETURNING id`,
      [
        queueName,
        jobType,
        idempotencyKey,
        JSON.stringify(input.payload),
        maxAttempts,
        input.payload.orgLogin,
        input.payload.repoFullName,
      ]
    );

    if (inserted.rows[0]?.id) {
      return { id: inserted.rows[0].id, idempotencyKey, duplicate: false };
    }

    const existing = await this.db.query<{ id: string }>(
      `SELECT id FROM hopper_job_queue WHERE queue_name = $1 AND idempotency_key = $2`,
      [queueName, idempotencyKey]
    );

    if (!existing.rows[0]?.id) {
      throw new Error(`Failed to enqueue job ${idempotencyKey}: conflicting row disappeared`);
    }

    return { id: existing.rows[0].id, idempotencyKey, duplicate: true };
  }

  async claim(options: ClaimOptions): Promise<QueuedJob[]> {
    const queueName = options.queueName || CI_EVENTS_QUEUE_NAME;
    const limit = options.limit ?? 5;
    const lockSeconds = options.lockSeconds ?? 240;

    const res = await this.db.query<any>(
      `SELECT * FROM hopper_claim_jobs($1, $2, $3, $4)`,
      [queueName, limit, options.workerId, lockSeconds]
    );

    return res.rows.map((row) => this.mapRow(row));
  }

  async complete(id: string, result: unknown): Promise<void> {
    await this.db.query(
      `UPDATE hopper_job_queue
       SET status = 'completed',
           result = $2::jsonb,
           completed_at = NOW(),
           updated_at = NOW(),
           locked_at = NULL,
           locked_by = NULL,
           lock_expires_at = NULL
       WHERE id = $1`,
      [id, JSON.stringify(result ?? {})]
    );
  }

  async fail(id: string, options: FailOptions): Promise<{ dead: boolean; attempts: number }> {
    const res = await this.db.query<any>(
      `SELECT attempts, max_attempts, queue_name, job_type, idempotency_key,
              payload, org_login, repo_full_name
       FROM hopper_job_queue WHERE id = $1`,
      [id]
    );

    const row = res.rows[0];
    if (!row) {
      return { dead: false, attempts: 0 };
    }

    const attempts = Number(row.attempts);
    const maxAttempts = options.maxAttempts ?? Number(row.max_attempts) ?? DEFAULT_MAX_ATTEMPTS;
    const isDead = attempts >= maxAttempts;
    const delaySeconds =
      options.delaySeconds ?? computeBackoffSeconds(attempts);

    if (options.delaySeconds !== undefined && attempts >= maxAttempts) {
      // Explicit retry requests still respect the attempt ceiling.
    }

    await this.db.query(
      `UPDATE hopper_job_queue
       SET status = CASE WHEN $2 THEN 'dead' ELSE 'failed' END,
           last_error = $3,
           available_at = NOW() + make_interval(secs => $4),
           updated_at = NOW(),
           locked_at = NULL,
           locked_by = NULL,
           lock_expires_at = NULL
       WHERE id = $1`,
      [id, isDead, options.error.slice(0, 4000), Math.max(0, delaySeconds)]
    );

    if (isDead) {
      await this.db.query(
        `INSERT INTO hopper_job_dead_letters
           (job_id, queue_name, job_type, idempotency_key, payload,
            org_login, repo_full_name, attempts, last_error)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)`,
        [
          id,
          row.queue_name,
          row.job_type,
          row.idempotency_key,
          JSON.stringify(row.payload),
          row.org_login,
          row.repo_full_name,
          attempts,
          options.error.slice(0, 4000),
        ]
      );
    }

    return { dead: isDead, attempts };
  }

  /**
   * Schedule a retry without counting it as a failure (used when a diagnosis
   * lock is held by a sibling matrix job).
   */
  async retry(id: string, delaySeconds: number, reason: string): Promise<void> {
    await this.db.query(
      `UPDATE hopper_job_queue
       SET status = 'failed',
           attempts = GREATEST(attempts - 1, 0),
           last_error = $2,
           available_at = NOW() + make_interval(secs => $3),
           updated_at = NOW(),
           locked_at = NULL,
           locked_by = NULL,
           lock_expires_at = NULL
       WHERE id = $1`,
      [id, reason.slice(0, 4000), Math.max(0, delaySeconds)]
    );
  }

  async reapExpired(): Promise<number> {
    const res = await this.db.query<{ hopper_reap_expired_job_locks: number }>(
      `SELECT hopper_reap_expired_job_locks(200) AS hopper_reap_expired_job_locks`
    );
    return Number(res.rows[0]?.hopper_reap_expired_job_locks ?? 0);
  }

  async metrics(): Promise<QueueMetrics> {
    const res = await this.db.query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM hopper_job_queue GROUP BY status`
    );
    const metrics: QueueMetrics = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      dead: 0,
    };
    for (const row of res.rows) {
      if (row.status in metrics) {
        metrics[row.status as keyof QueueMetrics] = parseInt(row.count, 10);
      }
    }
    return metrics;
  }

  async deadLetterCount(): Promise<number> {
    const res = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM hopper_job_dead_letters`
    );
    return parseInt(res.rows[0]?.count || '0', 10);
  }

  private mapRow(row: any): QueuedJob {
    return {
      id: row.id,
      queueName: row.queue_name,
      jobType: row.job_type,
      idempotencyKey: row.idempotency_key,
      payload: row.payload as WorkflowJobEventData,
      attempts: Number(row.attempts),
      maxAttempts: Number(row.max_attempts),
      orgLogin: row.org_login,
      repoFullName: row.repo_full_name,
    };
  }
}

interface MemoryJob extends QueuedJob {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead';
  availableAt: number;
  lockExpiresAt?: number;
  lastError?: string;
  result?: unknown;
}

/**
 * In-memory job store. Development and unit tests only — never selected in
 * production (see `getJobStore`).
 */
export class InMemoryJobStore implements JobStore {
  private jobs = new Map<string, MemoryJob>();
  private sequence = 0;

  async enqueue(input: EnqueueInput): Promise<EnqueueResult> {
    const idempotencyKey =
      input.idempotencyKey || buildWorkflowJobIdempotencyKey(input.payload);

    for (const job of this.jobs.values()) {
      if (job.idempotencyKey === idempotencyKey) {
        return { id: job.id, idempotencyKey, duplicate: true };
      }
    }

    const id = `job_${++this.sequence}_${Date.now()}`;
    this.jobs.set(id, {
      id,
      queueName: input.queueName || CI_EVENTS_QUEUE_NAME,
      jobType: input.jobType || 'process-workflow-job',
      idempotencyKey,
      payload: input.payload,
      attempts: 0,
      maxAttempts: input.maxAttempts || DEFAULT_MAX_ATTEMPTS,
      orgLogin: input.payload.orgLogin,
      repoFullName: input.payload.repoFullName,
      status: 'pending',
      availableAt: Date.now(),
    });

    return { id, idempotencyKey, duplicate: false };
  }

  async claim(options: ClaimOptions): Promise<QueuedJob[]> {
    const now = Date.now();
    const queueName = options.queueName || CI_EVENTS_QUEUE_NAME;
    const claimed: QueuedJob[] = [];

    for (const job of this.jobs.values()) {
      if (claimed.length >= (options.limit ?? 5)) break;
      if (job.queueName !== queueName) continue;
      if (job.status !== 'pending' && job.status !== 'failed') continue;
      if (job.availableAt > now) continue;
      if (job.attempts >= job.maxAttempts) continue;

      job.status = 'processing';
      job.attempts += 1;
      job.lockExpiresAt = now + (options.lockSeconds ?? 240) * 1000;
      claimed.push({ ...job });
    }

    return claimed;
  }

  async complete(id: string, result: unknown): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = 'completed';
    job.result = result;
    job.lockExpiresAt = undefined;
  }

  async fail(id: string, options: FailOptions): Promise<{ dead: boolean; attempts: number }> {
    const job = this.jobs.get(id);
    if (!job) return { dead: false, attempts: 0 };

    const dead = job.attempts >= (options.maxAttempts ?? job.maxAttempts);
    job.status = dead ? 'dead' : 'failed';
    job.lastError = options.error;
    job.availableAt = Date.now() + (options.delaySeconds ?? computeBackoffSeconds(job.attempts)) * 1000;
    job.lockExpiresAt = undefined;
    return { dead, attempts: job.attempts };
  }

  async retry(id: string, delaySeconds: number, reason: string): Promise<void> {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = 'failed';
    job.attempts = Math.max(0, job.attempts - 1);
    job.lastError = reason;
    job.availableAt = Date.now() + delaySeconds * 1000;
    job.lockExpiresAt = undefined;
  }

  async reapExpired(): Promise<number> {
    const now = Date.now();
    let reaped = 0;
    for (const job of this.jobs.values()) {
      if (job.status !== 'processing' || !job.lockExpiresAt) continue;
      if (job.lockExpiresAt >= now) continue;
      job.status = job.attempts >= job.maxAttempts ? 'dead' : 'failed';
      job.availableAt = now;
      job.lockExpiresAt = undefined;
      reaped++;
    }
    return reaped;
  }

  async metrics(): Promise<QueueMetrics> {
    const metrics: QueueMetrics = { pending: 0, processing: 0, completed: 0, failed: 0, dead: 0 };
    for (const job of this.jobs.values()) {
      metrics[job.status] += 1;
    }
    return metrics;
  }

  async deadLetterCount(): Promise<number> {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.status === 'dead') count++;
    }
    return count;
  }

  reset(): void {
    this.jobs.clear();
    this.sequence = 0;
  }
}

let activeStore: JobStore | null = null;
let explicitMemory = false;

/**
 * Resolve the configured job store.
 *
 * `QUEUE_STORE=memory` is honoured only outside production; a production
 * deployment can never silently fall back to volatile in-process state.
 */
export function getJobStore(): JobStore {
  if (activeStore) return activeStore;

  const requested = (process.env.QUEUE_STORE || '').toLowerCase();
  const isProduction = process.env.NODE_ENV === 'production';

  if (requested === 'memory') {
    if (isProduction) {
      throw new Error(
        'QUEUE_STORE=memory is forbidden in production: the durable queue requires PostgreSQL'
      );
    }
    explicitMemory = true;
    activeStore = new InMemoryJobStore();
    return activeStore;
  }

  if (isProduction && !process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for the durable job queue in production');
  }

  activeStore = new PostgresJobStore();
  return activeStore;
}

/** Test seam: inject an isolated store. */
export function setJobStore(store: JobStore | null): void {
  activeStore = store;
  if (!store) explicitMemory = false;
}

export function isMemoryJobStore(): boolean {
  return explicitMemory || activeStore instanceof InMemoryJobStore;
}

export function buildQueueMessage(payload: WorkflowJobEventData, idempotencyKey: string): QueueMessage {
  return {
    jobType: 'process-workflow-job',
    idempotencyKey,
    payload,
    enqueuedAt: new Date().toISOString(),
    schemaVersion: 1,
  };
}
