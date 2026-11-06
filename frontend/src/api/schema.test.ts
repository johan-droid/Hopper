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
} from './schema';

describe('Frontend API Schema Validation (Option B Decoupled)', () => {
  it('validates a live health response schema correctly', () => {
    const mockHealth = {
      status: 'healthy',
      service: 'Hopper CI Failure Diagnosis Engine',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: 120,
      dependencies: {
        database: { status: 'healthy', poolTotal: 10, poolIdle: 8, latencyMs: 2 },
        redis: { status: 'healthy', connected: true, latencyMs: 1 },
      },
    };

    const parsed = HealthSchema.parse(mockHealth);
    expect(parsed.status).toBe('healthy');
    expect(parsed.dependencies.redis.connected).toBe(true);
  });

  it('validates a dashboard response with flaky leaderboard item schema', () => {
    const mockDashboard = {
      orgSlug: 'acme-corp',
      plan: 'pro_dev',
      monthlyRunsLimit: 250,
      runsUsedThisPeriod: 42,
      flakyTestLeaderboard: [
        {
          rank: 1,
          identifier: 'tests/checkout.spec.ts',
          flakinessScore: 92.5,
          occurrences30d: 14,
          occurrences90d: 40,
          sameShaRetryPasses: 4,
          lastSeen: '2026-11-04T12:00:00Z',
          sigId: 'sig_123',
        },
      ],
    };

    const parsed = DashboardSchema.parse(mockDashboard);
    expect(parsed.orgSlug).toBe('acme-corp');
    expect(parsed.flakyTestLeaderboard).toHaveLength(1);
    expect(parsed.flakyTestLeaderboard[0].flakinessScore).toBe(92.5);
  });

  it('validates a signature cross-run timeline response schema', () => {
    const mockSignature = {
      id: 'sig_123',
      signatureHash: 'sha256:7f8a91c20e149d8c3621980be103f6f1c4a921d7',
      normalizedTemplate: 'Timeout of 30000ms exceeded',
      testIdentifier: 'tests/checkout.spec.ts',
      errorCategory: 'timeout',
      flakinessScore: 92.5,
      totalOccurrences: 14,
      mainBranchOccurrences: 2,
      uniquePrsAffected: 6,
      sameShaRetryPasses: 4,
      cachedRootCause: 'Async race condition',
      cachedNextCheck: 'Increase test timeout',
      firstSeenAt: '2026-10-24T08:14:22Z',
      lastSeenAt: '2026-11-04T12:00:00Z',
      crossRunTimeline: [
        {
          githubRunId: 10928374,
          commitSha: '8d2f1b4',
          branch: 'feat/checkout',
          prNumber: 142,
          exitCode: 1,
          durationMs: 34200,
          failedAt: '12 mins ago',
          sanitizedLogSnippet: 'Timeout waiting for selector',
        },
      ],
    };

    const parsed = SignatureDetailSchema.parse(mockSignature);
    expect(parsed.signatureHash).toContain('sha256:');
    expect(parsed.crossRunTimeline[0].commitSha).toBe('8d2f1b4');
  });

  it('validates adhoc diagnosis requests and responses', () => {
    const validReq = AdhocDiagnoseRequestSchema.parse({
      rawLog: 'Error: Connection timeout',
      jobName: 'integration-tests',
      stepName: 'pytest',
    });
    expect(validReq.modifiedFiles).toEqual([]);

    const validRes = AdhocDiagnoseResponseSchema.parse({
      signatureHash: 'sha256:abc',
      detectedFramework: 'python',
      detectedExitCode: 1,
      flakinessScore: 45.0,
      diagnosis: {
        root_cause_clues: 'Database unreachable',
        likely_flaky_test: {
          is_flaky: false,
          confidence: 45.0,
          test_name: 'pytest',
          reasoning: 'Deterministic failure',
        },
        relevant_log_lines: [
          { line_number: 1, content: 'Error: Connection timeout', explanation: 'Failed handshake' },
        ],
        recommended_next_checks: ['Check DB credentials'],
      },
    });
    expect(validRes.diagnosis.likely_flaky_test.is_flaky).toBe(false);
  });

  it('validates billing checkout payload schema', () => {
    const req = BillingCheckoutRequestSchema.parse({
      orgId: '00000000-0000-0000-0000-000000000001',
      orgLogin: 'acme-corp',
      plan: 'pro_dev',
    });
    expect(req.plan).toBe('pro_dev');
  });

  it('validates live backend health payload with isHealthy booleans', () => {
    const rawBackendHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      dependencies: {
        database: { isHealthy: true, latencyMs: 2 },
        redis: { isHealthy: true, latencyMs: 1 },
      },
    };
    const parsed = HealthSchema.parse(rawBackendHealth);
    expect(parsed.status).toBe('healthy');
    expect(parsed.dependencies.database.isHealthy).toBe(true);
    expect(parsed.dependencies.redis.isHealthy).toBe(true);
  });

  it('validates live backend adhoc diagnose payload with is_likely_flaky and suggested_next_check', () => {
    const rawBackendDiagnose = {
      signatureHash: 'sha256:7f8a91c20e14',
      detectedFramework: 'vitest',
      detectedExitCode: 1,
      flakinessScore: 88.0,
      diagnosis: {
        root_cause_clues: 'Assertion failure due to unhandled promise rejection',
        likely_flaky_test: {
          is_likely_flaky: true,
          confidence: 88.0,
          test_name: 'test_async_job',
          reasoning: 'Intermittent timer race',
        },
        relevant_log_lines: [
          { line_number: 12, content: 'UnhandledPromiseRejectionWarning', explanation: 'Promise timeout' },
        ],
        suggested_next_check: 'Add await to async worker handler',
        recommended_next_checks: ['Add await to async worker handler'],
      },
    };
    const parsed = AdhocDiagnoseResponseSchema.parse(rawBackendDiagnose);
    expect(parsed.flakinessScore).toBe(88.0);
    expect(parsed.diagnosis.likely_flaky_test.is_likely_flaky).toBe(true);
    expect(parsed.diagnosis.recommended_next_checks).toHaveLength(1);
  });

  it('validates workspace and member schemas', () => {
    const ws = WorkspaceSchema.parse({
      id: 'ws_01',
      name: 'Acme Workspace',
      type: 'organization',
      is_public: false,
      created_at: new Date().toISOString(),
    });
    expect(ws.name).toBe('Acme Workspace');
    expect(ws.is_public).toBe(false);

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
      full_name: 'Ashutosh Sahoo',
      current_workspace_id: 'ws_01',
    });
    expect(profile.username).toBe('ashutosh');
  });

  it('validates repository and workflow failure schemas', () => {
    const mockRepo = {
      id: 'repo-100',
      org_id: 'org-200',
      workspace_id: 'ws-300',
      github_repo_id: 12345,
      full_name: 'hopper-labs/pipeline-core',
      default_branch: 'main',
      is_active: true,
      created_at: new Date().toISOString(),
    };

    const parsedRepo = RepositorySchema.parse(mockRepo);
    expect(parsedRepo.full_name).toBe('hopper-labs/pipeline-core');
    expect(parsedRepo.workspace_id).toBe('ws-300');

    const mockFailure = {
      id: 'fail-1',
      githubRunId: 998877,
      githubJobId: 112233,
      workflowName: 'CI',
      jobName: 'test',
      failedStepName: 'unit',
      commitSha: 'c0ffee11',
      branch: 'main',
      prNumber: 42,
      exitCode: 1,
      durationMs: 45000,
      failedAt: '10 mins ago',
      sanitizedLogSnippet: 'AssertionError: expected true to be false',
    };

    const parsedFailure = WorkflowFailureSchema.parse(mockFailure);
    expect(parsedFailure.commitSha).toBe('c0ffee11');
    expect(parsedFailure.exitCode).toBe(1);
  });
});
