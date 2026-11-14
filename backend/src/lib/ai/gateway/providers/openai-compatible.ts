import {
  ProviderError,
  classifyHttpStatus,
  classifyThrownError,
  parseRetryAfterHeader,
  type ChatMessage,
  type ProviderChatRequest,
  type ProviderChatResponse,
  type ProviderId,
  type ToolCallRequest,
} from '../contracts.js';

/**
 * Shared transport for OpenAI-compatible chat-completions APIs (Groq, NVIDIA NIM).
 * Raw fetch only — no SDK dependency — with an AbortSignal timeout per request.
 */

export interface OpenAiCompatibleConfig {
  readonly providerId: ProviderId;
  readonly baseUrl: string;
  readonly apiKey: string;
  /** Extra headers merged after the standard Authorization header. */
  readonly headers?: Record<string, string>;
}

export function buildChatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

interface WireMessage {
  role: string;
  content: string;
  tool_call_id?: string;
  name?: string;
}

function toWireMessages(messages: ChatMessage[]): WireMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
    ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
    ...(m.name ? { name: m.name } : {}),
  }));
}

interface WireToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

function extractToolCalls(payload: unknown): ToolCallRequest[] {
  const choices = (payload as { choices?: Array<{ message?: { tool_calls?: WireToolCall[] } }> })?.choices;
  const calls = choices?.[0]?.message?.tool_calls;
  if (!Array.isArray(calls)) return [];
  return calls
    .map((c, index) => ({
      id: c.id ?? `call_${index}`,
      name: c.function?.name ?? '',
      arguments: c.function?.arguments ?? '',
    }))
    .filter((c) => c.name.length > 0);
}

function buildRequestBody(config: OpenAiCompatibleConfig, request: ProviderChatRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.model,
    messages: toWireMessages(request.messages),
    max_tokens: request.maxTokens,
    temperature: request.temperature ?? 0,
  };
  // JSON mode is only requested when the model registry verified support.
  if (request.jsonMode) {
    body.response_format = { type: 'json_object' };
  }
  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }
  void config; // reserved for provider-specific body extensions
  return body;
}

/**
 * Execute one chat-completions call. Throws ProviderError with a classified
 * errorClass; the gateway decides whether to retry or fail over.
 */
export async function executeChatCompletions(
  config: OpenAiCompatibleConfig,
  request: ProviderChatRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderChatResponse> {
  const url = buildChatCompletionsUrl(config.baseUrl);
  const startedAt = Date.now();

  const init: RequestInit = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
      ...config.headers,
    },
    body: JSON.stringify(buildRequestBody(config, request)),
    signal: request.signal ?? AbortSignal.timeout(request.timeoutMs ?? 30_000),
  };

  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (error) {
    const errorClass = classifyThrownError(error);
    throw new ProviderError({
      message: `${config.providerId}: ${errorClass === 'timeout' ? `timed out after ${request.timeoutMs}ms` : `network error: ${error instanceof Error ? error.message : String(error)}`}`,
      provider: config.providerId,
      model: request.model,
      errorClass,
    });
  }

  const latencyMs = Date.now() - startedAt;

  if (!response.ok) {
    const errorClass = classifyHttpStatus(response.status);
    const retryAfterMs = parseRetryAfterHeader(response.headers.get('retry-after')) ?? undefined;
    throw new ProviderError({
      message: `${config.providerId}: HTTP ${response.status} ${response.statusText}`,
      provider: config.providerId,
      model: request.model,
      errorClass,
      status: response.status,
      retryAfterMs,
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new ProviderError({
      message: `${config.providerId}: invalid JSON in response body`,
      provider: config.providerId,
      model: request.model,
      errorClass: 'unknown',
      status: response.status,
    });
  }

  const choice = (payload as { choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }> })
    ?.choices?.[0];
  const content = choice?.message?.content;
  const toolCalls = extractToolCalls(payload);
  if ((typeof content !== 'string' || content.length === 0) && toolCalls.length === 0) {
    throw new ProviderError({
      message: `${config.providerId}: response contained no message content`,
      provider: config.providerId,
      model: request.model,
      errorClass: 'unknown',
      status: response.status,
    });
  }

  const usage = (payload as { usage?: { prompt_tokens?: number; completion_tokens?: number } })?.usage;
  const promptTokens = usage?.prompt_tokens;
  const completionTokens = usage?.completion_tokens;
  const reportedModel = (payload as { model?: string })?.model;

  return {
    content: typeof content === 'string' ? content : '',
    toolCalls,
    usage: {
      promptTokens: promptTokens ?? null,
      completionTokens: completionTokens ?? null,
      estimated: promptTokens === undefined || completionTokens === undefined,
    },
    finishReason: choice?.finish_reason ?? null,
    latencyMs,
    model: reportedModel && reportedModel.length > 0 ? reportedModel : request.model,
  };
}