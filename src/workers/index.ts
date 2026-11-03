/**
 * BullMQ Worker Entrypoint & Lifecycle Manager.
 * Orchestrates background event consumer loops for Hopper.
 */

import { Worker, WorkerOptions } from 'bullmq';
import { CI_EVENTS_QUEUE_NAME } from '../queue/ci-queue.js';
import { getRedisClient } from '../queue/redis.js';
import { handleWorkflowJob } from './processors/workflow-job.processor.js';
import { WorkflowJobEventData } from '../queue/types.js';

let activeWorker: Worker<WorkflowJobEventData> | null = null;

export function createWorkflowJobWorker(concurrency = 5): Worker<WorkflowJobEventData> {
  const connection = getRedisClient();
  const options: WorkerOptions = {
    connection,
    concurrency,
  };

  const worker = new Worker<WorkflowJobEventData>(
    CI_EVENTS_QUEUE_NAME,
    async (job) => {
      return handleWorkflowJob(job);
    },
    options
  );

  worker.on('completed', (job, result) => {
    console.log(`[Worker] Job ${job.id} completed: ${result.status} (${result.signatureHash || result.reason || ''})`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[Worker] Fatal error in worker loop:', err.message);
  });

  return worker;
}

export function startWorkers(concurrency = 5): Worker<WorkflowJobEventData> {
  if (!activeWorker) {
    activeWorker = createWorkflowJobWorker(concurrency);
    console.log(`[Worker] Hopper CI Event Worker started on queue "${CI_EVENTS_QUEUE_NAME}" (concurrency: ${concurrency})`);
  }
  return activeWorker;
}

export async function stopWorkers(): Promise<void> {
  if (activeWorker) {
    await activeWorker.close();
    activeWorker = null;
    console.log('[Worker] Hopper CI Event Worker stopped.');
  }
}

export * from './processors/workflow-job.processor.js';
