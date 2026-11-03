/**
 * Queue Payload Types & Job Definitions for BullMQ + Redis Pipeline.
 */

export interface WorkflowJobEventData {
  installationId: number;
  orgLogin: string;
  accountType: 'Organization' | 'User';
  repoFullName: string;
  githubRepoId: number;
  workflowName: string;
  jobName: string;
  stepName: string;
  githubRunId: number;
  githubJobId: number;
  githubRunAttempt: number;
  commitSha: string;
  branch: string;
  prNumber?: number | null;
  actorLogin?: string | null;
  conclusion: 'failure' | 'success';
  rawLog?: string;
  modifiedFiles?: string[];
  runUrl?: string;
}

export interface JobDiagnosticResult {
  status: 'diagnosed' | 'flakiness_updated' | 'skipped' | 'quota_exceeded';
  signatureHash?: string;
  flakinessScore?: number;
  failureId?: string;
  reportId?: string;
  prComment?: string;
  reason?: string;
}
