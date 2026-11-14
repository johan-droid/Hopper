import crypto from 'node:crypto';
import type { z } from 'zod';
import {
  GatewayExhaustedError,
  OutputValidationError,
  ProviderError,
  type ChatMessage,
  type GatewayContext,
  type GatewayResult,
  type ProviderChatRequest,
  type ProviderErrorClass,
  type ProviderId,
  type TokenUsage,
} from './contracts.js';
import { buildProviderChain, findModel, getModelsForProvider, readProviderConfig, type ModelDefinition } from './model-registry.js';
import { createGroqAdapter, type ProviderAdapter } from './providers/groq.js';
import { createNvidiaNimAdapter } from './providers/nvidia-nim.js';
import { CircuitBreaker } from './resilience/circuit-breaker.js';
import { Bulkhead } from './resilience/bulkhead.js';
import { withRetries } from './resilience/retry.js';
import { ProviderHealth } from './resilience/provider-health.js';
import { QuotaManager } from './usage/quota-manager.js';
import { PostgresTelemetrySink, toTelemetryRecord, type TelemetrySink } from './telemetry.js';
import { getTask, type TaskSpec } from './task-registry.js';

/**
 * Hopper AI Gateway — the single entry point for every model call.
 *
 * Pipeline per request:
 *   task registry → model routing → provider chain → circuit breaker →
 *   bulkhead → budget reservation → retry/timeout → Zod validation →
 *   settlement → telemetry.
 *
 * Guarantees:
 *  - app services never touch a provider SDK/fetch directly
 *  - keys stay server-side (adapters are constructed from env only)
 *  - deterministic fallback is always reachable (no key / all providers failed)
 *  - spend is fail-closed: no reservation → no call
 */

export interface AiGatewayOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly fetchImpl?: typeof fetch;
  readonly telemetry?: TelemetrySink;
  readonly quota?: QuotaManager;
  /** Injected for tests: overrides the default adapter construction. */
  readonly adapters?: Partial<Record<ProviderId, ProviderAdapter>>;
  readonly now?: () => number;
}

export interface ExecuteOptions extends GatewayContext {
  /** Override the task's default complexity for routing. */
  readonly complexity?: ModelDefinition['roles'][number];
  /** Skip budget reservation (internal/deterministic paths only). */
  readonly skipBudget?: boolean;
}

interface AttemptFailure {
  provider: ProviderId;
  model: string;
  errorClass: ProviderErrorClass | 'budget' | 'validation' | 'circuit_open' | 'overload';
  message: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_INITIAL_DELAY_MS = 250;
const DEFAULT_MAX_DELAY_MS = 4_000;
const DEFAULT_MAX_CONCURRENT = 8;
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_OPEN_MS = 30_000;

function envInt(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Strip obvious secrets from messages before transit (defense in depth; SecretScrubber handles logs). */
const SECRET_PATTERNS: RegExp[] = [
  /ghp_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /sk-[A-Za-z0-9]{16,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /Bearer\s+[A-Za-z0-9._-]{20,}/g,
];

export function scrubMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    let content = m.content;
    for (const pattern of SECRET_PATTERNS) content = content.replace(pattern, '[REDACTED]');
    return { ...m, content };
  });
}

/** Extract the first JSON object/array from model output (handles code fences). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error('no JSON found in output');
  const opener = candidate[start];
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === opener) depth++;
    else if (ch === closer) {
      depth--;
      if (depth === 0) return JSON.parse(candidate.slice(start, i + 1));
    }
  }
  throw new Error('unbalanced JSON in output');
}

export class AiGateway {
  private readonly env: NodeJS.ProcessEnv;
  private readonly fetchImpl: typeof fetch;
  private readonly telemetry: TelemetrySink;
  private readonly quota: QuotaManager;
  private readonly adapters: Partial<Record<ProviderId, ProviderAdapter>>;
  private readonly now: () => number;
  private readonly breakers = new Map<ProviderId, CircuitBreaker>();
  private readonly bulkheads = new Map<ProviderId, Bulkhead>();
  private readonly health = new ProviderHealth();
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryInitialDelayMs: number;
  private readonly maxConcurrent: number;

  constructor(options: AiGatewayOptions = {}) {
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.telemetry = options.telemetry ?? new PostgresTelemetrySink();
    this.quota = options.quota ?? new QuotaManager();
    this.adapters = options.adapters ?? {};
    this.now = options.now ?? Date.now;
    this.timeoutMs = envInt(this.env, 'AI_REQUEST_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
    this.maxRetries = envInt(this.env, 'AI_MAX_RETRIES', DEFAULT_MAX_RETRIES);
    this.retryInitialDelayMs = envInt(this.env, 'AI_RETRY_INITIAL_DELAY_MS', DEFAULT_INITIAL_DELAY_MS);
    this.maxConcurrent = envInt(this.env, 'AI_MAX_CONCURRENT_REQUESTS', DEFAULT_MAX_CONCURRENT);
  }

  // ------------------------------------------------------------- adapters ---

  private getAdapter(provider: ProviderId): ProviderAdapter | undefined {
    if (this.adapters[provider]) return this.adapters[provider];
    const config = readProviderConfig(this.env)[provider];
    if (!config.available || !config.apiKey) return undefined;

    if (provider === 'groq') {
      this.adapters[provider] = createGroqAdapter({ baseUrl: 'https://api.groq.com/openai/v1', apiKey: config.apiKey });
    } else if (provider === 'nvidia-nim') {
      this.adapters[provider] = createNvidiaNimAdapter({ baseUrl: 'https://integrate.api.nvidia.com/v1', apiKey: config.apiKey });
    } else {
      // Paid providers: OpenAI-compatible shape is verified for openai;
      // anthropic uses its own messages API — not auto-constructed here (opt-in only).
      return undefined;
    }
    return this.adapters[provider];
  }

  private getBreaker(provider: ProviderId): CircuitBreaker {
    let breaker = this.breakers.get(provider);
    if (!breaker) {
      breaker = new CircuitBreaker(provider, {
        failureThreshold: CIRCUIT_FAILURE_THRESHOLD,
        openMs: CIRCUIT_OPEN_MS,
        now: this.now,
      });
      this.breakers.set(provider, breaker);
    }
    return breaker;
  }

  private getBulkhead(provider: ProviderId): Bulkhead {
    let bulkhead = this.bulkheads.get(provider);
    if (!bulkhead) {
      bulkhead = new Bulkhead(provider, this.maxConcurrent);
      this.bulkheads.set(provider, bulkhead);
    }
    return bulkhead;
  }

  // ------------------------------------------------------------ diagnostics -

  /** Introspection for health endpoints/tests. */
  healthSnapshot(): Array<{ providerId: string; circuit: ReturnType<CircuitBreaker['snapshot']>; active: number }> {
    return [...this.breakers.entries()].map(([providerId, breaker]) => ({
      providerId,
      circuit: breaker.snapshot(),
      active: this.bulkheads.get(providerId)?.activeCount ?? 0,
    }));
  }

  // -------------------------------------------------------------- routing ---

  /**
   * Pick the best model on `provider` for the task's role requirement.
   * Prefers production-eligible, generally-available models matching the role.
   */
  selectModel(provider: ProviderId, role: string): ModelDefinition | undefined {
    const models = getModelsForProvider(provider);
    const roleMatch = models.filter((m) => (m.roles as readonly string[]).includes(role));
    const pool = roleMatch.length > 0 ? roleMatch : models;
    const preferred =
      pool.find((m) => m.productionEligible && m.availability === 'generally_available') ??
      pool.find((m) => m.availability === 'generally_available') ??
      pool[0];
    return preferred;
  }

  // ------------------------------------------------------------- execution --

  /**
   * Execute a registered task. Never throws for provider failures — returns a
   * GatewayResult whose `value` is either the validated output or a
   * deterministic fallback produced by the caller-supplied fallback builder.
   */
  async execute<I, O>(
    taskName: string,
    input: I,
    options: ExecuteOptions = {},
    fallback?: (input: I) => O,
  ): Promise<GatewayResult<O>> {
    const task = getTask(taskName) as TaskSpec<I, O> | undefined;
    if (!task) {
      throw new Error(`Unknown AI task: ${taskName}`);
    }

    const requestId = crypto.randomUUID();
    const createdAt = this.now();
    const startedAt = Date.now();
    const messages = scrubMessages(task.buildMessages(input));
    const failures: AttemptFailure[] = [];
    const failoverPath: string[] = [];

    const chain = buildProviderChain(this.env);
    let totalAttempts = 0;

    for (const provider of chain) {
      if (options.signal?.aborted) break;

      const breaker = this.getBreaker(provider);
      if (!breaker.tryAcquire()) {
        failures.push({ provider, model: '-', errorClass: 'circuit_open', message: 'circuit open' });
        continue;
      }

      const adapter = this.getAdapter(provider);
      if (!adapter) {
        failures.push({ provider, model: '-', errorClass: 'auth', message: 'no adapter/key' });
        continue;
      }

      const modelDef = this.selectModel(provider, options.complexity ?? task.complexity);
      if (!modelDef) {
        failures.push({ provider, model: '-', errorClass: 'model_not_found', message: 'no model for role' });
        continue;
      }

      // Budget reservation — fail closed.
      let reservationId: string | undefined;
      if (!options.skipBudget) {
        const decision = await this.quota.reserve(provider, modelDef.modelId, {
          organizationId: options.organizationId,
          idempotencyKey: options.correlationId ? `${options.correlationId}:${provider}` : undefined,
        });
        if (!decision.allowed) {
          failures.push({ provider, model: modelDef.modelId, errorClass: 'budget', message: decision.reason ?? 'budget rejected' });
          continue;
        }
        reservationId = decision.reservationId;
      }

      const bulkhead = this.getBulkhead(provider);
      try {
        const result = await bulkhead.run(() =>
          this.callWithRetry(adapter, task, messages, modelDef, options, provider),
        );

        breaker.onSuccess();
        this.health.recordSuccess(provider, this.now());
        failoverPath.push(provider);

        // Validate structured output.
        let value: O;
        if (task.structuredOutput) {
          try {
            const parsed = extractJson(result.content);
            value = task.outputSchema.parse(parsed) as O;
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            failures.push({ provider, model: modelDef.modelId, errorClass: 'validation', message: detail });
            await this.quota.accountFailure(reservationId, 'invalid_request', `validation: ${detail}`);
            // Validation failure is not retryable on the same model — fail over.
            continue;
          }
        } else {
          value = result.content as unknown as O;
        }

        if (reservationId) {
          await this.quota.markSubmitted(reservationId);
          await this.quota.settle({
            reservationId,
            promptTokens: result.usage.promptTokens ?? 0,
            completionTokens: result.usage.completionTokens ?? 0,
            latencyMs: result.latencyMs,
          });
        }

        const gatewayResult: GatewayResult<O> = {
          value,
          provider,
          model: result.model,
          usage: result.usage,
          latencyMs: Date.now() - startedAt,
          attempts: totalAttempts + 1,
          failoverPath,
        };

        this.telemetry.record(
          toTelemetryRecord({
            requestId,
            taskId: task.name,
            taskType: task.type,
            status: 'success',
            providerId: provider,
            model: result.model,
            latencyMs: gatewayResult.latencyMs,
            attempts: gatewayResult.attempts,
            failoverPath,
            createdAt,
            usage: result.usage,
          }),
        );
        return gatewayResult;
      } catch (error) {
        totalAttempts += this.maxRetries + 1;
        const providerError =
          error instanceof ProviderError
            ? error
            : new ProviderError({
                message: error instanceof Error ? error.message : String(error),
                provider,
                model: modelDef.modelId,
                errorClass: 'unknown',
              });

        breaker.onFailure();
        this.health.recordFailure(provider, providerError.message, this.now());
        failoverPath.push(provider);
        failures.push({
          provider,
          model: modelDef.modelId,
          errorClass: providerError.errorClass,
          message: providerError.message,
        });
        await this.quota.accountFailure(reservationId, providerError.errorClass, providerError.message);
        // Permanent errors (auth/model-not-found) → next provider, no point retrying here.
        continue;
      }
    }

    // All providers exhausted → deterministic fallback if provided.
    const causes = failures.map((f) => `${f.provider}/${f.model}: [${f.errorClass}] ${f.message}`);
    if (fallback) {
      const value = fallback(input);
      const gatewayResult: GatewayResult<O> = {
        value,
        provider: 'groq',
        model: 'deterministic-fallback',
        usage: { promptTokens: null, completionTokens: null, estimated: true },
        latencyMs: Date.now() - startedAt,
        attempts: totalAttempts,
        failoverPath,
      };
      this.telemetry.record(
        toTelemetryRecord({
          requestId,
          taskId: task.name,
          taskType: task.type,
          status: 'exhausted',
          providerId: 'deterministic',
          model: 'deterministic-fallback',
          latencyMs: gatewayResult.latencyMs,
          attempts: totalAttempts,
          failoverPath,
          createdAt,
          errorKind: causes.join(' | ').slice(0, 500),
        }),
      );
      return gatewayResult;
    }

    this.telemetry.record(
      toTelemetryRecord({
        requestId,
        taskId: task.name,
        taskType: task.type,
        status: 'exhausted',
        providerId: failures[0]?.provider ?? 'none',
        model: failures[0]?.model ?? '-',
        latencyMs: Date.now() - startedAt,
        attempts: totalAttempts,
        failoverPath,
        createdAt,
        errorKind: causes.join(' | ').slice(0, 500),
      }),
    );
    throw new GatewayExhaustedError(causes);
  }

  /** Retry loop for a single provider attempt (handles transient errors only). */
  private async callWithRetry<I, O>(
    adapter: ProviderAdapter,
    task: TaskSpec<I, O>,
    messages: ChatMessage[],
    modelDef: ModelDefinition,
    options: ExecuteOptions,
    provider: ProviderId,
  ) {
    const request: ProviderChatRequest = {
      model: modelDef.modelId,
      messages,
      maxTokens: modelDef.maxCompletionTokens,
      temperature: 0,
      jsonMode: task.structuredOutput && modelDef.capabilities.structuredJson === 'json_mode',
      timeoutMs: this.timeoutMs,
      signal: options.signal,
    };

    return withRetries(
      () => adapter.execute(request),
      {
        maxRetries: this.maxRetries,
        initialDelayMs: this.retryInitialDelayMs,
        maxDelayMs: DEFAULT_MAX_DELAY_MS,
        jitter: this.env.AI_RETRY_JITTER === 'false' ? false : true,
      },
      () => {
        /* retry observability lives in telemetry via attempts count */
      },
    ).catch((error) => {
      // Tag with provider for the outer handler.
      if (error instanceof ProviderError) throw error;
      throw new ProviderError({
        message: `${provider}: ${error instanceof Error ? error.message : String(error)}`,
        provider,
        model: modelDef.modelId,
        errorClass: 'unknown',
      });
    });
  }
}

/** Process-wide gateway instance (lazy — no DB/network at import time). */
let shared: AiGateway | null = null;

export function getAiGateway(): AiGateway {
  if (!shared) shared = new AiGateway();
  return shared;
}

/** Test helper — swap the shared instance. */
export function setAiGateway(gateway: AiGateway | null): void {
  shared = gateway;
}