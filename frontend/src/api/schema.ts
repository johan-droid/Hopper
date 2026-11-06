import { z } from 'zod';

// 1. Health Telemetry Schema
export const HealthSchema = z.object({
  status: z.string(),
  service: z.string().optional(),
  version: z.string().optional(),
  timestamp: z.string().optional(),
  uptimeSeconds: z.number().optional(),
  dependencies: z.object({
    database: z.object({
      status: z.string().optional(),
      isHealthy: z.boolean().optional(),
      poolTotal: z.number().optional(),
      poolIdle: z.number().optional(),
      latencyMs: z.number().optional(),
      pgVersion: z.string().optional(),
      hasPgvector: z.boolean().optional(),
    }).passthrough(),
    redis: z.object({
      status: z.string().optional(),
      isHealthy: z.boolean().optional(),
      connected: z.boolean().optional(),
      latencyMs: z.number().optional(),
    }).passthrough(),
  }).passthrough(),
});
export type HealthData = z.infer<typeof HealthSchema>;

// 2. Flaky Leaderboard Item Schema
export const FlakyLeaderboardItemSchema = z.object({
  rank: z.number(),
  identifier: z.string(),
  flakinessScore: z.union([z.number(), z.string().transform((v) => parseFloat(v))]),
  occurrences30d: z.number(),
  occurrences90d: z.number(),
  sameShaRetryPasses: z.number(),
  lastSeen: z.string(),
  sigId: z.string().optional(),
});
export type FlakyLeaderboardItem = z.infer<typeof FlakyLeaderboardItemSchema>;

// 3. Organization Dashboard Schema
export const DashboardSchema = z.object({
  orgSlug: z.string(),
  plan: z.enum(['free', 'pro_dev', 'team']).or(z.string()),
  monthlyRunsLimit: z.number(),
  runsUsedThisPeriod: z.number(),
  flakyTestLeaderboard: z.array(FlakyLeaderboardItemSchema),
});
export type DashboardData = z.infer<typeof DashboardSchema>;

// 4. Signature Detail Schema
export const SignatureTimelineItemSchema = z.object({
  githubRunId: z.union([z.string(), z.number()]),
  githubJobId: z.union([z.string(), z.number()]).optional(),
  workflowName: z.string().optional(),
  jobName: z.string().optional(),
  failedStepName: z.string().optional(),
  commitSha: z.string(),
  branch: z.string(),
  prNumber: z.number().nullable().optional(),
  exitCode: z.number().nullable().optional(),
  durationMs: z.number().nullable().optional(),
  failedAt: z.string(),
  sanitizedLogSnippet: z.string(),
});
export type SignatureTimelineItem = z.infer<typeof SignatureTimelineItemSchema>;

export const SignatureDetailSchema = z.object({
  id: z.string(),
  signatureHash: z.string(),
  normalizedTemplate: z.string(),
  testIdentifier: z.string(),
  errorCategory: z.string(),
  flakinessScore: z.union([z.number(), z.string().transform((v) => parseFloat(v))]),
  totalOccurrences: z.number(),
  mainBranchOccurrences: z.number(),
  uniquePrsAffected: z.number(),
  sameShaRetryPasses: z.number(),
  cachedRootCause: z.string().nullable().optional(),
  cachedNextCheck: z.string().nullable().optional(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  occurrenceCount: z.number().optional(),
  crossRunTimeline: z.array(SignatureTimelineItemSchema),
});
export type SignatureDetail = z.infer<typeof SignatureDetailSchema>;

// 5. Ad-Hoc Diagnosis Request & Response Schema
export const AdhocDiagnoseRequestSchema = z.object({
  rawLog: z.string().min(1, 'Log content cannot be empty'),
  jobName: z.string().default('build'),
  stepName: z.string().default('test'),
  modifiedFiles: z.array(z.string()).default([]),
});
export type AdhocDiagnoseRequest = z.infer<typeof AdhocDiagnoseRequestSchema>;

export const AdhocDiagnoseResponseSchema = z.object({
  signatureHash: z.string(),
  detectedFramework: z.string().optional(),
  detectedExitCode: z.number().nullable().optional(),
  flakinessScore: z.number(),
  diagnosis: z.object({
    root_cause_clues: z.string(),
    likely_flaky_test: z.object({
      is_flaky: z.boolean().optional(),
      is_likely_flaky: z.boolean().optional(),
      confidence: z.number().optional(),
      test_name: z.string().nullable().optional(),
      reasoning: z.string().optional(),
    }).passthrough(),
    relevant_log_lines: z.array(
      z.object({
        line_number: z.number(),
        content: z.string(),
        explanation: z.string().optional(),
      })
    ),
    recommended_next_checks: z.array(z.string()).optional().default([]),
    suggested_next_check: z.string().optional(),
    local_repro_command: z.string().nullable().optional(),
  }).passthrough(),
});
export type AdhocDiagnoseResponse = z.infer<typeof AdhocDiagnoseResponseSchema>;

// 6. Billing Checkout Schema
export const BillingCheckoutRequestSchema = z.object({
  orgId: z.string(),
  orgLogin: z.string(),
  plan: z.enum(['pro_dev', 'team']),
  successUrl: z.string().optional(),
  cancelUrl: z.string().optional(),
});
export type BillingCheckoutRequest = z.infer<typeof BillingCheckoutRequestSchema>;

export const BillingCheckoutResponseSchema = z.object({
  id: z.string().optional(),
  checkoutUrl: z.string().optional(),
  status: z.string().optional(),
  mock: z.boolean().optional(),
});
export type BillingCheckoutResponse = z.infer<typeof BillingCheckoutResponseSchema>;

// 7. Workspace & User Profile Schemas
export const WorkspaceMemberSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  user_id: z.string(),
  role: z.enum(['owner', 'admin', 'developer', 'member', 'viewer']).or(z.string()),
  status: z.string().optional(),
  created_at: z.string().optional(),
  username: z.string().nullable().optional(),
  full_name: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
});
export type WorkspaceMember = z.infer<typeof WorkspaceMemberSchema>;

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['personal', 'organization']).or(z.string()),
  owner_id: z.string().nullable().optional(),
  parent_workspace_id: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  is_public: z.boolean(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const UserProfileSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  username: z.string(),
  full_name: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
  current_workspace_id: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

// 8. Repository & CI Failure History Schemas
export const RepositorySchema = z.object({
  id: z.string(),
  org_id: z.string(),
  workspace_id: z.string().nullable().optional(),
  github_repo_id: z.number(),
  full_name: z.string(),
  default_branch: z.string(),
  is_active: z.boolean(),
  created_at: z.string().optional(),
});
export type Repository = z.infer<typeof RepositorySchema>;

export const WorkflowFailureSchema = z.object({
  id: z.string(),
  githubRunId: z.union([z.string(), z.number()]),
  githubJobId: z.union([z.string(), z.number()]).optional(),
  workflowName: z.string().optional(),
  jobName: z.string().optional(),
  failedStepName: z.string().optional(),
  commitSha: z.string(),
  branch: z.string(),
  prNumber: z.number().nullable().optional(),
  actorLogin: z.string().nullable().optional(),
  exitCode: z.number().nullable().optional(),
  durationMs: z.number().nullable().optional(),
  failedAt: z.string(),
  sanitizedLogSnippet: z.string(),
});
export type WorkflowFailure = z.infer<typeof WorkflowFailureSchema>;

// 9. Live Diagnosis History Schema
export const DiagnosisHistoryItemSchema = z.object({
  id: z.string(),
  failureId: z.string().optional(),
  repoFullName: z.string().nullable().optional(),
  workflowName: z.string().nullable().optional(),
  jobName: z.string().nullable().optional(),
  failedStepName: z.string().nullable().optional(),
  commitSha: z.string().nullable().optional(),
  branch: z.string().nullable().optional(),
  prNumber: z.number().nullable().optional(),
  signatureHash: z.string().nullable().optional(),
  errorCategory: z.string().default('test_assertion'),
  flakinessScore: z.number().default(0),
  rootCauseClues: z.string(),
  likelyFlakyTest: z.string().nullable().optional(),
  suggestedNextCheck: z.string().nullable().optional(),
  localReproCommand: z.string().nullable().optional(),
  llmModelUsed: z.string().optional(),
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
  createdAt: z.string(),
});
export type DiagnosisHistoryItem = z.infer<typeof DiagnosisHistoryItemSchema>;
