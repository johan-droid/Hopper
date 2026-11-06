/**
 * Provider Reliability & Single-Provider Resilience Test Suite (Phase 16R.1)
 *
 * Verifies:
 * - Single-provider isolation (no cross-provider failover)
 * - Provider timeout and overall deadline cancellation
 * - Retry-After header parsing and enforcement
 * - Exponential backoff delays
 * - Immediate exit on permanent authentication errors (401, 403, 400)
 * - Retry exhaustion recovery
 * - Deterministic fallback metadata preservation (no silent fake success)
 * - Duplicate report persistence idempotency
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  synthesizeDiagnosis,
  parseRetryAfterHeader,
  isPermanentHttpError,
  DiagnosisContext,
} from '../src/lib/ai/diagnose.js';
import { DiagnosticReportRepository } from '../src/db/repositories/diagnostic-report.repository.js';
import { DatabaseExecutor, QueryResultLike } from '../src/db/client.js';

describe('AI Provider Reliability & Single-Provider Resilience (Phase 16R.1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AI_PROVIDER;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_API_KEY;
  });

  const sampleContext: DiagnosisContext = {
    workflowName: 'CI',
    jobName: 'Test',
    stepName: 'vitest',
    exitCode: 1,
    commitSha: 'c0ffee112233',
    modifiedFiles: ['src/auth/jwt.ts'],
    historicalStats: {
      totalOccurrences: 2,
      uniquePrsAffected: 1,
      sameShaRetryPasses: 0,
      computedFlakinessScore: 0,
    },
    slicedLogSnippet: '[L10] AssertionError: expected 200 to equal 401\n[L11] at src/auth/jwt.ts:45:10',
  };

  describe('Retry-After Header & Error Classification Utilities', () => {
    it('parses numeric seconds from Retry-After header correctly', () => {
      expect(parseRetryAfterHeader('120')).toBe(120000);
      expect(parseRetryAfterHeader('5')).toBe(5000);
      expect(parseRetryAfterHeader('0')).toBe(0);
      expect(parseRetryAfterHeader('')).toBeNull();
      expect(parseRetryAfterHeader(null)).toBeNull();
      expect(parseRetryAfterHeader(undefined)).toBeNull();
    });

    it('parses HTTP date format from Retry-After header correctly', () => {
      const futureDate = new Date(Date.now() + 60000).toUTCString();
      const delay = parseRetryAfterHeader(futureDate);
      expect(delay).toBeGreaterThan(50000);
      expect(delay).toBeLessThanOrEqual(61000);

      // Past date returns 0
      const pastDate = new Date(Date.now() - 60000).toUTCString();
      expect(parseRetryAfterHeader(pastDate)).toBe(0);
    });

    it('classifies permanent vs transient HTTP errors accurately', () => {
      // Permanent errors (never retry)
      expect(isPermanentHttpError(400)).toBe(true);
      expect(isPermanentHttpError(401)).toBe(true);
      expect(isPermanentHttpError(403)).toBe(true);
      expect(isPermanentHttpError(404)).toBe(true);
      expect(isPermanentHttpError(422)).toBe(true);

      // Transient errors (retryable with backoff)
      expect(isPermanentHttpError(429)).toBe(false);
      expect(isPermanentHttpError(500)).toBe(false);
      expect(isPermanentHttpError(502)).toBe(false);
      expect(isPermanentHttpError(503)).toBe(false);
      expect(isPermanentHttpError(504)).toBe(false);
    });
  });

  describe('Single-Provider Isolation Policy', () => {
    it('strictly avoids secondary-provider chaining when Anthropic fails', async () => {
      process.env.AI_PROVIDER = 'anthropic';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
      process.env.OPENAI_API_KEY = 'sk-proj-test-key-should-never-be-called';

      let openAiCalled = false;
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('openai.com')) {
          openAiCalled = true;
          return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 });
        }
        // Anthropic fails with 500
        return new Response(JSON.stringify({ error: { message: 'Anthropic internal outage' } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      const diagnosis = await synthesizeDiagnosis(sampleContext);
      expect(diagnosis).toBeDefined();
      // Must NOT fail over to OpenAI!
      expect(openAiCalled).toBe(false);
      // Must fall back to deterministic synthesis with explicit fallback flag
      expect(diagnosis.telemetry?.isFallback).toBe(true);
      expect(diagnosis.telemetry?.fallbackReason).toContain('Anthropic provider error');
    });

    it('strictly avoids cross-provider failover when OpenAI is configured and fails', async () => {
      process.env.AI_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-proj-test-key';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-should-never-be-called';

      let anthropicCalled = false;
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('anthropic.com')) {
          anthropicCalled = true;
          return new Response(JSON.stringify({ content: [{ text: '{}' }] }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: { message: 'OpenAI internal error' } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      const diagnosis = await synthesizeDiagnosis(sampleContext);
      expect(diagnosis).toBeDefined();
      // Must NOT fail over to Anthropic!
      expect(anthropicCalled).toBe(false);
      expect(diagnosis.telemetry?.isFallback).toBe(true);
      expect(diagnosis.telemetry?.fallbackReason).toContain('OpenAI provider error');
    });
  });

  describe('Bounded Retries, Deadlines & Permanent Error Handling', () => {
    it('immediately aborts and never retries permanent authentication failures (HTTP 401)', async () => {
      process.env.AI_PROVIDER = 'anthropic';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-invalid-revoked-key';

      let callCount = 0;
      const fetchMock = vi.fn().mockImplementation(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      const diagnosis = await synthesizeDiagnosis(sampleContext);
      expect(diagnosis).toBeDefined();
      // Exactly ONE attempt made! No retries on 401.
      expect(callCount).toBe(1);
      expect(diagnosis.telemetry?.isFallback).toBe(true);
      expect(diagnosis.telemetry?.fallbackReason).toContain('permanent authentication/client error (401)');
    });

    it('immediately aborts on HTTP 403 Forbidden without retrying', async () => {
      process.env.AI_PROVIDER = 'anthropic';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-forbidden-key';

      let callCount = 0;
      const fetchMock = vi.fn().mockImplementation(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: { message: 'Forbidden' } }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      const diagnosis = await synthesizeDiagnosis(sampleContext);
      expect(diagnosis).toBeDefined();
      // Exactly ONE attempt made!
      expect(callCount).toBe(1);
      expect(diagnosis.telemetry?.isFallback).toBe(true);
      expect(diagnosis.telemetry?.fallbackReason).toContain('permanent authentication/client error (403)');
    });

    it('retries on HTTP 429 with backoff and honors Retry-After header', async () => {
      process.env.AI_PROVIDER = 'anthropic';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-valid-test-key';

      let callCount = 0;
      const fetchMock = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // First attempt returns 429 with a small Retry-After
          return new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '0',
            },
          });
        }
        // Second attempt succeeds
        return new Response(
          JSON.stringify({
            content: [
              {
                text: JSON.stringify({
                  error_category: 'test_assertion',
                  root_cause_clues: 'JWT expiration comparison inverted in verifyToken.',
                  likely_flaky_test: { test_name: 'vitest', is_likely_flaky: false, reasoning: 'Reproducible assertion failure.' },
                  relevant_log_lines: [
                    { line_number: 10, content: 'AssertionError: expected 200 to equal 401', explanation: 'Failed assertion' },
                    { line_number: 11, content: 'at src/auth/jwt.ts:45:10', explanation: 'Stack frame' },
                    { line_number: 12, content: 'Process completed with exit code 1', explanation: 'Exit' },
                  ],
                  suggested_next_check: 'Inspect JWT expiration logic in src/auth/jwt.ts',
                  local_repro_command: 'npx vitest run src/auth/jwt.ts',
                }),
              },
            ],
            usage: { input_tokens: 300, output_tokens: 150 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });
      vi.stubGlobal('fetch', fetchMock);

      const diagnosis = await synthesizeDiagnosis(sampleContext);
      expect(diagnosis).toBeDefined();
      expect(callCount).toBe(2);
      expect(diagnosis.telemetry?.isFallback).toBe(false);
      expect(diagnosis.telemetry?.provider).toBe('anthropic');
      expect(diagnosis.telemetry?.promptTokens).toBe(300);
      expect(diagnosis.telemetry?.completionTokens).toBe(150);
    });

    it('falls back cleanly when retry attempts are exhausted', async () => {
      process.env.AI_PROVIDER = 'anthropic';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-valid-test-key';

      let callCount = 0;
      const fetchMock = vi.fn().mockImplementation(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: { message: 'Rate limit persisted' } }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '0' },
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      const diagnosis = await synthesizeDiagnosis(sampleContext, {
        retryConfig: { maxRetries: 2, initialDelayMs: 5 },
      });

      expect(diagnosis).toBeDefined();
      // Initial attempt (0) + 2 retries (1, 2) = 3 total attempts
      expect(callCount).toBe(3);
      expect(diagnosis.telemetry?.isFallback).toBe(true);
      expect(diagnosis.telemetry?.fallbackReason).toContain('persisted after 2 retries');
    });

    it('enforces overall deadline and aborts without unbounded delays', async () => {
      process.env.AI_PROVIDER = 'anthropic';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-valid-test-key';

      const fetchMock = vi.fn().mockImplementation(async () => {
        // Return 429 asking to wait 30 seconds
        return new Response(JSON.stringify({ error: { message: 'Rate limited' } }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '30' },
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      // Overall deadline is 100ms; Retry-After is 30s
      const diagnosis = await synthesizeDiagnosis(sampleContext, {
        timeoutMs: 100,
        retryConfig: { overallDeadlineMs: 100 },
      });

      expect(diagnosis).toBeDefined();
      expect(diagnosis.telemetry?.isFallback).toBe(true);
      expect(diagnosis.telemetry?.fallbackReason).toContain('Overall AI request deadline of 100ms exceeded');
    });
  });

  describe('Duplicate & Partial Persistence Safety', () => {
    it('prevents duplicate reports and performs atomic updates on conflict', async () => {
      let insertCount = 0;
      let onConflictClausePresent = 0;

      const mockExecutor: DatabaseExecutor = {
        query: async <T = any>(sql: string, params: any[] = []): Promise<QueryResultLike<T>> => {
          if (sql.includes('INSERT INTO diagnostic_reports')) {
            insertCount++;
            if (sql.includes('ON CONFLICT (failure_id)') && sql.includes('DO UPDATE SET')) {
              onConflictClausePresent++;
            }
          }
          return {
            rows: [
              {
                id: 'report-123',
                failure_id: params[0],
                root_cause_clues: params[1],
                llm_model_used: params[9],
              } as T,
            ],
            rowCount: 1,
          };
        },
      };

      const repo = new DiagnosticReportRepository(mockExecutor);

      // First delivery
      const report1 = await repo.create({
        failureId: 'failure-abc-123',
        rootCauseClues: 'First clue',
        relevantLogLines: [{ line_number: 1, content: 'Error', explanation: 'Failed' }],
        suggestedNextCheck: 'Check JWT token',
        llmModelUsed: 'claude-3-5-haiku-20241022',
      });

      // Duplicate delivery (retry of the same webhook)
      const report2 = await repo.create({
        failureId: 'failure-abc-123',
        rootCauseClues: 'Updated clue',
        relevantLogLines: [{ line_number: 1, content: 'Error', explanation: 'Failed' }],
        suggestedNextCheck: 'Check JWT token updated',
        llmModelUsed: 'claude-3-5-haiku-20241022',
      });

      expect(report1.id).toBe('report-123');
      expect(report2.id).toBe('report-123');
      expect(insertCount).toBe(2);
      expect(onConflictClausePresent).toBe(2);
    });
  });
});

