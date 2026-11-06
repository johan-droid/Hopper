/**
 * Hopper Local Background Worker Entrypoint.
 *
 * Drains the durable PostgreSQL job queue (the same table used in production).
 * No Redis or BullMQ connection is required.
 *
 * Usage:
 *   npm run worker            # long-running polling worker
 *   npm run worker -- --once  # drain one batch and exit
 */

import dotenv from 'dotenv';
dotenv.config();

import { startWorkers, stopWorkers, runWorkerOnce } from './index.js';
import { closeDatabasePool } from '../db/client.js';

const concurrency = parseInt(process.env.WORKER_CONCURRENCY || '3', 10);
const once = process.argv.includes('--once');

async function main() {
  if (once) {
    const result = await runWorkerOnce({ concurrency });
    console.log(`[Worker] one-shot drain complete: ${JSON.stringify(result)}`);
    await closeDatabasePool();
    return;
  }

  console.log(`[Worker] Starting Hopper durable queue worker (concurrency: ${concurrency})...`);
  startWorkers({ concurrency });

  let shuttingDown = false;

  const handleShutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Worker] ${signal} received; shutting down...`);
    try {
      await stopWorkers();
      await closeDatabasePool();
      console.log('[Worker] Background worker shut down cleanly.');
      process.exit(0);
    } catch (err: any) {
      console.error('[Worker] Error during shutdown:', err.message);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void handleShutdown('SIGINT'));
  process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
}

main().catch(async (err) => {
  console.error('[Worker] Fatal error:', err.message);
  await closeDatabasePool().catch(() => undefined);
  process.exit(1);
});
