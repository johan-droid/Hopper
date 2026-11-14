import type { ProviderChatRequest, ProviderChatResponse } from '../contracts.js';
import { executeChatCompletions, type OpenAiCompatibleConfig } from './openai-compatible.js';
import type { ProviderAdapter } from './groq.js';

/**
 * NVIDIA NIM adapter — OpenAI-compatible chat completions at https://integrate.api.nvidia.com/v1.
 *
 * Production caveat (documented in docs/architecture/INTEGRATIONS.md): NIM catalog
 * models are evaluation-tier endpoints, not guaranteed production capacity. The
 * gateway treats NIM availability as best-effort with a deterministic fallback
 * behind every call.
 */
export interface NvidiaNimAdapterConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly headers?: Record<string, string>;
}

export function createNvidiaNimAdapter(config: NvidiaNimAdapterConfig): ProviderAdapter {
  const cfg: OpenAiCompatibleConfig = {
    baseUrl: config.baseUrl ?? 'https://integrate.api.nvidia.com/v1',
    apiKey: config.apiKey,
    headers: config.headers,
    providerId: 'nvidia-nim',
  };
  return {
    id: 'nvidia-nim',
    name: 'NVIDIA NIM',
    execute: (request: ProviderChatRequest): Promise<ProviderChatResponse> => executeChatCompletions(cfg, request),
  };
}