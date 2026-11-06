/**
 * Local Queue Worker Adapter.
 *
 * The deployed application does not require a long-running worker: Vercel
 * Queues pushes messages to `api/queue/consume.ts` and `api/cron/queue-drain.ts`
 * picks up anything left behind.
 *
 * This polling worker exists so `npm run dev` and `npm run start:local` can
 * process jobs against the same durable PostgreSQL job store without Redis.
 */

import { getJobStore } from '../queue/job-store.js';
import { drainQueue } from '../queue/consumer.js';
import { pruneCoordination } from '../queue/coordination.js';

let timer: NodeJS.Timeout | null = null;
let running = false;
let stopped = true;

export interface WorkerLoopOptions {
  concurrency?: number;
  pollIntervalMs?: number;
  workerId?: string;
}

/**
 * Process one batch. Exposed for tests and for `npm run worker -- --once`.
 */
export async function runWorkerOnce(options: WorkerLoopOptions = {}) {
  const workerId = options.workerId || `local-worker-${process.pid}`;
  const store = getJobStore();
  await store.reapExpired();

  return drainQueue({
    workerId,
    limit: options.concurrency ?? 3,
    lockSeconds: 240,
  });
}

export function startWorkers(options: WorkerLoopOptions = {}): void {
  if (running) return;

  running = true;
  stopped = false;

  const pollIntervalMs = options.pollIntervalMs ?? 1000;
  const workerId = options.workerId || `local-worker-${process.pid}`;
  let maintenanceTick = 0;

  const tick = async () => {
    if (!running) return;
    try {
      const result = await runWorkerOnce({ ...options, workerId });
      if (result.claimed > 0) {
        console.log(
          `[Worker] claimed=${result.claimed} completed=${result.completed} failed=${result.failed} deferred=${result.deferred}`
        );
      }

      // Periodic housekeeping: prune expired coordination rows.
      maintenanceTick++;
      if (maintenanceTick % 60 === 0) {
        const pruned = await pruneCoordination(24);
        if (pruned > 0) console.log(`[Worker] pruned ${pruned} expired coordination rows`);
      }
    } catch (err: any) {
      console.error(`[Worker] poll cycle failed: ${err.message}`);
    }
  };

  timer = setInterval(() => {
    void tick();
  }, pollIntervalMs);

  console.log(
    `[Worker] Local durable queue worker started (interval: ${pollIntervalMs}ms, concurrency: ${options.concurrency ?? 3})`
  );
  void tick();
}

export async function stopWorkers(): Promise<void> {
  running = false;
  stopped = true;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  console.log('[Worker] Local queue worker stopped.');
}

export function isWorkerRunning(): boolean {
  return running;
}

export function isWorkerStopped(): boolean {
  return stopped;
}

export * from './processors/workflow-job.processor.js';
