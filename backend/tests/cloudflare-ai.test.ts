/**
 * Cloudflare Workers AI Integration & Free Tier Test Suite
 *
 * Verifies:
 * 1. Safe JSON extraction and Markdown fence stripping (extractAndParseJson)
 * 2. Vector dimension projection (768 -> 1536 unit norm) for PostgreSQL pgvector compatibility
 * 3. Direct Cloudflare Workers AI REST API execution
 * 4. Cloudflare Worker Gateway AI Route execution (/api/ai/diagnose)
 * 5. Single-provider isolation (no cross-provider failover on error)
 * 6. Permanent vs transient HTTP error handling (401 fails fast, 429 retries)
 * 7. Cloudflare embedding generation via @cf/baai/bge-base-en-v1.5
 * 8. Budget controller free-tier settlement ($0.0000 actual cost)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  callCloudflareLlm,
  extractAndParseJson,
  synthesizeDiagnosis,
  DiagnosisContext,
  DiagnosisOutputSchema,
} from '../src/lib/ai/diagnose.js';
import {
  projectTo1536Dimensions,
  generateEmbedding,
  computeCosineSimilarity,
  EMBEDDING_DIMENSION,
} from '../src/lib/ai/embeddings.js';
import { AiBudgetController } from '../src/lib/ai/budget-controller.js';

const VALID_SAMPLE_DIAGNOSIS = {
  error_category: 'build_compile',
  summary: 'TypeScript compiler failed due to missing type declaration in build pipeline.',
  root_cause_clues: 'Cannot find module "@acme/core" or its corresponding type declarations.',
  confirmed_observations: [
    'Exit code 2 emitted by tsc during build step',
    'Failing line references src/index.ts line 14',
  ],
  alternative_hypotheses: [
    'Dependencies were installed without devDependencies enabled',
  ],
  confidence: {
    level: 'high',
    score: 95,
    reasoning: 'Explicit compiler diagnostic TS2307 observed directly in log output.',
  },
  likely_flaky_test: {
    test_name: 'N/A',
    is_likely_flaky: false,
    reasoning: 'Deterministic build compilation error, not a test execution failure.',
  },
  relevant_log_lines: [
    { line_number: 14, content: 'src/index.ts:14:26 - error TS2307: Cannot find module @acme/core', explanation: 'Missing module error' },
    { line_number: 15, content: '14 import { helper } from "@acme/core";', explanation: 'Source statement' },
    { line_number: 16, content: 'Found 1 error in src/index.ts:14', explanation: 'Compiler summary' },
  ],
  suggested_next_check: 'Verify npm workspace configuration and build dependencies before building consumer packages.',
  verification_steps: [
    'Run npm run build:packages prior to application compilation',
    'Verify @acme/core exists in node_modules',
  ],
  local_repro_command: 'npm run build',
  uncertainty_warnings: [],
};

const SAMPLE_CONTEXT: DiagnosisContext = {
  workflowName: 'CI',
  jobName: 'build',
  stepName: 'compile',
  exitCode: 2,
  commitSha: 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4',
  modifiedFiles: ['src/index.ts'],
  historicalStats: {
    totalOccurrences: 1,
    uniquePrsAffected: 1,
    sameShaRetryPasses: 0,
    computedFlakinessScore: 0,
  },
  slicedLogSnippet: '[L14] src/index.ts:14:26 - error TS2307: Cannot find module @acme/core\n[L15] 14 import { helper } from "@acme/core";\n[L16] Found 1 error in src/index.ts:14',
};

describe('Cloudflare Workers AI & Free Tier Architecture', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.AI_PROVIDER;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_WORKER_AI_URL;
    delete process.env.AI_MODEL;
    delete process.env.AI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('1. JSON Parsing & Code Fence Normalization', () => {
    it('parses pure unadorned JSON correctly', () => {
      const json = JSON.stringify({ hello: 'world', count: 42 });
      expect(extractAndParseJson(json)).toEqual({ hello: 'world', count: 42 });
    });

    it('strips ```json code fences accurately', () => {
      const fenced = `\`\`\`json\n${JSON.stringify({ key: 'value' })}\n\`\`\``;
      expect(extractAndParseJson(fenced)).toEqual({ key: 'value' });
    });

    it('strips plain ``` code fences accurately', () => {
      const fenced = `\`\`\`\n${JSON.stringify({ status: 'ok' })}\n\`\`\``;
      expect(extractAndParseJson(fenced)).toEqual({ status: 'ok' });
    });

    it('throws descriptive error on malformed or empty input', () => {
      expect(() => extractAndParseJson('')).toThrow('Empty or non-string response');
      expect(() => extractAndParseJson('Not valid JSON at all')).toThrow();
    });
  });

  describe('2. Vector Projection for PostgreSQL pgvector(1536) Compatibility', () => {
    it('projects a 768-dim vector to a 1536-dim unit vector', () => {
      // 768-dim input typical of @cf/baai/bge-base-en-v1.5
      const raw768 = new Array(768).fill(0.05);
      const projected = projectTo1536Dimensions(raw768);

      expect(projected.length).toBe(EMBEDDING_DIMENSION);
      expect(projected.length).toBe(1536);

      // Verify the zero-padding from index 768 to 1535
      for (let i = 768; i < 1536; i++) {
        expect(projected[i]).toBe(0);
      }

      // Verify L2 unit norm = 1.0 (within float tolerance)
      const norm = Math.sqrt(projected.reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 3);
    });

    it('preserves angular similarity after projection', () => {
      const v1 = new Array(768).fill(0.1);
      const v2 = new Array(768).fill(0.1);
      v2[0] = 0.5; // slight perturbation

      const proj1 = projectTo1536Dimensions(v1);
      const proj2 = projectTo1536Dimensions(v2);

      const sim = computeCosineSimilarity(proj1, proj2);
      expect(sim).toBeGreaterThan(0.95);
      expect(sim).toBeLessThanOrEqual(1.0);
    });
  });

  describe('3. Direct Cloudflare Workers AI REST API Execution', () => {
    it('calls Cloudflare AI endpoint and populates zero-cost telemetry', async () => {
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toBe(
          'https://api.cloudflare.com/client/v4/accounts/test-account-123/ai/run/@cf/meta/llama-3.2-3b-instruct'
        );
        const headers = (init?.headers as Record<string, string>) || {};
        expect(headers['Authorization']).toBe('Bearer test-token-xyz');

        return new Response(
          JSON.stringify({
            success: true,
            result: {
              response: JSON.stringify(VALID_SAMPLE_DIAGNOSIS),
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await callCloudflareLlm(SAMPLE_CONTEXT, {
        accountId: 'test-account-123',
        apiToken: 'test-token-xyz',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.error_category).toBe('build_compile');
      expect(result.telemetry?.provider).toBe('cloudflare');
      expect(result.telemetry?.model).toBe('@cf/meta/llama-3.2-3b-instruct');
      expect(result.telemetry?.costUsd).toBe(0.0000);
      expect(result.telemetry?.isFallback).toBe(false);
      expect(DiagnosisOutputSchema.safeParse(result).success).toBe(true);
    });

    it('fails fast on permanent 401 authentication error without retries', async () => {
      let callCount = 0;
      const fetchMock = vi.fn(async () => {
        callCount++;
        return new Response(
          JSON.stringify({ success: false, errors: [{ message: 'Invalid API Token' }] }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        callCloudflareLlm(
          SAMPLE_CONTEXT,
          { accountId: 'acc', apiToken: 'bad-token' },
          5000,
          { maxRetries: 3, initialDelayMs: 10, maxDelayMs: 50, overallDeadlineMs: 5000 }
        )
      ).rejects.toThrow(/permanent authentication\/client error \(401\)/);

      // Must NOT retry 401 errors
      expect(callCount).toBe(1);
    });

    it('retries on transient 429 rate limit errors with exponential backoff', async () => {
      let callCount = 0;
      const fetchMock = vi.fn(async () => {
        callCount++;
        if (callCount < 2) {
          return new Response('Rate limit reached', {
            status: 429,
            headers: { 'Retry-After': '1' },
          });
        }
        return new Response(
          JSON.stringify({
            success: true,
            result: { response: JSON.stringify(VALID_SAMPLE_DIAGNOSIS) },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await callCloudflareLlm(
        SAMPLE_CONTEXT,
        { accountId: 'acc', apiToken: 'tok' },
        5000,
        { maxRetries: 2, initialDelayMs: 10, maxDelayMs: 50, overallDeadlineMs: 5000 }
      );

      expect(callCount).toBe(2);
      expect(result.error_category).toBe('build_compile');
    });
  });

  describe('4. Cloudflare Worker Edge Gateway Route Execution', () => {
    it('executes via worker gateway URL endpoint /api/ai/diagnose', async () => {
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).toBe('https://hopper-edge.example.com/api/ai/diagnose');
        const body = JSON.parse(init?.body as string);
        expect(body.model).toBe('@cf/meta/llama-3.2-3b-instruct');
        expect(body.messages.length).toBe(2);

        return new Response(
          JSON.stringify({
            result: {
              response: JSON.stringify(VALID_SAMPLE_DIAGNOSIS),
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await callCloudflareLlm(SAMPLE_CONTEXT, {
        workerAiUrl: 'https://hopper-edge.example.com',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.error_category).toBe('build_compile');
      expect(result.telemetry?.provider).toBe('cloudflare');
    });
  });

  describe('5. Single-Provider Invariant & Fallback Behavior', () => {
    it('falls back strictly to deterministic diagnosis when Cloudflare fails, never calling Anthropic/OpenAI', async () => {
      process.env.AI_PROVIDER = 'cloudflare';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acc-123';
      process.env.CLOUDFLARE_API_TOKEN = 'tok-123';
      process.env.ANTHROPIC_API_KEY = 'sk-ant-should-never-be-called';
      process.env.OPENAI_API_KEY = 'sk-proj-should-never-be-called';

      const fetchMock = vi.fn(async (url: string) => {
        if (url.includes('anthropic.com') || url.includes('openai.com')) {
          throw new Error('VIOLATION: Single-provider invariant breached; third-party provider invoked!');
        }
        // Cloudflare returns 500 server error
        return new Response('Cloudflare edge worker temporary error', { status: 500 });
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await synthesizeDiagnosis(SAMPLE_CONTEXT, {
        timeoutMs: 1000,
        retryConfig: { maxRetries: 1, initialDelayMs: 10, maxDelayMs: 20, overallDeadlineMs: 500 },
      });

      expect(result.telemetry?.provider).toBe('deterministic');
      expect(result.telemetry?.isFallback).toBe(true);
      expect(result.telemetry?.fallbackReason).toContain('Cloudflare Workers AI provider error');
    });

    it('returns deterministic diagnosis if Cloudflare credentials are missing', async () => {
      process.env.AI_PROVIDER = 'cloudflare';
      // Missing credentials

      const result = await synthesizeDiagnosis(SAMPLE_CONTEXT);
      expect(result.telemetry?.provider).toBe('deterministic');
      expect(result.telemetry?.isFallback).toBe(true);
      expect(result.telemetry?.fallbackReason).toContain('No valid CLOUDFLARE_ACCOUNT_ID');
    });
  });

  describe('6. Cloudflare Semantic Embeddings Generation', () => {
    it('generates 1536-dim normalized vector via Cloudflare Workers AI API', async () => {
      const raw768 = new Array(768).fill(0.08);
      const fetchMock = vi.fn(async (url: string) => {
        expect(url).toContain('@cf/baai/bge-base-en-v1.5');
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              data: [raw768],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });
      vi.stubGlobal('fetch', fetchMock);

      const embedding = await generateEmbedding('TypeScript compiler error TS2307', {
        provider: 'cloudflare',
        accountId: 'acc-123',
        apiKey: 'tok-123',
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(embedding.length).toBe(1536);
      const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 3);
    });
  });

  describe('7. Budget Controller Free-Tier Settlement', () => {
    it('reserves and settles $0.0000 actual cost for Cloudflare Workers AI', async () => {
      const controller = new AiBudgetController();

      const reservation = await controller.reserveBudget({
        idempotencyKey: `cf_test_${Date.now()}`,
        provider: 'cloudflare',
        model: '@cf/meta/llama-3.2-3b-instruct',
      });

      expect(reservation.allowed).toBe(true);
      expect(reservation.reservedAmountUsd).toBe(0.0001); // nominal safety reservation

      await controller.markSubmitted(reservation.reservationId!);

      const actualCost = await controller.settleReservation({
        reservationId: reservation.reservationId!,
        promptTokens: 2400,
        completionTokens: 450,
      });

      expect(actualCost).toBe(0.0000); // Cloudflare free tier
    });
  });
});
