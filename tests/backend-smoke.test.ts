import { describe, it, expect } from 'vitest';
import { sliceFailedStepLog } from '../src/lib/parser/log-slicer.js';
import { computeFailureSignature } from '../src/lib/parser/fingerprinter.js';

describe('Backend Smoke Tests', () => {
  describe('Log Slicing', () => {
    it('should slice and redact CI log with scrubber patterns', () => {
      const NOISY_CI_LOG = [
        '\u001b[32m:: group ::Checkout\u001b[0m',
        'AKIAIOSFODNN7EXAMPLE',
        'sk-ant-thirteen-characters-but-enough',
        'ghp_uSLQpRfT1234567890123456789012345678',
        'postgres://user:pwd@host:5432/db',
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWQiOiJhZG1pZF9ub25jZTI1',
        'Tests:       1 failed, 99 passed',
        'tests/auth/login.spec.ts > Timeout 30000ms exceeded waiting for selector "#submit-btn"',
        'Error: Timeout of 30000ms exceeded waiting for selector "#submit-btn"',
      ].join('\n');

      const result = sliceFailedStepLog(NOISY_CI_LOG, 45);

      expect(result.cleanedSnippet.length).toBeLessThanOrEqual(4000);
      expect(result.highlightedLines.length).toBeLessThanOrEqual(45);
      expect(result.cleanedSnippet).not.toContain('\u001b');
      expect(result.cleanedSnippet).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/);
      
      expect(result.cleanedSnippet).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(result.cleanedSnippet).not.toContain('sk-ant-thirteen-characters-but-enough');
      expect(result.cleanedSnippet).not.toContain('ghp_uSLQpRfT1234567890123456789012345678');
      expect(result.cleanedSnippet).not.toContain('postgres://user:pwd@host:5432/db');
      expect(result.cleanedSnippet).not.toContain('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWQiOiJhZG1pZF9ub25jZTI1');
      
      expect(result.cleanedSnippet).toContain('Timeout 30000ms');
      expect(result.cleanedSnippet).toContain('login.spec.ts');
      expect(result.cleanedSnippet).toContain('[REDACTED');
    });

    it('should produce deterministic fingerprint', () => {
      // Use the exact same stack trace to verify the fingerprinter is deterministic
      const stackTrace = 'Error: Timeout of 30000ms exceeded waiting for selector "#submit-btn"\n    at process.nextTick (.timers.js: node:internal)\n    at Window.wrap (.js: node:internal)\n    at tests/auth/login.spec.ts:42:18';
      
      const result1 = computeFailureSignature(
        ' CI Pipeline',
        'Run Playwright suite',
        'tests/auth/login.spec.ts',
        stackTrace
      );
      
      const result2 = computeFailureSignature(
        ' CI Pipeline',
        'Run Playwright suite',
        'tests/auth/login.spec.ts',
        stackTrace
      );
      
      // The fingerprinter should produce identical results for identical inputs
      expect(result1.signatureHash).toBe(result2.signatureHash);
      expect(result1.normalizedTemplate).toBe(result2.normalizedTemplate);
    });
  });
});
