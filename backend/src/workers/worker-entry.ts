/**
 * Hopper Dedicated Background Worker Entrypoint.
 * Consumes and processes asynchronous CI failure events from BullMQ Redis queue.
 */

import dotenv from 'dotenv';
dotenv.config();

import { startWorkers, stopWorkers } from './index.js';
import { closeCiQueue } from '../queue/ci-queue.js';
import { closeRedis } from '../queue/redis.js';
import { closeDatabasePool } from '../db/client.js';

const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);
console.log(`[Worker] Starting Hopper background event worker (concurrency: ${concurrency})...`);

const worker = startWorkers(concurrency);
console.log('[Worker] Background worker process ready and listening for CI events.');

let shuttingDown = false;

async function handleShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Worker] ${signal} signal received; initiating graceful shutdown...`);

  try {
    await stopWorkers();
    await closeCiQueue();
    await closeRedis();
    await closeDatabasePool();
    console.log('[Worker] Background worker shut down cleanly.');
    process.exit(0);
  } catch (err: any) {
    console.error('[Worker] Error during worker shutdown:', err.message);
    process.exit(1);
  }
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

