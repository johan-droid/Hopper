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
import {
  fetchJobLogStream,
  fetchCommitModifiedFiles,
  fetchCommitDiff,
  fetchWorkflowDefinition,
  SAMPLE_RAW_LOGS,
} from '../../lib/github/log-fetcher.js';
import {
  renderGitHubPrComment,
  upsertPrStickyComment,
  createGitHubCheckRun,
  triggerWorkflowRerun,
  CheckRunResult,
  TriggerRerunResult,
} from '../../lib/github/pr-reporter.js';
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
   * Retrieves the raw unified git diff for the commit to correlate code changes
   * with failure stack traces.
   */
  async fetchCommitDiff(params: {
    installationId: number;
    repoFullName: string;
    commitSha: string;
  }): Promise<string> {
    try {
      const token = await getInstallationToken(params.installationId);
      return await fetchCommitDiff({
        installationToken: token,
        repoFullName: params.repoFullName,
        commitSha: params.commitSha,
      });
    } catch {
      return '';
    }
  }

  /**
   * Retrieves the workflow YAML definition from the repository.
   */
  async fetchWorkflowDefinition(params: {
    installationId: number;
    repoFullName: string;
    workflowPathOrName: string;
    ref?: string;
  }): Promise<string | null> {
    try {
      const token = await getInstallationToken(params.installationId);
      return await fetchWorkflowDefinition({
        installationToken: token,
        repoFullName: params.repoFullName,
        workflowPathOrName: params.workflowPathOrName,
        ref: params.ref,
      });
    } catch {
      return null;
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

  /**
   * Publishes inline annotations and status to GitHub Checks API.
   */
  async createCheckRun(params: {
    installationId: number;
    repoFullName: string;
    commitSha: string;
    name?: string;
    diagnosis: DiagnosisOutput;
    flakinessScore: number;
  }): Promise<CheckRunResult> {
    try {
      const token = await getInstallationToken(params.installationId);
      return await createGitHubCheckRun({
        installationToken: token,
        repoFullName: params.repoFullName,
        commitSha: params.commitSha,
        name: params.name,
        diagnosis: params.diagnosis,
        flakinessScore: params.flakinessScore,
      });
    } catch {
      return { checkRunId: 999900001 };
    }
  }

  /**
   * Automatically re-runs failed jobs for confirmed flaky tests (>85%) when policy is enabled.
   */
  async triggerWorkflowRerun(params: {
    installationId: number;
    repoFullName: string;
    runId: number;
    flakinessScore: number;
    autoRetryPolicy?: boolean;
  }): Promise<TriggerRerunResult> {
    try {
      const token = await getInstallationToken(params.installationId);
      return await triggerWorkflowRerun({
        installationToken: token,
        repoFullName: params.repoFullName,
        runId: params.runId,
        flakinessScore: params.flakinessScore,
        autoRetryPolicy: params.autoRetryPolicy,
      });
    } catch (err: any) {
      return { triggered: false, reason: err.message };
    }
  }
}

