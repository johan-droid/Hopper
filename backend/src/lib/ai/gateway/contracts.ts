/**
 * AI Gateway contracts — provider-independent types, error classification,
 * and the shared chat-completion shapes every adapter normalizes to.
 *
 * Architectural invariant: application services never call Groq or NVIDIA
 * directly. They call `aiGateway.execute(task, input, context)`.
 */

export type ProviderId = 'groq' | 'nvidia-nim' | 'anthropic' | 'openai';

export const PROVIDER_IDS: readonly ProviderId[] = ['groq', 'nvidia-nim', 'anthropic', 'openai'];

/** Free (rate-limited / catalog) providers — eligible for automatic failover. */
export const FREE_PROVIDERS: readonly ProviderId[] = ['groq', 'nvidia-nim'];

/** Paid providers — only ever used when explicitly selected or explicitly enabled. */
export const PAID_PROVIDERS: readonly ProviderId[] = ['anthropic', 'openai'];

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Set on tool-result messages. */
  tool_call_id?: string;
  name?: string;
}

export interface ProviderToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool arguments. */
  parameters: Record<string, unknown>;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  /** Raw JSON string exactly as produced by the model (untrusted). */
  arguments: string;
}

export interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  /** true when the provider did not report usage and values are estimates. */
  estimated: boolean;
}

export interface ProviderChatRequest {
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  /** Request JSON mode only when the model's capability is verified. */
  jsonMode?: boolean;
  tools?: ProviderToolDefinition[];
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface ProviderChatResponse {
  content: string;
  toolCalls: ToolCallRequest[];
  usage: TokenUsage;
  finishReason: string | null;
  latencyMs: number;
  /** Model actually used (providers may map aliases). */
  model: string;
}

export type ProviderErrorClass =
  | 'rate_limit'
  | 'timeout'
  | 'server'
  | 'network'
  | 'auth'
  | 'invalid_request'
  | 'model_not_found'
  | 'unsupported'
  | 'overloaded'
  | 'unknown';

const RETRYABLE_CLASSES: ReadonlySet<ProviderErrorClass> = new Set([
  'rate_limit',
  'timeout',
  'server',
  'network',
  'overloaded',
]);

export class ProviderError extends Error {
  readonly provider: ProviderId;
  readonly model: string;
  readonly errorClass: ProviderErrorClass;
  readonly status?: number;
  /** Parsed Retry-After delay when the provider sent one. */
  readonly retryAfterMs?: number;

  constructor(params: {
    message: string;
    provider: ProviderId;
    model: string;
    errorClass: ProviderErrorClass;
    status?: number;
    retryAfterMs?: number;
  }) {
    super(params.message);
    this.name = 'ProviderError';
    this.provider = params.provider;
    this.model = params.model;
    this.errorClass = params.errorClass;
    this.status = params.status;
    this.retryAfterMs = params.retryAfterMs;
  }

  get retryable(): boolean {
    return RETRYABLE_CLASSES.has(this.errorClass);
  }
}

/** HTTP status → permanent/transient classification. 400/401/403/404/422 are never retried. */
export function classifyHttpStatus(status: number): ProviderErrorClass {
  if (status === 429) return 'rate_limit';
  if (status === 408) return 'timeout';
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'model_not_found';
  if (status === 400 || status === 422) return 'invalid_request';
  if (status === 503) return 'overloaded';
  if (status >= 500) return 'server';
  if (status >= 400) return 'invalid_request';
  return 'unknown';
}

/** Thrown error → classification (AbortError/TimeoutError → timeout, fetch failure → network). */
export function classifyThrownError(err: unknown): ProviderErrorClass {
  const e = err as { name?: string; message?: string; cause?: { code?: string } } | undefined;
  if (!e) return 'unknown';
  if (e.name === 'AbortError' || e.name === 'TimeoutError') return 'timeout';
  const message = (e.message || '').toLowerCase();
  if (
    e.name === 'TypeError' ||
    message.includes('fetch failed') ||
    message.includes('network') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('socket hang up')
  ) {
    return 'network';
  }
  return 'unknown';
}

/** Parses Retry-After: decimal seconds or RFC 7231 date. */
export function parseRetryAfterHeader(headerValue: string | null | undefined): number | null {
  if (!headerValue || typeof headerValue !== 'string') return null;
  const trimmed = headerValue.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = parseInt(trimmed, 10);
    return isNaN(seconds) || seconds < 0 ? null : seconds * 1000;
  }
  const dateMs = Date.parse(trimmed);
  if (!isNaN(dateMs)) {
    const delay = dateMs - Date.now();
    return delay > 0 ? delay : 0;
  }
  return null;
}

export function isPermanentHttpError(status: number): boolean {
  return [400, 401, 403, 404, 422].includes(status);
}

/** No configured, eligible provider could serve the task. */
export class GatewayExhaustedError extends Error {
  readonly causes: string[];
  constructor(causes: string[]) {
    super(`AI gateway exhausted all eligible providers: ${causes.join(' | ')}`);
    this.name = 'GatewayExhaustedError';
    this.causes = causes;
  }
}

/** Provider answered but the output failed schema validation after the bounded repair attempt. */
export class OutputValidationError extends Error {
  readonly provider: ProviderId;
  readonly model: string;
  readonly detail: string;
  constructor(params: { provider: ProviderId; model: string; detail: string }) {
    super(`AI output failed validation (${params.provider}/${params.model}): ${params.detail}`);
    this.name = 'OutputValidationError';
    this.provider = params.provider;
    this.model = params.model;
    this.detail = params.detail;
  }
}

/** Bulkhead queue rejected the request instead of starving the provider. */
export class OverloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OverloadError';
  }
}

export interface GatewayAttemptTrace {
  provider: ProviderId;
  model: string;
  outcome: 'success' | 'failed';
  errorClass?: ProviderErrorClass;
  status?: number;
  attempts: number;
  latencyMs: number;
}

export interface GatewayResult<T> {
  value: T;
  provider: ProviderId;
  model: string;
  usage: TokenUsage;
  latencyMs: number;
  attempts: number;
  failoverPath: string[];
}

export interface GatewayContext {
  organizationId?: string;
  correlationId?: string;
  workflowId?: string;
  /** Cooperative cancellation for the whole request. */
  signal?: AbortSignal;
}

// ------------------------------------------------------- task taxonomy ---

/** Complexity tier — drives model routing (light tasks go to fast models). */
export type TaskComplexity = 'light' | 'medium' | 'heavy';

/** Priority — used for ordering and bulkhead admission under load. */
export type TaskPriority = 'low' | 'medium' | 'high';

/** Canonical task types across Hopper's AI capabilities. */
export type TaskType =
  | 'failure.classify'
  | 'failure.extract_evidence'
  | 'failure.diagnose'
  | 'failure.suggest_remediation'
  | 'failure.compare_occurrences'
  | 'flakiness.explain'
  | 'log.summarize'
  | 'log.security_review'
  | 'pr.report'
  | 'ai.repair_output';
