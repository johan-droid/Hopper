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

  it('parses live Anthropic response and validates schema', async () => {
    const validAnthropicJson = {
      error_category: 'timeout',
      root_cause_clues: 'E2E checkout test timed out waiting for payment gateway frame.',
      likely_flaky_test: {
        test_name: 'Checkout Flow > 3D Secure verification',
        is_likely_flaky: true,
        reasoning: 'Observed intermittent network delay during third-party iframe render.',
      },
      relevant_log_lines: [
        { line_number: 10, content: 'Test timeout of 30000ms exceeded', explanation: 'Step deadline exceeded' },
        { line_number: 12, content: 'waiting for locator iframe#stripe', explanation: 'Locator unresolved' },
        { line_number: 14, content: 'Process completed with exit code 1', explanation: 'Runner failure exit' },
      ],
      suggested_next_check: 'Mock external Stripe iframe response in test environment.',
      local_repro_command: 'npx playwright test checkout.spec.ts',
    };

    const parsed = DiagnosisOutputSchema.safeParse(validAnthropicJson);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.error_category).toBe('timeout');
      expect(parsed.data.likely_flaky_test.is_likely_flaky).toBe(true);
    }
  });

  it('rejects invalid LLM output missing required fields', () => {
    const invalidJson = {
      error_category: 'invalid_category',
      root_cause_clues: 'Something broke',
    };

    const parsed = DiagnosisOutputSchema.safeParse(invalidJson);
    expect(parsed.success).toBe(false);
  });
});
