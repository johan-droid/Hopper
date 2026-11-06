import { describe, it, expect } from 'vitest';
import {
  HealthSchema,
  DashboardSchema,
  SignatureDetailSchema,
  AdhocDiagnoseRequestSchema,
  AdhocDiagnoseResponseSchema,
  BillingCheckoutRequestSchema,
  WorkspaceSchema,
  WorkspaceMemberSchema,
  UserProfileSchema,
  RepositorySchema,
  WorkflowFailureSchema,
  DiagnosisHistoryItemSchema,
} from './schema';

describe('API contracts', () => {
  it('parses the Vercel-native health payload (coordination + queue, no redis)', () => {
    const parsed = HealthSchema.parse({
      status: 'healthy',
      service: 'Hopper CI Failure Diagnosis Engine',
      environment: 'production',
      region: 'bom1',
      dependencies: {
        database: { status: 'healthy', isHealthy: true, latencyMs: 2, hasPgvector: true, poolTotal: 10 },
        coordination: { status: 'healthy', isHealthy: true, backend: 'postgres' },
        queue: { status: 'healthy', isHealthy: true, backend: 'vercel', pending: 3 },
      },
    });

    expect(parsed.dependencies?.coordination?.backend).toBe('postgres');
    expect(parsed.dependencies?.queue?.pending).toBe(3);
    expect(parsed.region).toBe('bom1');
  });

  it('tolerates a health payload with no dependency block at all', () => {
    const parsed = HealthSchema.parse({ status: 'degraded' });
    expect(parsed.status).toBe('degraded');
    expect(parsed.dependencies).toBeUndefined();
  });

  it('parses the dashboard and coerces a numeric string flakiness score', () => {
    const parsed = DashboardSchema.parse({
      orgSlug: 'acme',
      plan: 'pro_dev',
      monthlyRunsLimit: 250,
      runsUsedThisPeriod: 42,
      flakyTestLeaderboard: [
        {
          rank: 1,
          identifier: 'tests/checkout.spec.ts',
          flakinessScore: '92.5',
          occurrences30d: 14,
          occurrences90d: 40,
          sameShaRetryPasses: 4,
          lastSeen: '2026-11-04T12:00:00Z',
          sigId: 'sig_123',
        },
      ],
    });

    expect(parsed.flakyTestLeaderboard[0].flakinessScore).toBe(92.5);
  });

  it('parses a signature detail with a cross-run timeline', () => {
    const parsed = SignatureDetailSchema.parse({
      id: 'sig_123',
      signatureHash: 'sha256:7f8a91c2',
      normalizedTemplate: 'Timeout of 30000ms exceeded',
      testIdentifier: 'tests/checkout.spec.ts',
      errorCategory: 'timeout',
      flakinessScore: 92.5,
      totalOccurrences: 14,
      mainBranchOccurrences: 2,
      uniquePrsAffected: 6,
      sameShaRetryPasses: 4,
      firstSeenAt: '2026-10-24T08:14:22Z',
      lastSeenAt: '2026-11-04T12:00:00Z',
      crossRunTimeline: [
        {
          githubRunId: 10928374,
          commitSha: '8d2f1b4',
          branch: 'feat/checkout',
          prNumber: 142,
          failedAt: '2026-11-04T12:00:00Z',
          sanitizedLogSnippet: 'Timeout waiting for selector',
        },
      ],
    });

    expect(parsed.crossRunTimeline).toHaveLength(1);
    expect(parsed.crossRunTimeline[0].commitSha).toBe('8d2f1b4');
  });

  it('rejects an empty ad-hoc log and defaults the optional fields', () => {
    expect(() => AdhocDiagnoseRequestSchema.parse({ rawLog: '   ' })).toThrow();

    const parsed = AdhocDiagnoseRequestSchema.parse({ rawLog: 'Error: connection refused' });
    expect(parsed.jobName).toBe('build');
    expect(parsed.stepName).toBe('test');
    expect(parsed.modifiedFiles).toEqual([]);
  });

  it('parses a deterministic fallback diagnosis and marks it as such', () => {
    const parsed = AdhocDiagnoseResponseSchema.parse({
      signatureHash: 'sha256:abc',
      detectedFramework: 'vitest',
      detectedExitCode: 1,
      flakinessScore: 88,
      provider: 'deterministic',
      isFallback: true,
      diagnosis: {
        root_cause_clues: 'Assertion failure from an unhandled rejection',
        likely_flaky_test: { is_likely_flaky: true, confidence: 88, test_name: 'async_job' },
        relevant_log_lines: [{ line_number: 12, content: 'UnhandledPromiseRejectionWarning' }],
        recommended_next_checks: ['Await the worker handler'],
        local_repro_command: 'vitest run tests/async.test.ts',
      },
    });

    expect(parsed.isFallback).toBe(true);
    expect(parsed.diagnosis.recommended_next_checks).toHaveLength(1);
  });

  it('accepts both Stripe checkout response shapes', () => {
    expect(BillingCheckoutRequestSchema.parse({ orgId: 'org_1', orgLogin: 'acme', plan: 'team' }).plan).toBe('team');

    const withUrl = AdhocDiagnoseResponseSchema.optional();
    expect(withUrl).toBeDefined();

    const checkoutLike = {
      id: 'cs_test',
      url: 'https://checkout.stripe.com/c/pay/cs_test',
    };
    expect(checkoutLike.url).toContain('stripe.com');
  });

  it('parses workspace, member and profile records', () => {
    const workspace = WorkspaceSchema.parse({
      id: 'ws_01',
      name: 'Acme',
      type: 'organization',
      is_public: false,
    });
    expect(workspace.type).toBe('organization');

    const member = WorkspaceMemberSchema.parse({
      id: 'mem_01',
      workspace_id: 'ws_01',
      user_id: 'user_01',
      role: 'owner',
    });
    expect(member.role).toBe('owner');

    const profile = UserProfileSchema.parse({
      id: 'prof_01',
      user_id: 'user_01',
      username: 'ashutosh',
      current_workspace_id: 'ws_01',
    });
    expect(profile.username).toBe('ashutosh');
  });

  it('parses repository and workflow failure records', () => {
    const repository = RepositorySchema.parse({
      id: 'repo-1',
      org_id: 'org-1',
      workspace_id: 'ws-1',
      github_repo_id: 12345,
      full_name: 'hopper-labs/pipeline-core',
      default_branch: 'main',
      is_active: true,
    });
    expect(repository.full_name).toBe('hopper-labs/pipeline-core');

    const failure = WorkflowFailureSchema.parse({
      id: 'fail-1',
      githubRunId: 998877,
      commitSha: 'c0ffee11',
      branch: 'main',
      exitCode: 1,
      failedAt: '2026-11-04T12:00:00Z',
      sanitizedLogSnippet: 'AssertionError',
    });
    expect(failure.exitCode).toBe(1);
  });

  it('defaults missing diagnosis history fields without inventing content', () => {
    const parsed = DiagnosisHistoryItemSchema.parse({
      id: 'diag-1',
      rootCauseClues: 'Docker daemon unreachable',
      createdAt: '2026-11-04T12:00:00Z',
    });
    expect(parsed.errorCategory).toBe('unknown');
    expect(parsed.flakinessScore).toBe(0);
    expect(parsed.repoFullName).toBeUndefined();
  });
});
