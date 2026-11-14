/**
 * Provider Registry & Factory (Hopper AI Gateway).
 *
 * Owns provider adapter registration, configuration resolution, and lifecycle:
 * - Groq: official OpenAI-compatible endpoint (https://api.groq.com/openai/v1)
 * - NVIDIA NIM: official API Catalog endpoint (https://integrate.api.nvidia.com/v1)
 * - Paid providers (Anthropic, OpenAI) when configured and explicitly permitted
 */

import type { ProviderAdapter } from './groq.js';
import { createGroqAdapter } from './groq.js';
import { createNvidiaNimAdapter } from './nvidia-nim.js';
import {
  type ProviderId,
  PROVIDER_IDS,
} from '../contracts.js';
import { readProviderConfig } from '../model-registry.js';

export class ProviderRegistry {
  private readonly adapters = new Map<ProviderId, ProviderAdapter>();
  private readonly env: NodeJS.ProcessEnv;

  constructor(
    customAdapters: Partial<Record<ProviderId, ProviderAdapter>> = {},
    env: NodeJS.ProcessEnv = process.env
  ) {
    this.env = env;
    for (const [id, adapter] of Object.entries(customAdapters)) {
      if (adapter) {
        this.adapters.set(id as ProviderId, adapter);
      }
    }
  }

  getAdapter(provider: ProviderId): ProviderAdapter | undefined {
    if (this.adapters.has(provider)) {
      return this.adapters.get(provider);
    }

    const config = readProviderConfig(this.env)[provider];
    if (!config || !config.available || !config.apiKey) {
      return undefined;
    }

    let adapter: ProviderAdapter;
    if (provider === 'groq') {
      adapter = createGroqAdapter({
        baseUrl: this.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
        apiKey: config.apiKey,
      });
    } else if (provider === 'nvidia-nim') {
      adapter = createNvidiaNimAdapter({
        baseUrl: this.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1',
        apiKey: config.apiKey,
      });
    } else {
      return undefined;
    }

    this.adapters.set(provider, adapter);
    return adapter;
  }

  registerCustomAdapter(provider: ProviderId, adapter: ProviderAdapter): void {
    this.adapters.set(provider, adapter);
  }

  clear(): void {
    this.adapters.clear();
  }
}
