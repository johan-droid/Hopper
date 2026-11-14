import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGroqAdapter } from '../src/lib/ai/gateway/providers/groq.js';
import { createNvidiaNimAdapter } from '../src/lib/ai/gateway/providers/nvidia-nim.js';
import { ProviderError, GatewayExhaustedError } from '../src/lib/ai/gateway/contracts.js';
import { CircuitBreaker } from '../src/lib/ai/gateway/resilience/circuit-breaker.js';
import { Bulkhead } from '../src/lib/ai/gateway/resilience/bulkhead.js';
import { rankModelsForTask } from '../src/lib/ai/gateway/model-router.js';
import { AiGateway } from '../src/lib/ai/gateway/gateway.js';
import { AgentOrchestrator } from '../src/lib/ai/gateway/orchestration/agent-orchestrator.js';
import { OutputValidator } from '../src/lib/ai/gateway/orchestration/output-validator.js';
import { ToolRegistry } from '../src/lib/ai/gateway/orchestration/tool-registry.js';
import { WorkflowState } from '../src/lib/ai/gateway/orchestration/workflow-state.js';
import type { DiagnosisContext } from '../src/lib/ai/diagnose.js';

describe('Hopper AI Gateway & Orchestration Architecture', () => {
  const sampleDiagnosis = {
    error_category: 'test_assertion',
    summary: 'Vitest assertion failed on status code',
    root_cause_clues: 'Endpoint returned 401 Unauthorized instead of 200 OK.',
    confirmed_observations: ['Failed at line 12 with status code 401.'],
    alternative_hypotheses: ['Token expired prematurely.'],
    confidence: {
      level: 'high',
      score: 90,
      reasoning: 'Explicit assertion error in test stack trace.',
    },
    likely_flaky_test: {
      test_name: 'Auth > login > valid user returns 200',
      is_likely_flaky: false,
      reasoning: 'Deterministic response code mismatch.',
    },
    relevant_log_lines: [
      { line_number: 10, content: 'FAIL src/auth/login.spec.ts', explanation: 'Test file failure header' },
      { line_number: 11, content: 'AssertionError: expected 401 to be 200', explanation: 'Failed assertion comparison' },
      { line_number: 12, content: 'at src/auth/login.spec.ts:45:12', explanation: 'Stack trace frame' },
    ],
    suggested_next_check: 'Verify auth middleware token validation logic.',
    verification_steps: ['npm test src/auth/login.spec.ts'],
    local_repro_command: 'npx vitest run src/auth/login.spec.ts',
    uncertainty_warnings: [],
  };

  const sampleContext: DiagnosisContext = {
    workflowName: 'CI Workflow',
    jobName: 'test',
    stepName: 'Run Vitest',
    exitCode: 1,
    commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
    modifiedFiles: ['src/auth/login.ts'],
    historicalStats: {
      totalOccurrences: 3,
      uniquePrsAffected: 1,
      sameShaRetryPasses: 0,
      computedFlakinessScore: 10,
    },
    slicedLogSnippet: '[L10] FAIL src/auth/login.spec.ts\n[L11] AssertionError: expected 401 to be 200\n[L12] at src/auth/login.spec.ts:45:12',
  };

  const mockTelemetry = { record: vi.fn(), recent: vi.fn().mockReturnValue([]) };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('Groq Adapter', () => {
    it('executes request against Groq endpoint and returns structured output', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(sampleDiagnosis) } }],
            usage: { prompt_tokens: 120, completion_tokens: 80 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
      vi.stubGlobal('fetch', fetchMock);

      const adapter = createGroqAdapter({ apiKey: 'gsk_test_groq_key' });
      const result = await adapter.execute({
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'user', content: 'Diagnose this failure' }],
        maxTokens: 1000,
        temperature: 0,
        jsonMode: true,
        timeoutMs: 5000,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const call = fetchMock.mock.calls[0];
      expect(call[0]).toBe('https://api.groq.com/openai/v1/chat/completions');
      expect(call[1].headers.authorization).toBe('Bearer gsk_test_groq_key');
      expect(result.model).toBe('openai/gpt-oss-120b');
      expect(result.usage.promptTokens).toBe(120);
      expect(result.usage.completionTokens).toBe(80);
      expect(JSON.parse(result.content)).toEqual(sampleDiagnosis);
    });

    it('classifies HTTP 429 rate limit with Retry-After header', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Rate limit reached' } }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '5' },
        })
      );
      vi.stubGlobal('fetch', fetchMock);

      const adapter = createGroqAdapter({ apiKey: 'gsk_test_groq_key' });
      await expect(
        adapter.execute({
          model: 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: 'Hello' }],
          maxTokens: 1000,
          timeoutMs: 5000,
        })
      ).rejects.toMatchObject({
        errorClass: 'rate_limit',
        retryAfterMs: 5000,
      });
    });

    it('classifies HTTP 500 server errors as retryable server error', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response('Internal Server Error', { status: 500 })
      );
      vi.stubGlobal('fetch', fetchMock);

      const adapter = createGroqAdapter({ apiKey: 'gsk_test_groq_key' });
      await expect(
        adapter.execute({
          model: 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: 'Hello' }],
          maxTokens: 1000,
          timeoutMs: 5000,
        })
      ).rejects.toMatchObject({
        errorClass: 'server',
        status: 500,
      });
    });

    it('classifies HTTP 401 errors as permanent non-retryable auth errors', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      vi.stubGlobal('fetch', fetchMock);

      const adapter = createGroqAdapter({ apiKey: 'bad_key' });
      await expect(
        adapter.execute({
          model: 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: 'Hello' }],
          maxTokens: 1000,
          timeoutMs: 5000,
        })
      ).rejects.toMatchObject({
        errorClass: 'auth',
        status: 401,
      });
    });
  });

  describe('NVIDIA NIM Adapter', () => {
    it('executes request against NVIDIA NIM hosted catalog endpoint', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(sampleDiagnosis) } }],
            usage: { prompt_tokens: 200, completion_tokens: 150 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
      vi.stubGlobal('fetch', fetchMock);

      const adapter = createNvidiaNimAdapter({ apiKey: 'nvapi-test-key' });
      const result = await adapter.execute({
        model: 'nvidia/nemotron-3-super-120b-a12b',
        messages: [{ role: 'user', content: 'Diagnose this failure' }],
        maxTokens: 1000,
        temperature: 0,
        timeoutMs: 5000,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const call = fetchMock.mock.calls[0];
      expect(call[0]).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
      expect(call[1].headers.authorization).toBe('Bearer nvapi-test-key');
      expect(result.model).toBe('nvidia/nemotron-3-super-120b-a12b');
      expect(result.usage.promptTokens).toBe(200);
      expect(result.usage.completionTokens).toBe(150);
    });

    it('classifies 404 model not found as non-retryable model_not_found', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Model not supported' } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      vi.stubGlobal('fetch', fetchMock);

      const adapter = createNvidiaNimAdapter({ apiKey: 'nvapi-test-key' });
      await expect(
        adapter.execute({
          model: 'non-existent-model',
          messages: [{ role: 'user', content: 'Test' }],
          maxTokens: 1000,
          timeoutMs: 5000,
        })
      ).rejects.toMatchObject({
        errorClass: 'model_not_found',
        status: 404,
      });
    });
  });

  describe('Model Router & Ranking', () => {
    it('ranks available models for a given task role', () => {
      const ranked = rankModelsForTask({
        taskType: 'failure.diagnose',
        complexity: 'heavy',
        env: {
          GROQ_API_KEY: 'gsk_test',
          NVIDIA_NIM_API_KEY: 'nvapi_test',
        },
      });

      expect(ranked.length).toBeGreaterThan(0);
      expect(ranked[0].model.roles).toContain('deep_reasoning');
      expect(ranked[0].score).toBeGreaterThan(0);
    });

    it('filters out disabled providers when configured via environment', () => {
      const ranked = rankModelsForTask({
        taskType: 'failure.classify',
        complexity: 'light',
        env: {
          GROQ_API_KEY: 'gsk_test',
          NVIDIA_NIM_API_KEY: 'nvapi_test',
          AI_ENABLE_GROQ: 'false',
          AI_ENABLE_NVIDIA_NIM: 'true',
        },
      });

      const groqModels = ranked.filter((r) => r.model.provider === 'groq');
      expect(groqModels).toHaveLength(0);
      const nimModels = ranked.filter((r) => r.model.provider === 'nvidia-nim');
      expect(nimModels.length).toBeGreaterThan(0);
    });
  });

  describe('Resilience: Circuit Breaker', () => {
    it('transitions from CLOSED to OPEN after consecutive failures and enters HALF-OPEN after cooldown', () => {
      let currentTime = 1000;
      const breaker = new CircuitBreaker('groq', {
        failureThreshold: 3,
        openMs: 5000,
        now: () => currentTime,
      });

      expect(breaker.canExecute()).toBe(true);
      expect(breaker.snapshot().state).toBe('closed');

      // 3 consecutive failures
      breaker.onFailure();
      breaker.onFailure();
      expect(breaker.canExecute()).toBe(true);
      breaker.onFailure();

      // Breaker is now OPEN
      expect(breaker.snapshot().state).toBe('open');
      expect(breaker.canExecute()).toBe(false);
      expect(breaker.tryAcquire()).toBe(false);

      // Advance time beyond openMs cooldown (5000ms)
      currentTime += 6000;
      expect(breaker.canExecute()).toBe(true);
      expect(breaker.tryAcquire()).toBe(true);
      expect(breaker.snapshot().state).toBe('half_open');

      // Success resets to CLOSED
      breaker.onSuccess();
      expect(breaker.snapshot().state).toBe('closed');
      expect(breaker.snapshot().consecutiveFailures).toBe(0);
    });
  });

  describe('Resilience: Bulkhead Concurrency Limiter', () => {
    it('permits calls within limit and tracks active concurrency', async () => {
      const bulkhead = new Bulkhead('groq', 2);
      expect(bulkhead.activeCount).toBe(0);

      let releaseTask1: () => void = () => {};
      const promise1 = bulkhead.run(
        () =>
          new Promise<string>((resolve) => {
            releaseTask1 = () => resolve('task 1 done');
          })
      );

      expect(bulkhead.activeCount).toBe(1);
      releaseTask1();
      const res1 = await promise1;
      expect(res1).toBe('task 1 done');
      expect(bulkhead.activeCount).toBe(0);
    });
  });

  describe('AI Gateway Multi-Tier Failover', () => {
    it('fails over from Groq to NVIDIA NIM when Groq fails', async () => {
      let groqCalled = false;
      let nvidiaCalled = false;

      const mockGroqAdapter = {
        execute: vi.fn().mockImplementation(async () => {
          groqCalled = true;
          throw new ProviderError({
            message: 'Groq 503 Service Unavailable',
            provider: 'groq',
            model: 'openai/gpt-oss-120b',
            errorClass: 'server',
          });
        }),
      };

      const mockNvidiaAdapter = {
        execute: vi.fn().mockImplementation(async () => {
          nvidiaCalled = true;
          return {
            content: JSON.stringify(sampleDiagnosis),
            model: 'nvidia/nemotron-3-super-120b-a12b',
            usage: { promptTokens: 150, completionTokens: 90, estimated: false },
            latencyMs: 120,
          };
        }),
      };

      const gateway = new AiGateway({
        env: {
          AI_ROUTING_MODE: 'failover',
          GROQ_API_KEY: 'gsk_test',
          NVIDIA_NIM_API_KEY: 'nvapi_test',
          AI_ENABLE_PAID_FALLBACK: 'false',
        },
        adapters: {
          groq: mockGroqAdapter as any,
          'nvidia-nim': mockNvidiaAdapter as any,
        },
        telemetry: mockTelemetry,
      });

      const result = await gateway.execute('failure.diagnose', sampleContext, { skipBudget: true });

      expect(groqCalled).toBe(true);
      expect(nvidiaCalled).toBe(true);
      expect(result.provider).toBe('nvidia-nim');
      expect(result.model).toBe('nvidia/nemotron-3-super-120b-a12b');
      expect(result.failoverPath).toContain('groq');
      expect(result.failoverPath).toContain('nvidia-nim');
    });

    it('invokes deterministic fallback without throwing when all external providers fail', async () => {
      const mockGroqAdapter = {
        execute: vi.fn().mockRejectedValue(
          new ProviderError({
            message: 'Groq unreachable',
            provider: 'groq',
            model: 'openai/gpt-oss-120b',
            errorClass: 'timeout',
          })
        ),
      };

      const mockNvidiaAdapter = {
        execute: vi.fn().mockRejectedValue(
          new ProviderError({
            message: 'NVIDIA NIM unreachable',
            provider: 'nvidia-nim',
            model: 'nvidia/nemotron-3-super-120b-a12b',
            errorClass: 'timeout',
          })
        ),
      };

      const gateway = new AiGateway({
        env: {
          GROQ_API_KEY: 'gsk_test',
          NVIDIA_NIM_API_KEY: 'nvapi_test',
          AI_ENABLE_PAID_FALLBACK: 'false',
        },
        adapters: {
          groq: mockGroqAdapter as any,
          'nvidia-nim': mockNvidiaAdapter as any,
        },
        telemetry: mockTelemetry,
      });

      const fallbackBuilder = vi.fn().mockReturnValue(sampleDiagnosis);
      const result = await gateway.execute(
        'failure.diagnose',
        sampleContext,
        { skipBudget: true },
        fallbackBuilder
      );

      expect(fallbackBuilder).toHaveBeenCalledTimes(1);
      expect(result.model).toBe('deterministic-fallback');
      expect(result.value).toEqual(sampleDiagnosis);
    });

    it('throws GatewayExhaustedError when all providers fail and no fallback is supplied', async () => {
      const mockGroqAdapter = {
        execute: vi.fn().mockRejectedValue(
          new ProviderError({
            message: 'Groq failed',
            provider: 'groq',
            model: 'openai/gpt-oss-120b',
            errorClass: 'server',
          })
        ),
      };

      const gateway = new AiGateway({
        env: {
          GROQ_API_KEY: 'gsk_test',
          AI_ENABLE_NVIDIA_NIM: 'false',
          AI_ENABLE_PAID_FALLBACK: 'false',
        },
        adapters: {
          groq: mockGroqAdapter as any,
        },
        telemetry: mockTelemetry,
      });

      await expect(
        gateway.execute('failure.diagnose', sampleContext, { skipBudget: true })
      ).rejects.toThrow(GatewayExhaustedError);
    });
  });

  describe('Agent Orchestrator (6-Stage Diagnostic Workflow)', () => {
    it('executes bounded 6-stage workflow and verifies output', async () => {
      const mockGroqAdapter = {
        execute: vi.fn().mockResolvedValue({
          content: JSON.stringify(sampleDiagnosis),
          model: 'openai/gpt-oss-120b',
          usage: { promptTokens: 300, completionTokens: 150, estimated: false },
          latencyMs: 150,
        }),
      };

      const gateway = new AiGateway({
        env: {
          GROQ_API_KEY: 'gsk_test',
          AI_ENABLE_PAID_FALLBACK: 'false',
        },
        adapters: {
          groq: mockGroqAdapter as any,
        },
        telemetry: mockTelemetry,
      });

      const orchestrator = new AgentOrchestrator(gateway);
      const output = await orchestrator.runDiagnosticWorkflow(sampleContext);

      expect(output).toBeDefined();
      expect(output.error_category).toBe('test_assertion');
      expect(output.relevant_log_lines.length).toBeGreaterThanOrEqual(3);
      expect(output.telemetry).toBeDefined();
      expect(output.telemetry?.provider).toBe('groq');
      expect(output.telemetry?.isFallback).toBe(false);
    });

    it('enforces execution bounds and falls back gracefully upon violation', async () => {
      const gateway = new AiGateway({
        telemetry: mockTelemetry,
      });

      const orchestrator = new AgentOrchestrator(gateway);
      // Impose impossibly low iteration bound of 0
      const output = await orchestrator.runDiagnosticWorkflow(sampleContext, {
        bounds: { maxIterations: 0 },
      });

      expect(output).toBeDefined();
      expect(output.telemetry?.isFallback).toBe(true);
      expect(output.telemetry?.fallbackReason).toContain('Exceeded maximum orchestration iterations');
    });
  });

  describe('Output Validator', () => {
    it('validates compliant diagnosis output', () => {
      const result = OutputValidator.validateDiagnosisOutput(
        JSON.stringify(sampleDiagnosis),
        sampleContext.slicedLogSnippet
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.validatedData?.error_category).toBe('test_assertion');
    });

    it('detects fabricated log line numbers outside of snippet range', () => {
      const fabricatedOutput = {
        ...sampleDiagnosis,
        relevant_log_lines: [
          { line_number: 9999, content: 'Fake line', explanation: 'Fabrication' },
          { line_number: 10000, content: 'Fake line 2', explanation: 'Fabrication' },
          { line_number: 10001, content: 'Fake line 3', explanation: 'Fabrication' },
        ],
      };

      const result = OutputValidator.validateDiagnosisOutput(
        JSON.stringify(fabricatedOutput),
        sampleContext.slicedLogSnippet // snippet has only ~3 lines
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('out of bounds'))).toBe(true);
    });

    it('marks malformed JSON as requiring repair', () => {
      const result = OutputValidator.validateDiagnosisOutput('{ broken json:');
      expect(result.isValid).toBe(false);
      expect(result.requiresRepair).toBe(true);
    });
  });

  describe('Tool Registry Safe Sandboxing', () => {
    it('executes safe read-only log excerpt tool with line bounds', async () => {
      const registry = new ToolRegistry();
      const result = await registry.executeTool(
        'get_sanitized_log_excerpt',
        JSON.stringify({ maxLines: 10 }),
        { workflowData: sampleContext }
      );

      expect(result.success).toBe(true);
      const data = result.result as any;
      expect(data.lineCount).toBe(3);
      expect(data.logExcerpt).toContain('<untrusted_ci_log>');
      expect(data.isUntrustedInput).toBe(true);
    });

    it('rejects unknown tools gracefully', async () => {
      const registry = new ToolRegistry();
      const result = await registry.executeTool('delete_database', '{}', {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('is not registered');
    });
  });
});
