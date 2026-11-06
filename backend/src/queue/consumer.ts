/**
 * CI Event Consumer — transport-agnostic, idempotent execution.
 *
 * Shared by:
 *   - the Vercel Queues push handler (`api/queue/consume.ts`)
 *   - the cron drain (`api/cron/queue-drain.ts`)
 *   - the local polling worker (`src/workers/index.ts`)
 *
 * Guarantees:
 *   - At-least-once delivery with business-level idempotency
 *     (`hopper_processed_events`), so a duplicate delivery cannot create a
 *     second diagnosis or a second PR comment.
 *   - A failed attempt releases its idempotency claim so the retry can proceed.
 *   - Deferred work (diagnosis lock held by a sibling matrix job) is rescheduled
 *     without consuming an attempt.
 */

import { getJobStore, QueuedJob } from './job-store.js';
import { claimProcessedEvent } from './coordination.js';
import { QueueMessageSchema, JobDiagnosticResult, QueueMessage } from './types.js';
import { releaseProcessedEvent } from './coordination.js';
import { processWorkflowJob, ProcessorDependencies } from '../workers/processors/workflow-job.processor.js';
import { getDatabaseExecutor } from '../db/client.js';

export interface ConsumeOptions {
  deps?: ProcessorDependencies;
  /** Called when a job must be retried (lock contention). */
  deferSeconds?: number;
}

export interface ConsumeOutcome {
  result: JobDiagnosticResult;
  duplicate: boolean;
  deferred: boolean;
}

/**
 * Execute one queue message. Never completes the DB job row itself — the caller
 * owns the job lifecycle so that transport acknowledgements stay explicit.
 */
export async function handleQueueMessage(
  rawMessage: unknown,
  options: ConsumeOptions = {}
): Promise<ConsumeOutcome> {
  // 1. Strict schema validation: a malformed payload is a poison message.
  const message: QueueMessage = QueueMessageSchema.parse(rawMessage) as QueueMessage;

  // 2. Business-level idempotency claim.
  const claimed = await claimProcessedEvent(message.idempotencyKey);
  if (!claimed) {
    return {
      result: { status: 'duplicate_ignored', reason: 'Event already handled' },
      duplicate: true,
      deferred: false,
    };
  }

  try {
    const result = await processWorkflowJob(message.payload, options.deps || {});

    if (result.status === 'deferred') {
      // Release the claim so the rescheduled attempt can run.
      await releaseProcessedEvent(message.idempotencyKey);
      return { result, duplicate: false, deferred: true };
    }

    return { result, duplicate: false, deferred: false };
  } catch (err) {
    // Release the claim so the retry is allowed to process this event.
    await releaseProcessedEvent(message.idempotencyKey).catch(() => undefined);
    throw err;
  }
}

/**
 * Claim and process a batch of durable jobs. Used by the cron drain and the
 * local worker; Vercel push deliveries bypass claiming.
 */
export async function drainQueue(options: {
  workerId: string;
  limit?: number;
  lockSeconds?: number;
  deps?: ProcessorDependencies;
}): Promise<{ claimed: number; completed: number; failed: number; deferred: number }> {
  const store = getJobStore();
  const jobs = await store.claim({
    workerId: options.workerId,
    limit: options.limit ?? 5,
    lockSeconds: options.lockSeconds ?? 240,
  });

  let completed = 0;
  let failed = 0;
  let deferred = 0;

  for (const job of jobs) {
    try {
      const outcome = await handleQueueMessage(
        {
          jobType: job.jobType,
          idempotencyKey: job.idempotencyKey,
          payload: job.payload,
          enqueuedAt: new Date().toISOString(),
          schemaVersion: 1,
          jobId: job.id,
        },
        { deps: options.deps }
      );

      if (outcome.deferred) {
        await store.retry(job.id, 5, outcome.result.reason || 'deferred: diagnosis lock held');
        deferred++;
        continue;
      }

      await store.complete(job.id, outcome.result);
      completed++;
    } catch (err: any) {
      await store.fail(job.id, { error: err?.message || String(err) });
      failed++;
    }
  }

  return { claimed: jobs.length, completed, failed, deferred };
}

/**
 * Process an explicit job id (used by the push handler after it has the durable
 * job row in hand).
 */
export async function processQueuedJob(
  job: QueuedJob,
  deps: ProcessorDependencies = {}
): Promise<ConsumeOutcome> {
  const store = getJobStore();
  const outcome = await handleQueueMessage(
    {
      jobType: job.jobType,
      idempotencyKey: job.idempotencyKey,
      payload: job.payload,
      enqueuedAt: new Date().toISOString(),
      schemaVersion: 1,
      jobId: job.id,
    },
    { deps }
  );

  if (outcome.deferred) {
    await store.retry(job.id, 5, outcome.result.reason || 'deferred: diagnosis lock held');
    return outcome;
  }

  await store.complete(job.id, outcome.result);
  return outcome;
}

/**
 * Queue + coordination health, surfaced by /api/health.
 */
export async function checkQueueHealth(): Promise<{
  isHealthy: boolean;
  backend: string;
  metrics?: Record<string, number>;
  deadLetters?: number;
  error?: string;
}> {
  try {
    const store = getJobStore();
    const metrics = await store.metrics();
    const deadLetters = await store.deadLetterCount();
    return {
      isHealthy: true,
      backend: process.env.QUEUE_STORE === 'memory' ? 'memory' : 'postgres',
      metrics: metrics as unknown as Record<string, number>,
      deadLetters,
    };
  } catch (err: any) {
    return { isHealthy: false, backend: 'postgres', error: err.message };
  }
}

export { getDatabaseExecutor };
