/**
 * B6. Workflow Engine — Job Orchestration & Concurrency Control.
 * Responsibilities:
 * - Enqueues canonical CI events into the durable job store / Vercel Queues.
 * - Coordinates PostgreSQL matrix-burst locking to deduplicate parallel runner
 *   evaluations of the same failure signature.
 * - Reports lock contention so the consumer can reschedule with backoff.
 */

import { enqueueWorkflowJob } from '../../queue/ci-queue.js';
import { acquireDiagnosisLock, releaseDiagnosisLock, DiagnosisLock } from '../../queue/coordination.js';
import { WorkflowJobEventData } from '../../queue/types.js';

export class WorkflowEngine {
  /**
   * Enqueues a canonical CI event into the processing queue.
   */
  async enqueueEvent(eventData: WorkflowJobEventData): Promise<{ jobId: string }> {
    const result = await enqueueWorkflowJob(eventData);
    return { jobId: result.jobId };
  }

  /**
   * Acquires a distributed burst lock for a failure signature hash.
   * Returns null when another consumer already holds it; the caller is
   * responsible for rescheduling (the consumer reschedules without burning an
   * attempt).
   */
  async acquireBurstLock(
    repoId: string,
    signatureHash: string,
    _job?: unknown,
    _delayMs: number = 5000
  ): Promise<DiagnosisLock | null> {
    const lock = await acquireDiagnosisLock(repoId, signatureHash);
    return lock.acquired ? lock : null;
  }

  /**
   * Releases an acquired burst lock.
   */
  async releaseBurstLock(lock: DiagnosisLock | null): Promise<void> {
    if (lock) {
      await releaseDiagnosisLock(lock.key, lock.token);
    }
  }
}
