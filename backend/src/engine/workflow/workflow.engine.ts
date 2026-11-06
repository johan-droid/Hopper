/**
 * B6. Workflow Engine — Job Orchestration & Concurrency Control.
 * Responsibilities:
 * - Coordinates BullMQ job enqueueing and lifecycle events.
 * - Manages Redis matrix burst locking to deduplicate parallel runner evaluations.
 * - Requeues duplicate parallel failures with delayed backoff.
 * - Enforces explicit state transitions across workflow executions.
 */

import { Job, DelayedError } from 'bullmq';
import { enqueueWorkflowJob } from '../../queue/ci-queue.js';
import { acquireDiagnosisLock, releaseDiagnosisLock, DiagnosisLock } from '../../queue/redis.js';
import { WorkflowJobEventData } from '../../queue/types.js';

export class WorkflowEngine {
  /**
   * Enqueues a canonical CI event into the processing queue.
   */
  async enqueueEvent(eventData: WorkflowJobEventData): Promise<{ jobId: string }> {
    return enqueueWorkflowJob(eventData);
  }

  /**
   * Acquires a distributed burst lock for a failure signature hash.
   * If another worker is currently processing this signature, requeues the job with delay.
   */
  async acquireBurstLock(
    repoId: string,
    signatureHash: string,
    job?: Job<WorkflowJobEventData>,
    delayMs: number = 5000
  ): Promise<DiagnosisLock | null> {
    if (!job) return null;

    const lock = await acquireDiagnosisLock(repoId, signatureHash);
    if (!lock.acquired) {
      // Requeue job with delay so it can read the completed cached diagnosis from the other worker
      await job.moveToDelayed(Date.now() + delayMs, job.token);
      throw new DelayedError();
    }

    return lock;
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
