/**
 * B1. Ingestion Engine — Webhook & Event Ingress.
 * Responsibilities:
 * - Validate webhook signatures (HMAC-SHA256).
 * - Enforce idempotency and replay protection via Redis delivery claims.
 * - Enforce tenant-level token bucket rate limits.
 * - Convert external payloads into canonical internal events.
 * - Detect malformed or unsupported event types.
 */

import { verifyGitHubWebhookSignature } from '../../lib/github/app-auth.js';
import { claimWebhookDelivery, checkTenantRateLimit } from '../../queue/redis.js';
import { CanonicalCIEvent } from '../types.js';

export interface IngestionValidationResult {
  valid: boolean;
  statusCode: number;
  error?: string;
  isDuplicate?: boolean;
  canonicalEvent?: CanonicalCIEvent;
}

export class IngestionEngine {
  constructor(private webhookSecret: string = process.env.GITHUB_APP_WEBHOOK_SECRET || '') {}

  /**
   * Verifies and ingests a GitHub Actions workflow_job event.
   */
  async ingestGitHubWebhook(params: {
    rawBody: Buffer | string;
    signatureHeader?: string;
    deliveryId?: string;
    githubEventHeader?: string;
    payload: any;
  }): Promise<IngestionValidationResult> {
    const { rawBody, signatureHeader, deliveryId, githubEventHeader, payload } = params;

    // 1. Verify Event Type
    if (githubEventHeader && githubEventHeader !== 'workflow_job') {
      return {
        valid: false,
        statusCode: 200,
        error: `Ignored unhandled GitHub event: ${githubEventHeader}`,
      };
    }

    // 2. Validate HMAC Signature
    if (!this.webhookSecret) {
      return {
        valid: false,
        statusCode: 500,
        error: 'GITHUB_APP_WEBHOOK_SECRET is not configured',
      };
    }

    const isValidSig = verifyGitHubWebhookSignature(rawBody, signatureHeader, this.webhookSecret);
    if (!isValidSig) {
      return {
        valid: false,
        statusCode: 401,
        error: 'Invalid webhook signature',
      };
    }

    // 3. Replay Protection & Deduplication
    if (deliveryId) {
      const isNew = await claimWebhookDelivery(deliveryId);
      if (!isNew) {
        return {
          valid: true,
          statusCode: 200,
          isDuplicate: true,
          error: `Duplicate delivery ignored: ${deliveryId}`,
        };
      }
    }

    // 4. Validate Essential Payload Properties
    const workflowJob = payload?.workflow_job;
    const orgLogin = payload?.repository?.owner?.login || payload?.organization?.login || 'unknown';

    if (!workflowJob) {
      return {
        valid: false,
        statusCode: 400,
        error: 'Malformed payload: missing workflow_job object',
      };
    }

    // 5. Tenant Token-Bucket Rate Limiter
    const rateLimit = await checkTenantRateLimit(orgLogin);
    if (!rateLimit.allowed) {
      return {
        valid: false,
        statusCode: 429,
        error: `Tenant rate limit exceeded for ${orgLogin}. Remaining: ${rateLimit.remaining}`,
      };
    }

    // 6. Normalize into Canonical Internal Event
    const canonicalEvent: CanonicalCIEvent = {
      eventId: deliveryId || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      source: 'github',
      installationId: payload.installation?.id || 0,
      orgLogin,
      accountType: payload.repository?.owner?.type || 'User',
      githubRepoId: payload.repository?.id || 0,
      repoFullName: payload.repository?.full_name || `${orgLogin}/unknown`,
      githubRunId: workflowJob.run_id || 0,
      githubJobId: workflowJob.id || 0,
      githubRunAttempt: workflowJob.run_attempt || 1,
      workflowName: workflowJob.workflow_name || 'Workflow',
      jobName: workflowJob.name || 'Job',
      stepName: workflowJob.steps?.find((s: any) => s.conclusion === 'failure')?.name || workflowJob.name || 'test',
      conclusion: workflowJob.conclusion === 'failure' ? 'failure' : 'success',
      commitSha: workflowJob.head_sha || 'head',
      branch: workflowJob.head_branch || 'main',
      prNumber: workflowJob.pull_requests?.[0]?.number,
      actorLogin: payload.sender?.login,
      runUrl: workflowJob.html_url,
      timestamp: new Date().toISOString(),
    };

    return {
      valid: true,
      statusCode: 202,
      canonicalEvent,
    };
  }
}
