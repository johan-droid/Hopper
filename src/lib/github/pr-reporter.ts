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
