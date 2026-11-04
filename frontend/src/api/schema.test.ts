import { describe, it, expect } from 'vitest';
import {
  HealthSchema,
  DashboardSchema,
  SignatureDetailSchema,
  AdhocDiagnoseRequestSchema,
  AdhocDiagnoseResponseSchema,
  BillingCheckoutRequestSchema,
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
});
