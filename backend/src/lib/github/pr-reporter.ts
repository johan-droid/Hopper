/**
 * Sticky GitHub PR Report Renderer & Paywall Conversion Hook.
 * Updates a single sticky comment per PR (using marker comment tag) so build failures never spam the PR conversation.
 */

import { DiagnosisOutput } from '../ai/diagnose.js';
import { PlanTier } from '../billing/quota-guard.js';

export const STICKY_COMMENT_MARKER = '<!-- ci-failure-diagnosis-sticky-marker -->';

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
  installationToken?: string;
  repoFullName: string;
  prNumber: number;
  markdownContent: string;
}

export interface StickyCommentResult {
  commentId: number;
  action: 'created' | 'updated';
}

/**
 * Searches for an existing sticky comment in the Pull Request thread.
 * Updates it in-place if found, or creates a new sticky comment if absent.
 */
export async function upsertPrStickyComment(
  options: UpsertStickyCommentOptions
): Promise<StickyCommentResult> {
  const { installationToken, repoFullName, prNumber, markdownContent } = options;

  // Mock / offline fallback
  if (!installationToken || installationToken.startsWith('ghs_mock')) {
    return {
      commentId: 100000000 + prNumber,
      action: 'created',
    };
  }

  const baseUrl = `https://api.github.com/repos/${repoFullName}`;
  const headers = {
    Authorization: `Bearer ${installationToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Hopper-CI-Doctor/1.0',
    'Content-Type': 'application/json',
  };

  try {
    // 1. Fetch comments on PR (paginated up to first 100)
    const listRes = await fetch(`${baseUrl}/issues/${prNumber}/comments?per_page=100`, {
      headers,
    });

    if (listRes.ok) {
      const comments = (await listRes.json()) as Array<{ id: number; body: string }>;
      const existingSticky = comments.find((c) => c.body && c.body.includes(STICKY_COMMENT_MARKER));

      // 2. If existing comment exists, update it in-place
      if (existingSticky) {
        const patchRes = await fetch(`${baseUrl}/issues/comments/${existingSticky.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ body: markdownContent }),
        });

        if (patchRes.ok) {
          return {
            commentId: existingSticky.id,
            action: 'updated',
          };
        }
      }
    }

    // 3. Create new sticky comment
    const postRes = await fetch(`${baseUrl}/issues/${prNumber}/comments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ body: markdownContent }),
    });

    if (postRes.ok) {
      const created = (await postRes.json()) as { id: number };
      return {
        commentId: created.id,
        action: 'created',
      };
    }

    return {
      commentId: 100000000 + prNumber,
      action: 'created',
    };
  } catch (err: any) {
    console.warn(`[PrReporter] Failed to upsert sticky PR comment: ${err.message}.`);
    return {
      commentId: 100000000 + prNumber,
      action: 'created',
    };
  }
}

export interface CreateCheckRunOptions {
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
}

/**
 * Creates or completes a GitHub Check Run with inline file annotations
 * and actionable root-cause diagnoses directly in the GitHub PR Checks UI.
 */
export async function createGitHubCheckRun(
  options: CreateCheckRunOptions
): Promise<CheckRunResult> {
  const {
    installationToken,
    repoFullName,
    commitSha,
    name = 'Hopper CI Diagnosis',
    diagnosis,
    flakinessScore,
  } = options;

  if (!installationToken || installationToken.startsWith('ghs_mock')) {
    return { checkRunId: 999900001, url: `https://github.com/${repoFullName}/runs/mock` };
  }

  const baseUrl = `https://api.github.com/repos/${repoFullName}`;
  const headers = {
    Authorization: `Bearer ${installationToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Hopper-CI-Doctor/1.0',
    'Content-Type': 'application/json',
  };

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
    const res = await fetch(`${baseUrl}/check-runs`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = (await res.json()) as { id: number; html_url?: string };
      return { checkRunId: data.id, url: data.html_url };
    }
  } catch (err: any) {
    console.warn(`[PrReporter] Failed to create GitHub Check Run: ${err.message}`);
  }

  return { checkRunId: 999900001 };
}

export interface TriggerRerunOptions {
  installationToken?: string;
  repoFullName: string;
  runId: number;
  flakinessScore: number;
  autoRetryPolicy?: boolean;
}

export interface TriggerRerunResult {
  triggered: boolean;
  reason: string;
}

/**
 * Triggers an automated rerun of failed jobs for confirmed flaky tests (>85% score)
 * when the tenant has enabled the auto_retry_policy.
 */
export async function triggerWorkflowRerun(
  options: TriggerRerunOptions
): Promise<TriggerRerunResult> {
  const {
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
    };
  }

  if (flakinessScore < 85) {
    return {
      triggered: false,
      reason: `Flakiness score (${flakinessScore}%) is below the automated rerun threshold (85%)`,
    };
  }

  if (!installationToken || installationToken.startsWith('ghs_mock')) {
    return {
      triggered: true,
      reason: 'Mock rerun triggered successfully',
    };
  }

  const url = `https://api.github.com/repos/${repoFullName}/actions/runs/${runId}/rerun-failed-jobs`;
  const headers = {
    Authorization: `Bearer ${installationToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Hopper-CI-Doctor/1.0',
  };

  try {
    const res = await fetch(url, { method: 'POST', headers });
    if (res.status === 201 || res.status === 200) {
      return {
        triggered: true,
        reason: `Successfully triggered rerun for flaky failure on run ${runId}`,
      };
    }
    return {
      triggered: false,
      reason: `GitHub API returned ${res.status}: ${await res.text()}`,
    };
  } catch (err: any) {
    return {
      triggered: false,
      reason: `Failed to trigger rerun: ${err.message}`,
    };
  }
}
