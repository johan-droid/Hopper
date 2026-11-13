/**
 * Sticky GitHub PR Report Renderer & Paywall Conversion Hook.
 * Updates a single sticky comment per PR (using marker comment tag) so build failures never spam the PR conversation.
 */

import { DiagnosisOutput } from '../ai/diagnose.js';
import { PlanTier } from '../billing/quota-guard.js';
import { defaultGitHubApiClient } from './api-client.js';
import { RequestPriority } from './rate-limiter.js';
import { getDatabaseExecutor, DatabaseExecutor } from '../../db/client.js';

export const STICKY_COMMENT_MARKER = '<!-- ci-failure-diagnosis-sticky-marker -->';

export type PublicationStatus = 'pending' | 'succeeded' | 'retryable_failure' | 'permanent_failure';

export async function recordPublicationAttempt(params: {
  reportId?: string;
  targetType: 'pr_comment' | 'check_run' | 'rerun';
  status: PublicationStatus;
  githubCommentId?: number;
  checkRunId?: number;
  errorMessage?: string;
  payload?: any;
  executor?: DatabaseExecutor;
}): Promise<void> {
  if (!params.reportId) return;
  try {
    const db = params.executor || getDatabaseExecutor();
    const query = `
      INSERT INTO github_publication_attempts (
        report_id, target_type, status, github_comment_id, check_run_id,
        attempt_count, error_message, payload, updated_at, last_attempted_at
      ) VALUES ($1, $2, $3, $4, $5, 1, $6, $7, NOW(), NOW())
      ON CONFLICT DO NOTHING;
    `;
    await db.query(query, [
      params.reportId,
      params.targetType,
      params.status,
      params.githubCommentId || null,
      params.checkRunId || null,
      params.errorMessage || null,
      JSON.stringify(params.payload || {}),
    ]);
  } catch {
    // Non-fatal if offline or DB mock
  }
}

export interface RenderReportParams {
  orgPlan: PlanTier;
  repoFullName: string;
  workflowName: string;
  jobName: string;
  stepName: string;
  commitSha: string;
  runUrl: string;
  dashboardReportUrl: string;
  billingUpgradeUrl: string;
  flakinessScore: number;
  historicalStats: {
    totalOccurrences: number;
    uniquePrsAffected: number;
    sameShaRetryPasses: number;
  };
  diagnosis: DiagnosisOutput;
}

export function renderGitHubPrComment(p: RenderReportParams): string {
  const shortSha = p.commitSha.slice(0, 7);
  const flakyBadge =
    p.flakinessScore >= 65
      ? `🟡 **Likely Flaky (${p.flakinessScore}% confidence)**`
      : p.flakinessScore >= 35
      ? `🟠 **Possible Intermittent (${p.flakinessScore}% confidence)**`
      : `🔴 **Deterministic Failure (${100 - p.flakinessScore}% confidence)**`;

  const logBlock = p.diagnosis.relevant_log_lines
    .map((l) => `L${l.line_number}: ${l.content}  # <-- ${l.explanation}`)
    .join('\n');

  // Paywall Hook: Free users see a teaser when cross-run patterns exist; Paid users see full insights
  let crossRunSection = '';
  if (p.orgPlan === 'free') {
    crossRunSection =
      p.historicalStats.totalOccurrences > 1
        ? `> 🔒 **Cross-Run Pattern Detected:** This exact error signature has failed **${p.historicalStats.totalOccurrences} times** across **${p.historicalStats.uniquePrsAffected} PRs** recently. [Unlock 30-day failure history, flaky test matrices & Slack alerts ($9/mo) →](${p.billingUpgradeUrl})`
        : `> 💡 *Tip: [Upgrade to Pro ($9/mo)](${p.billingUpgradeUrl}) to track cross-run failure history, auto-detect flaky tests across branches, and route alerts to Slack.*`;
  } else {
    crossRunSection = `> 📊 **Cross-Run History:** Seen **${p.historicalStats.totalOccurrences}x** across **${p.historicalStats.uniquePrsAffected} PRs** (${p.historicalStats.sameShaRetryPasses} same-SHA retry passes). [View full timeline & branch breakdown →](${p.dashboardReportUrl})`;
  }

  return `${STICKY_COMMENT_MARKER}
### ⚡ CI Failure Report — \`${p.jobName}\` (${p.stepName})

| Commit | Status / Flakiness | Failed Test / Target | CI Run |
| :--- | :--- | :--- | :--- |
| \`${shortSha}\` | ${flakyBadge} | \`${p.diagnosis.likely_flaky_test.test_name ?? p.stepName}\` | [View GitHub Log ↗](${p.runUrl}) |

#### 1. Root-Cause Clues
${p.diagnosis.root_cause_clues}

#### 2. Flaky Test Assessment
${p.diagnosis.likely_flaky_test.reasoning}

#### 3. Relevant Log Lines
\`\`\`text
${logBlock}
\`\`\`

#### 4. Suggested Next Check
* **Action:** ${p.diagnosis.suggested_next_check}
${p.diagnosis.local_repro_command ? `* **Run Locally:** \`${p.diagnosis.local_repro_command}\`` : ''}

---
${crossRunSection}
`;
}

export interface UpsertStickyCommentOptions {
  installationId?: number;
  reportId?: string;
  installationToken?: string;
  repoFullName: string;
  prNumber: number;
  markdownContent: string;
}

export interface StickyCommentResult {
  commentId: number;
  action: 'created' | 'updated';
  status: PublicationStatus;
  error?: string;
}

/**
 * Searches for an existing sticky comment in the Pull Request thread.
 * Updates it in-place if found, or creates a new sticky comment if absent.
 */
export async function upsertPrStickyComment(
  options: UpsertStickyCommentOptions
): Promise<StickyCommentResult> {
  const { installationId, reportId, installationToken, repoFullName, prNumber, markdownContent } = options;

  // Mock / offline fallback in development or test
  if (!installationToken || installationToken.startsWith('ghs_mock')) {
    const mockId = 100000000 + prNumber;
    await recordPublicationAttempt({
      reportId,
      targetType: 'pr_comment',
      status: 'succeeded',
      githubCommentId: mockId,
      payload: { repoFullName, prNumber },
    });
    return {
      commentId: mockId,
      action: 'created',
      status: 'succeeded',
    };
  }

  const baseUrl = `https://api.github.com/repos/${repoFullName}`;

  try {
    // 1. Fetch comments on PR (paginated up to first 100)
    const listRes = await defaultGitHubApiClient.request<Array<{ id: number; body: string }>>(
      `${baseUrl}/issues/${prNumber}/comments?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${installationToken}`,
        },
        installationId,
        resource: 'core',
        priority: RequestPriority.TIER_2_HIGH,
      }
    );

    const comments = listRes.data || [];
    const existingSticky = comments.find((c) => c.body && c.body.includes(STICKY_COMMENT_MARKER));

    // 2. If existing comment exists, update it in-place
    if (existingSticky) {
      await defaultGitHubApiClient.request(
        `${baseUrl}/issues/comments/${existingSticky.id}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${installationToken}`,
          },
          body: { body: markdownContent },
          installationId,
          resource: 'core',
          priority: RequestPriority.TIER_2_HIGH,
        }
      );

      await recordPublicationAttempt({
        reportId,
        targetType: 'pr_comment',
        status: 'succeeded',
        githubCommentId: existingSticky.id,
        payload: { repoFullName, prNumber, action: 'updated' },
      });

      return {
        commentId: existingSticky.id,
        action: 'updated',
        status: 'succeeded',
      };
    }

    // 3. Create new sticky comment
    const postRes = await defaultGitHubApiClient.request<{ id: number }>(
      `${baseUrl}/issues/${prNumber}/comments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${installationToken}`,
        },
        body: { body: markdownContent },
        installationId,
        resource: 'core',
        priority: RequestPriority.TIER_2_HIGH,
      }
    );

    const createdId = postRes.data.id;
    await recordPublicationAttempt({
      reportId,
      targetType: 'pr_comment',
      status: 'succeeded',
      githubCommentId: createdId,
      payload: { repoFullName, prNumber, action: 'created' },
    });

    return {
      commentId: createdId,
      action: 'created',
      status: 'succeeded',
    };
  } catch (err: any) {
    const isRetryable = err.isRetryable ?? false;
    const failureStatus: PublicationStatus = isRetryable ? 'retryable_failure' : 'permanent_failure';

    await recordPublicationAttempt({
      reportId,
      targetType: 'pr_comment',
      status: failureStatus,
      errorMessage: err.message,
      payload: { repoFullName, prNumber },
    });

    console.warn(`[PrReporter] Failed to upsert sticky PR comment: ${err.message}.`);
    return {
      commentId: 0,
      action: 'created',
      status: failureStatus,
      error: err.message,
    };
  }
}

export interface CreateCheckRunOptions {
  installationId?: number;
  reportId?: string;
  installationToken?: string;
  repoFullName: string;
  commitSha: string;
  name?: string;
  diagnosis: DiagnosisOutput;
  flakinessScore: number;
}

export interface CheckRunResult {
  checkRunId: number;
  url?: string;
  status: PublicationStatus;
  error?: string;
}

/**
 * Creates or completes a GitHub Check Run with inline file annotations
 * and actionable root-cause diagnoses directly in the GitHub PR Checks UI.
 */
export async function createGitHubCheckRun(
  options: CreateCheckRunOptions
): Promise<CheckRunResult> {
  const {
    installationId,
    reportId,
    installationToken,
    repoFullName,
    commitSha,
    name = 'Hopper CI Diagnosis',
    diagnosis,
    flakinessScore,
  } = options;

  if (!installationToken || installationToken.startsWith('ghs_mock')) {
    const mockId = 999900001;
    await recordPublicationAttempt({
      reportId,
      targetType: 'check_run',
      status: 'succeeded',
      checkRunId: mockId,
      payload: { repoFullName, commitSha },
    });
    return {
      checkRunId: mockId,
      url: `https://github.com/${repoFullName}/runs/mock`,
      status: 'succeeded',
    };
  }

  const baseUrl = `https://api.github.com/repos/${repoFullName}`;

  const annotations: Array<{
    path: string;
    start_line: number;
    end_line: number;
    annotation_level: 'notice' | 'warning' | 'failure';
    message: string;
    title: string;
    raw_details?: string;
  }> = [];

  for (const line of diagnosis.relevant_log_lines.slice(0, 10)) {
    const match = line.content.match(/([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+):(\d+)/);
    const path = match ? match[1] : (diagnosis.likely_flaky_test.test_name || 'CI');
    const lineNum = match ? parseInt(match[2], 10) : line.line_number;

    annotations.push({
      path,
      start_line: lineNum,
      end_line: lineNum,
      annotation_level: flakinessScore >= 65 ? 'warning' : 'failure',
      message: `${line.explanation} (Line: ${line.content.trim()})`,
      title: `Hopper: ${diagnosis.error_category}`,
      raw_details: diagnosis.suggested_next_check,
    });
  }

  const payload = {
    name,
    head_sha: commitSha,
    status: 'completed',
    conclusion: flakinessScore >= 80 ? 'neutral' : 'action_required',
    completed_at: new Date().toISOString(),
    output: {
      title: `CI Failure Diagnosis: ${diagnosis.error_category}`,
      summary: `**Root Cause Clues:**\n${diagnosis.root_cause_clues}\n\n**Flaky Assessment (${flakinessScore}%):**\n${diagnosis.likely_flaky_test.reasoning}\n\n**Suggested Action:**\n${diagnosis.suggested_next_check}`,
      annotations: annotations.slice(0, 50),
    },
  };

  try {
    const res = await defaultGitHubApiClient.request<{ id: number; html_url?: string }>(
      `${baseUrl}/check-runs`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${installationToken}`,
        },
        body: payload,
        installationId,
        resource: 'core',
        priority: RequestPriority.TIER_2_HIGH,
      }
    );

    const createdId = res.data.id;
    await recordPublicationAttempt({
      reportId,
      targetType: 'check_run',
      status: 'succeeded',
      checkRunId: createdId,
      payload: { repoFullName, commitSha },
    });

    return { checkRunId: createdId, url: res.data.html_url, status: 'succeeded' };
  } catch (err: any) {
    const isRetryable = err.isRetryable ?? false;
    const failureStatus: PublicationStatus = isRetryable ? 'retryable_failure' : 'permanent_failure';

    await recordPublicationAttempt({
      reportId,
      targetType: 'check_run',
      status: failureStatus,
      errorMessage: err.message,
      payload: { repoFullName, commitSha },
    });

    console.warn(`[PrReporter] Failed to create GitHub Check Run: ${err.message}`);
    return {
      checkRunId: 0,
      status: failureStatus,
      error: err.message,
    };
  }
}

export interface TriggerRerunOptions {
  installationId?: number;
  reportId?: string;
  installationToken?: string;
  repoFullName: string;
  runId: number;
  flakinessScore: number;
  autoRetryPolicy?: boolean;
}

export interface TriggerRerunResult {
  triggered: boolean;
  reason: string;
  status: PublicationStatus;
}

/**
 * Triggers an automated rerun of failed jobs for confirmed flaky tests (>85% score)
 * when the tenant has enabled the auto_retry_policy.
 */
export async function triggerWorkflowRerun(
  options: TriggerRerunOptions
): Promise<TriggerRerunResult> {
  const {
    installationId,
    reportId,
    installationToken,
    repoFullName,
    runId,
    flakinessScore,
    autoRetryPolicy = false,
  } = options;

  if (!autoRetryPolicy) {
    return {
      triggered: false,
      reason: 'Auto-retry policy is disabled for this organization/repository',
      status: 'permanent_failure',
    };
  }

  if (flakinessScore < 85) {
    return {
      triggered: false,
      reason: `Flakiness score (${flakinessScore}%) is below the automated rerun threshold (85%)`,
      status: 'permanent_failure',
    };
  }

  if (!installationToken || installationToken.startsWith('ghs_mock')) {
    await recordPublicationAttempt({
      reportId,
      targetType: 'rerun',
      status: 'succeeded',
      payload: { repoFullName, runId },
    });
    return {
      triggered: true,
      reason: 'Mock rerun triggered successfully',
      status: 'succeeded',
    };
  }

  const url = `https://api.github.com/repos/${repoFullName}/actions/runs/${runId}/rerun-failed-jobs`;

  try {
    const res = await defaultGitHubApiClient.request(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${installationToken}`,
      },
      installationId,
      resource: 'actions',
      priority: RequestPriority.TIER_3_MEDIUM,
    });

    await recordPublicationAttempt({
      reportId,
      targetType: 'rerun',
      status: 'succeeded',
      payload: { repoFullName, runId },
    });

    return {
      triggered: true,
      reason: `Successfully triggered rerun for flaky failure on run ${runId}`,
      status: 'succeeded',
    };
  } catch (err: any) {
    const isRetryable = err.isRetryable ?? false;
    const failureStatus: PublicationStatus = isRetryable ? 'retryable_failure' : 'permanent_failure';

    await recordPublicationAttempt({
      reportId,
      targetType: 'rerun',
      status: failureStatus,
      errorMessage: err.message,
      payload: { repoFullName, runId },
    });

    return {
      triggered: false,
      reason: `Failed to trigger rerun: ${err.message}`,
      status: failureStatus,
    };
  }
}
