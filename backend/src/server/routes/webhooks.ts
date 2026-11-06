/**
 * Webhooks Router (GitHub & Stripe Ingress).
 * Provides fast ingress (<50ms) for CI workflow webhooks and billing lifecycle events.
 */

import { Router, Request, Response } from 'express';
import { verifyGitHubWebhookSignature } from '../../lib/github/app-auth.js';
import { verifyStripeWebhookSignature, handleStripeWebhookEvent } from '../../lib/billing/stripe-handler.js';
import { checkTenantRateLimit, claimWebhookDelivery } from '../../queue/redis.js';
import { enqueueWorkflowJob } from '../../queue/ci-queue.js';
import { processWorkflowJob } from '../../workers/processors/workflow-job.processor.js';
import { WorkflowJobEventData } from '../../queue/types.js';

export function createWebhooksRouter(): Router {
  const router = Router();

  // ---------------------------------------------------------------------------
  // 1. GitHub Webhook Ingress (Sub-50ms Response)
  // ---------------------------------------------------------------------------
  router.post('/github', async (req: Request, res: Response) => {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const eventName = req.headers['x-github-event'] as string | undefined;
    const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error('[GitHub] Webhook rejected: GITHUB_APP_WEBHOOK_SECRET is not configured');
      return res.status(503).json({ error: 'GitHub webhook is not configured' });
    }

    // 1. Verify HMAC-SHA256 signature in <10ms
    const rawBody = (req as any).rawBody;
    if (!Buffer.isBuffer(rawBody)) {
      return res.status(400).json({ error: 'Raw request body is required for signature verification' });
    }
    const isValid = verifyGitHubWebhookSignature(rawBody, signature, webhookSecret);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid HMAC-SHA256 signature' });
    }

    // 1.5. Webhook Replay Deduplication - use x-github-delivery header with a 24h TTL
    const deliveryId = req.headers['x-github-delivery'] as string | undefined;
    if (deliveryId) {
      const isNewDelivery = await claimWebhookDelivery(deliveryId);
      if (!isNewDelivery) {
        return res.status(200).json({ status: 'duplicate_ignored' });
      }
    }

    const payload = req.body;

    // 2. Filter for completed CI events
    const isJobCompleted = eventName === 'workflow_job' && payload.action === 'completed';
    const isRunCompleted = eventName === 'workflow_run' && payload.action === 'completed';

    if (!isJobCompleted && !isRunCompleted) {
      return res.status(200).json({
        status: 'ignored',
        reason: 'Not a completed CI workflow_job or workflow_run event',
      });
    }

    const conclusion: 'failure' | 'success' =
      (payload.workflow_job?.conclusion || payload.workflow_run?.conclusion) as 'failure' | 'success';

    if (conclusion !== 'failure' && conclusion !== 'success') {
      return res.status(200).json({
        status: 'ignored',
        reason: `Ignored conclusion: ${conclusion}`,
      });
    }

    // 3. Fast Tenant Rate Limit Check via Redis
    const orgLogin = payload.organization?.login || payload.repository?.owner?.login || 'default-org';
    const rateCheck = await checkTenantRateLimit(orgLogin, 120, 60);

    if (!rateCheck.allowed) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'Tenant webhook rate limit exceeded (120 req/min). Please try again shortly.',
      });
    }

    // 4. Construct Normalized Workflow Job Event Data
    const eventData: WorkflowJobEventData = {
      installationId: payload.installation?.id || payload.organization?.id || 1010101,
      orgLogin,
      accountType: payload.organization ? 'Organization' : 'User',
      repoFullName: payload.repository?.full_name || 'acme-corp/service',
      githubRepoId: payload.repository?.id || 1000,
      workflowName: payload.workflow_run?.name || payload.workflow_job?.workflow_name || 'CI',
      jobName: payload.workflow_job?.name || payload.workflow_run?.name || 'test / build',
      stepName:
        payload.workflow_job?.steps?.find((s: any) => s.conclusion === 'failure')?.name || 'Execute Test Suite',
      githubRunId: payload.workflow_run?.id || payload.workflow_job?.run_id || 12345,
      githubJobId: payload.workflow_job?.id || payload.workflow_run?.id || 67890,
      githubRunAttempt: payload.workflow_run?.run_attempt || payload.workflow_job?.run_attempt || 1,
      commitSha:
        payload.workflow_job?.head_sha || payload.workflow_run?.head_sha || '0000000000000000000000000000000000000000',
      branch: payload.workflow_run?.head_branch || payload.workflow_job?.head_branch || 'main',
      prNumber: payload.workflow_run?.pull_requests?.[0]?.number || null,
      actorLogin: payload.sender?.login || null,
      conclusion,
      rawLog: payload.mock_log,
      modifiedFiles: payload.modified_files || [],
      runUrl: payload.workflow_run?.html_url || payload.workflow_job?.html_url,
    };

    // 5. Synchronous execution fallback (for debugging/tests via ?sync=true)
    if (req.query.sync === 'true') {
      const syncResult = await processWorkflowJob(eventData);
      return res.status(200).json(syncResult);
    }

    // 6. Fast Async Queue Dispatch to BullMQ
    try {
      const { jobId } = await enqueueWorkflowJob(eventData);
      return res.status(202).json({
        status: 'queued',
        jobId,
        githubJobId: eventData.githubJobId,
        conclusion: eventData.conclusion,
        receivedAt: new Date().toISOString(),
      });
    } catch (_queueErr) {
      // Fallback: If Redis is offline in standalone dev mode, process synchronously
      const syncResult = await processWorkflowJob(eventData);
      return res.status(200).json(syncResult);
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Stripe Webhook Ingress (Subscription Lifecycle)
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
      return res.status(400).json({ error: 'Raw request body is required for signature verification' });
    }
    const isValid = verifyStripeWebhookSignature(rawBody, signature, webhookSecret);

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid Stripe signature' });
    }

    // Stripe Replay / Duplicate Event Deduplication via Redis (24h TTL)
    const eventId = req.body?.id;
    if (eventId) {
      const isNewEvent = await claimWebhookDelivery(`stripe:${eventId}`);
      if (!isNewEvent) {
        return res.status(200).json({ status: 'duplicate_ignored', eventId });
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

