import { Router, Request, Response } from 'express';
import { drainQueue } from '../../queue/consumer.js';
import { getJobStore } from '../../queue/job-store.js';
import { pruneCoordination } from '../../queue/coordination.js';

export function createCronRouter(): Router {
  const router = Router();

  router.all('/queue-drain', async (req: Request, res: Response) => {
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
    }
  });

  return router;
}
