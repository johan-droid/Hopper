/**
 * BullMQ CI Events Queue Producer.
 * Enqueues GitHub Action failure and success events for background processing.
 */

import { Queue, QueueOptions } from 'bullmq';
import { getRedisUrl, getRedisClient } from './redis.js';
import { WorkflowJobEventData } from './types.js';

export const CI_EVENTS_QUEUE_NAME = 'ci-events';

let activeQueue: Queue<WorkflowJobEventData> | null = null;
let customQueue: any = null;

export function setCustomQueue(queue: any): void {
  customQueue = queue;
}

export function createCiQueue(): Queue<WorkflowJobEventData> {
  const connection = getRedisClient();
  const queueOptions: QueueOptions = {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  };

  return new Queue<WorkflowJobEventData>(CI_EVENTS_QUEUE_NAME, queueOptions);
}

export function getCiQueue(): Queue<WorkflowJobEventData> {
  if (customQueue) {
    return customQueue;
  }
  if (!activeQueue) {
    activeQueue = createCiQueue();
  }
  return activeQueue;
}

/**
 * Enqueue a GitHub Action job event for asynchronous diagnosis.
 * Uses a deterministic job ID (github_job_id + attempt) for deduplication.
 */
export async function enqueueWorkflowJob(
  event: WorkflowJobEventData
): Promise<{ jobId: string }> {
  const queue = getCiQueue();
  const deterministicJobId = `job:${event.githubJobId}:${event.githubRunAttempt}`;

  const job = await queue.add('process-workflow-job', event, {
    jobId: deterministicJobId,
  });

  return { jobId: job.id || deterministicJobId };
}

export async function closeCiQueue(): Promise<void> {
  if (activeQueue) {
    await activeQueue.close();
    activeQueue = null;
  }
  customQueue = null;
}
