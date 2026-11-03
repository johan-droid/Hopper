/**
 * Hopper Webhook Gateway & REST API Server.
 * Ingests GitHub Action webhooks, validates HMAC signatures, checks quotas,
 * and exposes health and dashboard endpoints.
 */

import express, { Request, Response } from 'express';
import { verifyGitHubWebhookSignature } from '../lib/github/app-auth.js';
import { sliceFailedStepLog } from '../lib/parser/log-slicer.js';
import { computeFailureSignature } from '../lib/parser/fingerprinter.js';
import { calculateFlakinessScore } from '../lib/moat/flakiness-engine.js';
import { synthesizeDiagnosis } from '../lib/ai/diagnose.js';
import { renderGitHubPrComment } from '../lib/github/pr-reporter.js';
import { checkQuota, PlanTier } from '../lib/billing/quota-guard.js';

export function createServer() {
  const app = express();

  // Capture raw body for HMAC verification
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  // Health check endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      service: 'Hopper CI Failure Diagnosis Engine',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  // GitHub Webhook Ingress
  app.post('/api/webhooks/github', async (req: Request, res: Response) => {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const eventName = req.headers['x-github-event'] as string | undefined;
    const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET || 'whsec_hopper_super_secret_signing_key_42';

    // Verify HMAC-SHA256 signature in <50ms
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const isValid = verifyGitHubWebhookSignature(rawBody, signature, webhookSecret);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid HMAC-SHA256 signature' });
    }

    const payload = req.body;

    // Check if this is a failure event we care about
    const isJobFailure = eventName === 'workflow_job' && payload.action === 'completed' && payload.workflow_job?.conclusion === 'failure';
    const isWorkflowFailure = eventName === 'workflow_run' && payload.action === 'completed' && payload.workflow_run?.conclusion === 'failure';

    if (!isJobFailure && !isWorkflowFailure) {
      return res.status(200).json({ status: 'ignored', reason: 'Not a failing CI completion event' });
    }

    // Tenant Quota Guard
    const plan: PlanTier = (payload.organization?.plan as PlanTier) || 'free';
    const runsUsed = payload.organization?.runs_used || 5;
    const quota = checkQuota(plan, runsUsed);

    if (!quota.allowed) {
      return res.status(402).json({
        status: 'quota_exceeded',
        notice: quota.exhaustionNotice,
      });
    }

    // Process diagnostic pipeline
    const jobName = payload.workflow_job?.name || payload.workflow_run?.name || 'test / build';
    const stepName = payload.workflow_job?.steps?.find((s: any) => s.conclusion === 'failure')?.name || 'Execute Test Suite';
    const rawLog = payload.mock_log || 'FAIL src/auth/jwt.spec.ts\n● Test failed\nProcess completed with exit code 1';
    const commitSha = payload.workflow_job?.head_sha || payload.workflow_run?.head_sha || 'abcdef1234567890abcdef1234567890abcdef12';

    // 1. Slice and scrub
    const sliced = sliceFailedStepLog(rawLog);

    // 2. Fingerprint
    const signatureObj = computeFailureSignature(jobName, stepName, sliced.detectedTestIdentifier, sliced.cleanedSnippet);

    // 3. Flakiness score
    const flakinessScore = calculateFlakinessScore({
      sameShaRetryPasses: 0,
      uniquePrsAffected: 1,
      totalOccurrences: 1,
      mainBranchOccurrences: 0,
      cleanedSnippet: sliced.cleanedSnippet,
    });

    // 4. Synthesize diagnosis
    const diagnosis = await synthesizeDiagnosis({
      workflowName: payload.workflow_run?.name || 'CI Pipeline',
      jobName,
      stepName,
      exitCode: sliced.detectedExitCode,
      commitSha,
      modifiedFiles: ['src/auth/jwt.ts', 'src/auth/jwt.spec.ts'],
      historicalStats: {
        totalOccurrences: 1,
        uniquePrsAffected: 1,
        sameShaRetryPasses: 0,
        computedFlakinessScore: flakinessScore,
      },
      slicedLogSnippet: sliced.cleanedSnippet,
    });

    // 5. Render Sticky PR Comment
    const prComment = renderGitHubPrComment({
      orgPlan: plan,
      repoFullName: payload.repository?.full_name || 'acme/service',
      workflowName: 'CI',
      jobName,
      stepName,
      commitSha,
      runUrl: payload.workflow_run?.html_url || 'https://github.com/acme/service/actions/runs/12345',
      dashboardReportUrl: `https://hopper.dev/reports/${signatureObj.signatureHash}`,
      billingUpgradeUrl: 'https://hopper.dev/billing',
      flakinessScore,
      historicalStats: {
        totalOccurrences: 1,
        uniquePrsAffected: 1,
        sameShaRetryPasses: 0,
      },
      diagnosis,
    });

    return res.status(200).json({
      status: 'diagnosed',
      signatureHash: signatureObj.signatureHash,
      flakinessScore,
      diagnosis,
      prComment,
    });
  });

  // Ad-hoc diagnostic endpoint for developer CLI or manual testing
  app.post('/api/diagnose/adhoc', async (req: Request, res: Response) => {
    const { rawLog, jobName = 'build', stepName = 'test', modifiedFiles = [] } = req.body;

    if (!rawLog || typeof rawLog !== 'string') {
      return res.status(400).json({ error: 'rawLog string is required' });
    }

    const sliced = sliceFailedStepLog(rawLog);
    const signature = computeFailureSignature(jobName, stepName, sliced.detectedTestIdentifier, sliced.cleanedSnippet);
    const flakinessScore = calculateFlakinessScore({
      sameShaRetryPasses: 0,
      uniquePrsAffected: 1,
      totalOccurrences: 1,
      mainBranchOccurrences: 0,
      cleanedSnippet: sliced.cleanedSnippet,
    });

    const diagnosis = await synthesizeDiagnosis({
      workflowName: 'Adhoc Diagnostic',
      jobName,
      stepName,
      exitCode: sliced.detectedExitCode,
      commitSha: '0000000000000000000000000000000000000000',
      modifiedFiles,
      historicalStats: {
        totalOccurrences: 1,
        uniquePrsAffected: 1,
        sameShaRetryPasses: 0,
        computedFlakinessScore: flakinessScore,
      },
      slicedLogSnippet: sliced.cleanedSnippet,
    });

    return res.json({
      signatureHash: signature.signatureHash,
      detectedFramework: sliced.detectedFramework,
      detectedExitCode: sliced.detectedExitCode,
      flakinessScore,
      diagnosis,
    });
  });

  // Dashboard endpoint
  app.get('/api/dashboard/:orgSlug', (req: Request, res: Response) => {
    const { orgSlug } = req.params;
    res.json({
      orgSlug,
      plan: 'pro_dev',
      monthlyRunsLimit: 250,
      runsUsedThisPeriod: 42,
      flakyTestLeaderboard: [
        {
          rank: 1,
          identifier: 'src/auth/jwt-verifier.spec.ts > should verify valid signed JWT token',
          flakinessScore: 92.5,
          occurrences30d: 14,
          sameShaRetryPasses: 4,
          lastSeen: new Date().toISOString(),
        },
        {
          rank: 2,
          identifier: 'tests/checkout.spec.ts › Checkout Flow › 3D Secure verification',
          flakinessScore: 78.0,
          occurrences30d: 9,
          sameShaRetryPasses: 2,
          lastSeen: new Date(Date.now() - 86400000).toISOString(),
        },
      ],
    });
  });

  return app;
}

// Start server if directly executed
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT || 3000;
  const app = createServer();
  app.listen(port, () => {
    console.log(`[Hopper] Webhook Gateway listening on port ${port}`);
  });
}
