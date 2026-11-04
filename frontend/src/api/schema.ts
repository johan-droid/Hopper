import { z } from 'zod';

// 1. Health Telemetry Schema
export const HealthSchema = z.object({
  status: z.string(),
  service: z.string(),
  version: z.string(),
  timestamp: z.string(),
  uptimeSeconds: z.number(),
  dependencies: z.object({
    database: z.object({
      status: z.string(),
      poolTotal: z.number().optional(),
      poolIdle: z.number().optional(),
      latencyMs: z.number().optional(),
    }),
    redis: z.object({
      status: z.string(),
      connected: z.boolean(),
      latencyMs: z.number().optional(),
    }),
  }),
});
export type HealthData = z.infer<typeof HealthSchema>;

// 2. Flaky Leaderboard Item Schema
export const FlakyLeaderboardItemSchema = z.object({
  rank: z.number(),
  identifier: z.string(),
  flakinessScore: z.number(),
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
  prNumber: z.number().nullable(),
  exitCode: z.number(),
  durationMs: z.number(),
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
  flakinessScore: z.number(),
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
  detectedFramework: z.string(),
  detectedExitCode: z.number(),
  flakinessScore: z.number(),
  diagnosis: z.object({
    root_cause_clues: z.string(),
    likely_flaky_test: z.object({
      is_flaky: z.boolean(),
      confidence: z.number(),
      test_name: z.string(),
      reasoning: z.string(),
    }),
    relevant_log_lines: z.array(
      z.object({
        line_number: z.number(),
        content: z.string(),
        explanation: z.string(),
      })
    ),
    recommended_next_checks: z.array(z.string()),
  }),
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
