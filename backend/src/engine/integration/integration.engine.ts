/**
 * B7. Integration Engine — External CI/CD & Notification Adapters.
 * Responsibilities:
 * - Manages GitHub App installation token generation and API client requests.
 * - Streams raw logs from GitHub Actions API or test fixtures.
 * - Retrieves modified commit files for context correlation.
 * - Renders and upserts sticky markdown comments to GitHub Pull Requests.
 * - Dispatches Slack / Discord notifications.
 */

import { getInstallationToken } from '../../lib/github/app-auth.js';
import { fetchJobLogStream, fetchCommitModifiedFiles, SAMPLE_RAW_LOGS } from '../../lib/github/log-fetcher.js';
import { renderGitHubPrComment, upsertPrStickyComment } from '../../lib/github/pr-reporter.js';
import { DiagnosisOutput } from '../../lib/ai/diagnose.js';
import { PlanTier } from '../../lib/billing/quota-guard.js';

export class IntegrationEngine {
  /**
   * Retrieves raw log content for a failed job.
   */
  async fetchRawLog(params: {
    installationId: number;
    repoFullName: string;
    githubJobId: number;
    providedLog?: string;
  }): Promise<string> {
    if (params.providedLog) {
      return params.providedLog;
    }

    try {
      const token = await getInstallationToken(params.installationId);
      return await fetchJobLogStream({
        installationToken: token,
        repoFullName: params.repoFullName,
        jobId: params.githubJobId,
      });
    } catch {
      // In offline / test environments without GitHub App credentials, fall back to sample
      return SAMPLE_RAW_LOGS.jest_assertion_fail;
    }
  }

  /**
   * Retrieves modified files for the failure commit.
   */
  async fetchModifiedFiles(params: {
    installationId: number;
    repoFullName: string;
    commitSha: string;
    providedFiles?: string[];
  }): Promise<string[]> {
    if (params.providedFiles && params.providedFiles.length > 0) {
      return params.providedFiles;
    }

    try {
      const token = await getInstallationToken(params.installationId);
      return await fetchCommitModifiedFiles({
        installationToken: token,
        repoFullName: params.repoFullName,
        commitSha: params.commitSha,
      });
    } catch {
      return [];
    }
  }

  /**
   * Renders sticky PR comment and posts/upserts to GitHub if prNumber is present.
   */
  async publishPullRequestComment(params: {
    installationId: number;
    repoFullName: string;
    workflowName: string;
    jobName: string;
    stepName: string;
    commitSha: string;
    prNumber?: number;
    runUrl?: string;
    orgPlan: PlanTier;
    signatureHash: string;
    flakinessScore: number;
    historicalStats: {
      totalOccurrences: number;
      uniquePrsAffected: number;
      sameShaRetryPasses: number;
    };
    diagnosis: DiagnosisOutput;
  }): Promise<{ commentText: string; githubCommentId?: number }> {
    const commentText = renderGitHubPrComment({
      orgPlan: params.orgPlan,
      repoFullName: params.repoFullName,
      workflowName: params.workflowName,
      jobName: params.jobName,
      stepName: params.stepName,
      commitSha: params.commitSha,
      runUrl: params.runUrl || `https://github.com/${params.repoFullName}/actions`,
      dashboardReportUrl: `https://hopper.dev/reports/${params.signatureHash}`,
      billingUpgradeUrl: 'https://hopper.dev/billing',
      flakinessScore: params.flakinessScore,
      historicalStats: params.historicalStats,
      diagnosis: params.diagnosis,
    });

    let githubCommentId: number | undefined;

    if (params.prNumber) {
      try {
        const token = await getInstallationToken(params.installationId);
        const res = await upsertPrStickyComment({
          installationToken: token,
          repoFullName: params.repoFullName,
          prNumber: params.prNumber,
          markdownContent: commentText,
        });
        githubCommentId = res.commentId;
      } catch (err: any) {
        console.warn(`[IntegrationEngine] Failed to post sticky PR comment: ${err.message}`);
      }
    }

    return { commentText, githubCommentId };
  }
}

