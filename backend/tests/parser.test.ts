import { describe, it, expect } from 'vitest';
import { stripAnsiAndRunnerNoise } from '../src/lib/parser/ansi-stripper.js';
import { sliceFailedStepLog } from '../src/lib/parser/log-slicer.js';
import { SAMPLE_RAW_LOGS } from '../src/lib/github/log-fetcher.js';

describe('Log Parser & Slicer', () => {
  it('should strip ANSI escape sequences and GitHub timestamps', () => {
    const raw = '2026-11-03T12:00:00.000Z \u001b[31mFAIL\u001b[0m src/test.spec.ts';
    const cleaned = stripAnsiAndRunnerNoise(raw);
    expect(cleaned).toBe('FAIL src/test.spec.ts');
  });

  it('should strip GitHub runner noise markers ##[group]', () => {
    const raw = '##[group]Run test\nRunning tests...\n##[endgroup]';
    const cleaned = stripAnsiAndRunnerNoise(raw);
    expect(cleaned).not.toContain('##[group]');
    expect(cleaned).not.toContain('##[endgroup]');
    expect(cleaned).toContain('Running tests...');
  });

  it('should slice Jest/Vitest failure logs and detect test identifier & exit code', () => {
    const result = sliceFailedStepLog(SAMPLE_RAW_LOGS.jest_assertion_fail);
    expect(result.detectedFramework).toBe('jest');
    expect(result.detectedExitCode).toBe(1);
    expect(result.detectedTestIdentifier).toContain('Authentication Service > should verify valid signed JWT token');
    expect(result.highlightedLines.length).toBeGreaterThan(0);
    expect(result.cleanedSnippet).toContain('AssertionError: expected');
  });

  it('should detect Docker OOM exit code 137', () => {
    const result = sliceFailedStepLog(SAMPLE_RAW_LOGS.docker_runner_oom);
    expect(result.detectedExitCode).toBe(137);
    expect(result.cleanedSnippet).toContain('JavaScript heap out of memory');
  });
});
