import { describe, it, expect } from 'vitest';
import { renderGitHubPrComment, STICKY_COMMENT_MARKER } from '../src/lib/github/pr-reporter.js';

describe('Sticky PR Comment Reporter', () => {
  const mockDiagnosis = {
    error_category: 'test_assertion' as const,
    root_cause_clues: 'JWT token expired unexpectedly.',
    likely_flaky_test: {
      test_name: 'src/auth/jwt.spec.ts',
      is_likely_flaky: false,
      reasoning: 'Deterministic assertion error.',
    },
    relevant_log_lines: [
      { line_number: 14, content: 'FAIL auth.spec.ts', explanation: 'Suite failure' },
      { line_number: 15, content: 'AssertionError: expected true', explanation: 'Mismatch' },
      { line_number: 16, content: 'exit code 1', explanation: 'Exit status' },
    ],
    suggested_next_check: 'Check JWT expiration setting.',
    local_repro_command: 'npx vitest run src/auth/jwt.spec.ts',
  };

  it('should render sticky marker tag and markdown table', () => {
    const comment = renderGitHubPrComment({
      orgPlan: 'free',
      repoFullName: 'acme/repo',
      workflowName: 'CI',
      jobName: 'test',
      stepName: 'run vitest',
      commitSha: 'a1b2c3d4e5f6',
      runUrl: 'https://github.com/acme/repo/actions/runs/1',
      dashboardReportUrl: 'https://hopper.dev/reports/123',
      billingUpgradeUrl: 'https://hopper.dev/billing',
      flakinessScore: 20,
      historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0 },
      diagnosis: mockDiagnosis,
    });

    expect(comment).toContain(STICKY_COMMENT_MARKER);
    expect(comment).toContain('### ⚡ CI Failure Report');
    expect(comment).toContain('Deterministic Failure (80% confidence)');
    expect(comment).toContain('npx vitest run src/auth/jwt.spec.ts');
  });

  it('should embed paywall teaser on free plan when recurring cross-run pattern is detected', () => {
    const comment = renderGitHubPrComment({
      orgPlan: 'free',
      repoFullName: 'acme/repo',
      workflowName: 'CI',
      jobName: 'test',
      stepName: 'run vitest',
      commitSha: 'a1b2c3d4e5f6',
      runUrl: 'https://github.com/acme/repo/actions/runs/1',
      dashboardReportUrl: 'https://hopper.dev/reports/123',
      billingUpgradeUrl: 'https://hopper.dev/billing',
      flakinessScore: 85,
      historicalStats: { totalOccurrences: 12, uniquePrsAffected: 5, sameShaRetryPasses: 3 },
      diagnosis: mockDiagnosis,
    });

    expect(comment).toContain('🔒 **Cross-Run Pattern Detected:** This exact error signature has failed **12 times**');
    expect(comment).toContain('Unlock 30-day failure history, flaky test matrices & Slack alerts ($9/mo)');
  });
});
