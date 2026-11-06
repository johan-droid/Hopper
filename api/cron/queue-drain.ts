/**
 * Queue drain endpoint — safety net for the durable PostgreSQL job store.
 *
 * Responsibilities:
 *   - Reap jobs whose consuming function was killed mid-flight (expired locks).
 *   - Drain jobs whose Vercel Queue publish failed.
 *   - Prune expired coordination rows.
 *
 * Triggered by Vercel Cron. On the Hobby plan cron jobs run at most once per
 * day, which is why Vercel Queues push is the primary delivery path and this
 * endpoint is the backstop rather than the main consumer.
 *
 * Auth: `CRON_SECRET` bearer token (Vercel injects it on scheduled runs). When
 * CRON_SECRET is unset the endpoint refuses all traffic rather than running
 * unauthenticated.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { drainQueue } from '../../backend/src/queue/consumer.js';
import { getJobStore } from '../../backend/src/queue/job-store.js';
import { pruneCoordination } from '../../backend/src/queue/coordination.js';
import { closeDatabasePool } from '../../backend/src/db/client.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'CRON_SECRET is not configured' });
  }

  const authorization = req.headers.authorization || '';
  if (authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const store = getJobStore();
    const reaped = await store.reapExpired();
    const drained = await drainQueue({
      workerId: `cron-drain-${Date.now()}`,
      limit: Number(process.env.QUEUE_DRAIN_BATCH || 10),
      lockSeconds: 240,
    });
    const pruned = await pruneCoordination(24);
    const metrics = await store.metrics();
    const deadLetters = await store.deadLetterCount();

    return res.status(200).json({
      ok: true,
      reaped,
      ...drained,
      pruned,
      metrics,
      deadLetters,
    });
  } catch (err: any) {
    console.error(`[CronDrain] failed: ${err.message}`);
    return res.status(500).json({ error: 'Queue drain failed' });
  } finally {
    // The function instance is reused; the pool stays warm intentionally.
  }
}
