/**
 * Hopper Engine — Canonical Types & Event Contracts.
 * Defines normalized event models, failure evidence, and diagnostic results
 * shared across all Hopper Engine sub-systems.
 */

import { DiagnosisOutput } from '../lib/ai/diagnose.js';
import { PlanTier } from '../lib/billing/quota-guard.js';

export type EventSource = 'github' | 'gitlab' | 'local' | 'adhoc';
export type WorkflowConclusion = 'failure' | 'success';

/**
 * Normalized internal event representation.
 * External payloads from GitHub, GitLab, or local CLI are converted into this canonical structure.
 */
export interface CanonicalCIEvent {
  eventId: string;
  source: EventSource;
  installationId: number;
  orgLogin: string;
  accountType: 'Organization' | 'User';
  githubRepoId: number;
  repoFullName: string;
  githubRunId: number;
  githubJobId: number;
  githubRunAttempt: number;
  workflowName: string;
  jobName: string;
  stepName: string;
  conclusion: WorkflowConclusion;
  commitSha: string;
  branch: string;
  prNumber?: number;
  actorLogin?: string;
  rawLog?: string;
  modifiedFiles?: string[];
  runUrl?: string;
  timestamp: string;
}

/**
 * Normalized evidence extracted from raw logs by NormalizationEngine.
 */
export interface NormalizedEvidence {
  cleanedSnippet: string;
  detectedTestIdentifier: string | null;
  detectedExitCode: number | null;
  detectedFramework?: string;
  highlightedLines: Array<{ lineNo: number; text: string; isError: boolean }>;
  scrubbedSecretCount: number;
}

/**
 * Authorized context retrieved by ContextEngine.
 */
export interface PipelineContext {
  org: {
    id: string;
    login: string;
    plan: PlanTier;
    runsUsed: number;
    autoRetryPolicy?: boolean;
  };
  repo: {
    id: string;
    fullName: string;
    defaultBranch: string;
    isMainBranch: boolean;
  };
  modifiedFiles: string[];
  priorCommitFailuresCount: number;
  commitDiff?: string;
  workflowDefinition?: string | null;
  matchingCodeSnippets?: Array<{ file: string; line: number; snippet: string }>;
}

/**
 * Intelligence correlation output from IntelligenceEngine.
 */
export interface FailureIntelligence {
  signatureHash: string;
  normalizedTemplate: string;
  testIdentifier: string;
  flakinessScore: number;
  totalOccurrences: number;
  sameShaRetryPasses: number;
  uniquePrsAffected: number;
  isCached: boolean;
  cachedRootCause?: string | null;
  cachedNextCheck?: string | null;
}

/**
 * End-to-end diagnosis outcome produced by DiagnosisEngine.
 */
export interface EngineDiagnosisResult {
  status: 'diagnosed' | 'flakiness_updated' | 'quota_exceeded' | 'skipped' | 'failed';
  reason?: string;
  signatureHash?: string;
  flakinessScore?: number;
  failureId?: string;
  reportId?: string;
  prComment?: string;
  diagnosis?: DiagnosisOutput;
}
