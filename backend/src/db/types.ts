/**
 * Hopper Database Domain Models & Type Definitions.
 * Aligns with PostgreSQL 16 + pgvector schema (0001_initial_schema.sql).
 */

import type { PlanTier } from '../lib/billing/quota-guard.js';

export type { PlanTier };

export type ErrorCategory =
  | 'test_assertion'
  | 'timeout'
  | 'infra_oom'
  | 'build_compile'
  | 'network'
  | 'env_config';

export interface Organization {
  id: string;
  workspace_id?: string | null;
  github_installation_id: number;
  github_account_login: string;
  github_account_type: 'Organization' | 'User';
  plan: PlanTier;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  monthly_run_limit: number;
  runs_used_this_period: number;
  billing_period_reset_at: Date;
  slack_webhook_url: string | null;
  discord_webhook_url: string | null;
  auto_retry_policy: boolean;
  installation_status?: 'active' | 'suspended' | 'deleted' | 'pending';
  permissions?: Record<string, string>;
  repository_selection?: 'all' | 'selected';
  installed_at?: Date;
  suspended_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Repository {
  id: string;
  org_id: string;
  workspace_id?: string | null;
  github_repo_id: number;
  full_name: string;
  default_branch: string;
  is_active: boolean;
  visibility?: 'public' | 'private' | 'internal';
  is_archived?: boolean;
  last_synced_at?: Date | null;
  created_at: Date;
}

export interface FailureSignature {
  id: string;
  repo_id: string;
  signature_hash: string;
  normalized_template: string;
  test_identifier: string | null;
  error_category: ErrorCategory | string;
  embedding: number[] | null;
  total_occurrences: number;
  main_branch_occurrences: number;
  unique_prs_affected: number;
  same_sha_retry_passes: number;
  flakiness_score: number;
  cached_root_cause: string | null;
  cached_next_check: string | null;
  first_seen_at: Date;
  last_seen_at: Date;
}

export interface WorkflowFailure {
  id: string;
  repo_id: string;
  signature_id: string | null;
  github_run_id: number;
  github_job_id: number;
  github_run_attempt: number;
  workflow_name: string;
  job_name: string;
  failed_step_name: string | null;
  commit_sha: string;
  branch: string;
  pr_number: number | null;
  actor_login: string | null;
  exit_code: number | null;
  duration_ms: number | null;
  sanitized_log_snippet: string;
  failed_at: Date;
}

export interface DiagnosticReport {
  id: string;
  failure_id: string;
  root_cause_clues: string;
  likely_flaky_test: string | null;
  flaky_confidence: number;
  relevant_log_lines: Array<{
    line_number: number;
    content: string;
    explanation: string;
  }>;
  suggested_next_check: string;
  local_repro_command: string | null;
  correlating_commit_files: string[] | null;
  github_comment_id: number | null;
  llm_model_used: string;
  prompt_tokens: number;
  completion_tokens: number;
  created_at: Date;
}

// -----------------------------------------------------------------------------
// DTOs & Mutation Inputs
// -----------------------------------------------------------------------------

export interface UpsertOrganizationInput {
  githubInstallationId: number;
  githubAccountLogin: string;
  githubAccountType: 'Organization' | 'User';
  plan?: PlanTier;
  monthlyRunLimit?: number;
  workspaceId?: string | null;
}

export interface UpsertRepositoryInput {
  orgId: string;
  githubRepoId: number;
  fullName: string;
  defaultBranch?: string;
  isActive?: boolean;
  workspaceId?: string | null;
}

export interface UpsertFailureSignatureInput {
  repoId: string;
  signatureHash: string;
  normalizedTemplate: string;
  testIdentifier?: string | null;
  errorCategory: ErrorCategory | string;
  embedding?: number[] | null;
  flakinessScore?: number;
  cachedRootCause?: string | null;
  cachedNextCheck?: string | null;
}

export interface CreateWorkflowFailureInput {
  repoId: string;
  signatureId?: string | null;
  githubRunId: number;
  githubJobId: number;
  githubRunAttempt?: number;
  workflowName: string;
  jobName: string;
  failedStepName?: string | null;
  commitSha: string;
  branch: string;
  prNumber?: number | null;
  actorLogin?: string | null;
  exitCode?: number | null;
  durationMs?: number | null;
  sanitizedLogSnippet: string;
}

export interface CreateDiagnosticReportInput {
  failureId: string;
  rootCauseClues: string;
  likelyFlakyTest?: string | null;
  flakyConfidence?: number;
  relevantLogLines: Array<{
    line_number: number;
    content: string;
    explanation: string;
  }>;
  suggestedNextCheck: string;
  localReproCommand?: string | null;
  correlatingCommitFiles?: string[] | null;
  githubCommentId?: number | null;
  llmModelUsed: string;
  promptTokens?: number;
  completionTokens?: number;
}

// -----------------------------------------------------------------------------
// Workspace & User Profile Domain Models (Schema 0004)
// -----------------------------------------------------------------------------

export type UserRole = 'owner' | 'admin' | 'developer' | 'viewer';
export type WorkspaceType = 'personal' | 'organization';

export interface UserProfile {
  id: string;
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: UserRole;
  current_workspace_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
  owner_id: string;
  parent_workspace_id: string | null;
  description: string | null;
  is_public: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: UserRole;
  joined_at: Date;
}

export interface WorkspaceInvitation {
  id: string;
  workspace_id: string;
  email: string;
  role: UserRole;
  token: string;
  expires_at: Date;
  accepted_at: Date | null;
  accepted_by: string | null;
}

export interface CreateWorkspaceInput {
  name: string;
  type?: WorkspaceType;
  ownerId: string;
  parentWorkspaceId?: string | null;
  description?: string | null;
  isPublic?: boolean;
}

export interface UpdateWorkspaceInput {
  name?: string;
  description?: string | null;
  isPublic?: boolean;
}

export interface AddWorkspaceMemberInput {
  workspaceId: string;
  userId: string;
  role: UserRole;
}

export interface UpsertUserProfileInput {
  userId: string;
  username?: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  role?: UserRole;
  currentWorkspaceId?: string | null;
}
