import type { ProviderChatRequest, ProviderChatResponse, ProviderId } from '../contracts.js';
import { executeChatCompletions, type OpenAiCompatibleConfig } from './openai-compatible.js';

/** Provider adapter shape consumed by the gateway. */
export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly name: string;
  execute(request: ProviderChatRequest): Promise<ProviderChatResponse>;
}

/**
 * Groq adapter — OpenAI-compatible chat completions at https://api.groq.com/openai/v1.
 * Verified: JSON mode, tool calling, reasoning_effort (see model-registry notes).
 */
export interface GroqAdapterConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly headers?: Record<string, string>;
}

export function createGroqAdapter(config: GroqAdapterConfig): ProviderAdapter {
  const cfg: OpenAiCompatibleConfig = {
    baseUrl: config.baseUrl ?? 'https://api.groq.com/openai/v1',
    apiKey: config.apiKey,
    headers: config.headers,
    providerId: 'groq',
  };
  return {
    id: 'groq',
    name: 'Groq',
    execute: (request: ProviderChatRequest) => executeChatCompletions(cfg, request),
  };
}