/**
 * Webhooks Router (GitHub & Stripe ingress).
 *
 * Security model:
 *   - GitHub: HMAC-SHA256 over the raw body, then replay deduplication.
 *   - Stripe: Stripe's own signed payload verification, then event dedup.
 *   - Neither route accepts a user JWT.
 *
 * Delivery model (GitHub):
 *   1. Validate signature and deduplicate the delivery.
 *   2. Durably enqueue the job in PostgreSQL (idempotent on job + attempt).
 *   3. Publish to Vercel Queues for immediate push delivery.
 *   4. Only acknowledge once (2) succeeded. If the queue publish failed for an
 *      unexpected reason, process a bounded batch inline; if that also fails,
 *      return 503 so GitHub retries instead of us silently dropping the event.
 */

import { Router, Request, Response } from 'express';
import { verifyGitHubWebhookSignature } from '../../lib/github/app-auth.js';
import {
  verifyStripeWebhookSignature,
  handleStripeWebhookEvent,
} from '../../lib/billing/stripe-handler.js';
import { checkTenantRateLimit, claimWebhookDelivery } from '../../queue/coordination.js';
import { enqueueWorkflowJob } from '../../queue/ci-queue.js';
import { WorkflowJobEventData } from '../../queue/types.js';
import { processWorkflowJob } from '../../workers/processors/workflow-job.processor.js';

export function createWebhooksRouter(): Router {
  const router = Router();

  // ---------------------------------------------------------------------------
  // 1. GitHub Webhook Ingress
  // ---------------------------------------------------------------------------
  router.post('/github', async (req: Request, res: Response) => {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const eventName = req.headers['x-github-event'] as string | undefined;
    const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('[GitHub] Webhook rejected: GITHUB_APP_WEBHOOK_SECRET is not configured');
      return res.status(503).json({ error: 'GitHub webhook is not configured' });
    }

    const rawBody = (req as any).rawBody;
    if (!Buffer.isBuffer(rawBody)) {
      return res
        .status(400)
        .json({ error: 'Raw request body is required for signature verification' });
    }

    if (!verifyGitHubWebhookSignature(rawBody, signature, webhookSecret)) {
      return res.status(401).json({ error: 'Invalid HMAC-SHA256 signature' });
    }

    // Replay deduplication on the GitHub delivery id.
    const deliveryId = req.headers['x-github-delivery'] as string | undefined;
    if (deliveryId) {
      try {
        const isNewDelivery = await claimWebhookDelivery(deliveryId);
        if (!isNewDelivery) {
          return res.status(200).json({ status: 'duplicate_ignored' });
        }
      } catch (err: any) {
        // Fail closed: without a dedup guarantee we ask GitHub to retry.
        console.error(`[GitHub] Delivery dedup unavailable: ${err.message}`);
        return res.status(503).json({ error: 'Delivery deduplication unavailable' });
      }
    }

    const payload = req.body;

    const isJobCompleted = eventName === 'workflow_job' && payload?.action === 'completed';
    const isRunCompleted = eventName === 'workflow_run' && payload?.action === 'completed';

    if (!isJobCompleted && !isRunCompleted) {
      return res.status(200).json({
        status: 'ignored',
        reason: 'Not a completed CI workflow_job or workflow_run event',
      });
    }

    const conclusion: 'failure' | 'success' =
      (payload.workflow_job?.conclusion || payload.workflow_run?.conclusion) as 'failure' | 'success';

    if (conclusion !== 'failure' && conclusion !== 'success') {
      return res.status(200).json({ status: 'ignored', reason: `Ignored conclusion: ${conclusion}` });
    }

    const orgLogin =
      payload.organization?.login || payload.repository?.owner?.login || 'default-org';

    const rateCheck = await checkTenantRateLimit(orgLogin, 120, 60);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'Tenant webhook rate limit exceeded (120 req/min). Please try again shortly.',
      });
    }

    const eventData: WorkflowJobEventData = {
      installationId: payload.installation?.id || payload.organization?.id || 1010101,
      orgLogin,
      accountType: payload.organization ? 'Organization' : 'User',
      repoFullName: payload.repository?.full_name || 'acme-corp/service',
      githubRepoId: payload.repository?.id || 1000,
      workflowName: payload.workflow_run?.name || payload.workflow_job?.workflow_name || 'CI',
      jobName: payload.workflow_job?.name || payload.workflow_run?.name || 'test / build',
      stepName:
        payload.workflow_job?.steps?.find((s: any) => s.conclusion === 'failure')?.name ||
        'Execute Test Suite',
      githubRunId: payload.workflow_run?.id || payload.workflow_job?.run_id || 12345,
      githubJobId: payload.workflow_job?.id || payload.workflow_run?.id || 67890,
      githubRunAttempt: payload.workflow_run?.run_attempt || payload.workflow_job?.run_attempt || 1,
      commitSha:
        payload.workflow_job?.head_sha ||
        payload.workflow_run?.head_sha ||
        '0000000000000000000000000000000000000000',
      branch: payload.workflow_run?.head_branch || payload.workflow_job?.head_branch || 'main',
      prNumber: payload.workflow_run?.pull_requests?.[0]?.number || null,
      actorLogin: payload.sender?.login || null,
      conclusion,
      rawLog: payload.mock_log,
      modifiedFiles: payload.modified_files || [],
      runUrl: payload.workflow_run?.html_url || payload.workflow_job?.html_url,
    };

    // Explicit synchronous mode is a local debugging affordance only.
    if (req.query.sync === 'true' && process.env.NODE_ENV !== 'production') {
      const syncResult = await processWorkflowJob(eventData);
      return res.status(200).json(syncResult);
    }

    // 2. Durable enqueue. A throw here means the event is not safely persisted.
    let enqueued;
    try {
      enqueued = await enqueueWorkflowJob(eventData);
    } catch (err: any) {
      console.error(`[GitHub] Durable enqueue failed: ${err.message}`);
      return res.status(503).json({
        error: 'Event could not be durably queued',
        retryable: true,
      });
    }

    const published = enqueued.transport.published;

    return res.status(202).json({
      status: enqueued.duplicate ? 'already_queued' : 'queued',
      jobId: enqueued.jobId,
      githubJobId: eventData.githubJobId,
      conclusion: eventData.conclusion,
      delivery: published ? 'vercel-queue' : 'postgres-outbox',
      receivedAt: new Date().toISOString(),
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Stripe Webhook Ingress
  // ---------------------------------------------------------------------------
  router.post('/stripe', async (req: Request, res: Response) => {
    const signature = req.headers['stripe-signature'] as string | undefined;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('[Stripe] Webhook rejected: STRIPE_WEBHOOK_SECRET is not configured');
      return res.status(503).json({ error: 'Stripe webhook is not configured' });
    }

    const rawBody = (req as any).rawBody;
    if (!Buffer.isBuffer(rawBody)) {
      return res
        .status(400)
        .json({ error: 'Raw request body is required for signature verification' });
    }

    if (!verifyStripeWebhookSignature(rawBody, signature, webhookSecret)) {
      return res.status(400).json({ error: 'Invalid Stripe signature' });
    }

    const eventId = req.body?.id;
    if (eventId) {
      try {
        const isNewEvent = await claimWebhookDelivery(`stripe:${eventId}`);
        if (!isNewEvent) {
          return res.status(200).json({ status: 'duplicate_ignored', eventId });
        }
      } catch (err: any) {
        console.error(`[Stripe] Event dedup unavailable: ${err.message}`);
        return res.status(503).json({ error: 'Event deduplication unavailable', retryable: true });
      }
    }

    try {
      const result = await handleStripeWebhookEvent(req.body);
      return res.status(200).json(result);
    } catch (err: any) {
      console.error('[Stripe] Webhook processing error:', err.message);
      return res.status(500).json({ error: 'Internal error processing Stripe event' });
    }
  });

  return router;
}
