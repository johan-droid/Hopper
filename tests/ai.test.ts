import { describe, it, expect } from 'vitest';
import { synthesizeDiagnosis, DiagnosisOutputSchema, buildDiagnosisSystemPrompt, buildDiagnosisUserPrompt } from '../src/lib/ai/diagnose.js';

describe('Structured AI Diagnosis Engine', () => {
  it('should generate valid diagnosis conforming strictly to Zod schema', async () => {
    const diagnosis = await synthesizeDiagnosis({
      workflowName: 'CI',
      jobName: 'test',
      stepName: 'vitest',
      exitCode: 1,
      commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
      modifiedFiles: ['src/auth/jwt.ts'],
      historicalStats: {
        totalOccurrences: 5,
        uniquePrsAffected: 2,
        sameShaRetryPasses: 1,
        computedFlakinessScore: 65,
      },
      slicedLogSnippet: '[L10] FAIL src/auth/jwt.spec.ts\n[L11] AssertionError: expected 200 to equal 401',
    });

    const parsed = DiagnosisOutputSchema.safeParse(diagnosis);
    expect(parsed.success).toBe(true);
    expect(diagnosis.error_category).toBe('test_assertion');
    expect(diagnosis.relevant_log_lines.length).toBeGreaterThanOrEqual(3);
    expect(diagnosis.likely_flaky_test.is_likely_flaky).toBe(true);
  });

  it('should build system prompt and user prompt correctly', () => {
    const sys = buildDiagnosisSystemPrompt();
    expect(sys).toContain('Principal CI/CD Reliability Engineer');

    const user = buildDiagnosisUserPrompt({
      workflowName: 'Test',
      jobName: 'job1',
      stepName: 'step1',
      exitCode: 1,
      commitSha: '1234567890',
      modifiedFiles: ['file.ts'],
      historicalStats: {
        totalOccurrences: 1,
        uniquePrsAffected: 1,
        sameShaRetryPasses: 0,
        computedFlakinessScore: 10,
      },
      slicedLogSnippet: 'Error line',
    });
    expect(user).toContain('sanitized_log_window');
  });
});
