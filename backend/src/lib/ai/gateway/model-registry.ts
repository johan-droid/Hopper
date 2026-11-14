/**
 * Task-aware model registry.
 *
 * Capability and availability facts recorded here were verified against live
 * provider documentation (see docs/architecture/AI_GATEWAY.md for sources):
 *   - Groq: https://console.groq.com/docs/models + /docs/api-reference
 *   - NVIDIA NIM: https://docs.api.nvidia.com/nim/reference/llm-apis
 *
 * Nothing in this registry is assumed. Models whose capabilities are not
 * verified are marked `unverified` and are never routed to tasks that require
 * that capability. Availability and pricing can change without notice.
 */

import { ProviderId, PROVIDER_IDS, FREE_PROVIDERS, PAID_PROVIDERS } from './contracts.js';

export type ModelRole =
  | 'deep_reasoning'
  | 'fast_classification'
  | 'tool_workflows'
  | 'general';

export interface ModelCapabilities {
  /**
   * 'json_mode'   — provider-documented `response_format: { type: 'json_object' }` support.
   * 'prompt_only' — structured output enforced by our prompts + Zod validation only.
   */
  structuredJson: 'json_mode' | 'prompt_only';
  toolCalling: 'verified' | 'unverified';
  reasoningEffort: boolean;
}

export interface ModelDefinition {
  provider: ProviderId;
  modelId: string;
  contextWindow: number;
  maxCompletionTokens: number;
  capabilities: ModelCapabilities;
  /** Ordered roles this model is best at (routing preference). */
  roles: ModelRole[];
  tier: 'production' | 'preview';
  /**
   * 'generally_available' — any account with the provider key can call it.
   * 'account_dependent'   — entitlement/contract dependent; may 404 on some accounts.
   */
  availability: 'generally_available' | 'account_dependent';
  /** Free-tier catalog endpoints are evaluation capacity, not production capacity. */
  productionEligible: boolean;
  verificationNote?: string;
}

export const MODEL_REGISTRY: readonly ModelDefinition[] = [
  // ---------------------------------------------------------------- Groq ---
  {
    provider: 'groq',
    modelId: 'openai/gpt-oss-120b',
    contextWindow: 131_072,
    maxCompletionTokens: 65_536,
    capabilities: { structuredJson: 'json_mode', toolCalling: 'verified', reasoningEffort: true },
    roles: ['deep_reasoning', 'general'],
    tier: 'production',
    availability: 'generally_available',
    productionEligible: true,
    verificationNote: 'Groq production model; JSON mode + tool use documented; reasoning_effort low/medium/high.',
  },
  {
    provider: 'groq',
    modelId: 'openai/gpt-oss-20b',
    contextWindow: 131_072,
    maxCompletionTokens: 65_536,
    capabilities: { structuredJson: 'json_mode', toolCalling: 'verified', reasoningEffort: true },
    roles: ['fast_classification', 'general'],
    tier: 'production',
    availability: 'generally_available',
    productionEligible: true,
    verificationNote: 'Groq production model (~1000 tps); JSON mode + tool use documented.',
  },
  {
    provider: 'groq',
    modelId: 'qwen/qwen3.8-27b',
    contextWindow: 131_072,
    maxCompletionTokens: 16_384,
    capabilities: { structuredJson: 'json_mode', toolCalling: 'unverified', reasoningEffort: true },
    roles: ['tool_workflows', 'fast_classification'],
    tier: 'preview',
    availability: 'generally_available',
    productionEligible: false,
    verificationNote:
      'Groq preview model (not production-intended per Groq preview policy). Tool-calling not yet verified for this model; reasoning_effort none/low/medium/high documented.',
  },
  {
    provider: 'groq',
    modelId: 'minimaxai/minimax-m2.7',
    contextWindow: 196_608,
    maxCompletionTokens: 131_072,
    capabilities: { structuredJson: 'json_mode', toolCalling: 'unverified', reasoningEffort: false },
    roles: ['deep_reasoning'],
    tier: 'preview',
    availability: 'account_dependent',
    productionEligible: false,
    verificationNote:
      'Listed as Enterprise/ContactSales on GroqCloud — availability and entitlement are account-dependent; may be rejected on some accounts.',
  },
  // --------------------------------------------------------- NVIDIA NIM ---
  {
    provider: 'nvidia-nim',
    modelId: 'nvidia/nemotron-3-super-120b-a12b',
    contextWindow: 131_072,
    maxCompletionTokens: 32_768,
    capabilities: { structuredJson: 'prompt_only', toolCalling: 'unverified', reasoningEffort: false },
    roles: ['deep_reasoning', 'general'],
    tier: 'production',
    availability: 'generally_available',
    productionEligible: false,
    verificationNote:
      'NVIDIA API Catalog free endpoints are evaluation capacity (developer program terms), not guaranteed production capacity.',
  },
  {
    provider: 'nvidia-nim',
    modelId: 'nvidia/nemotron-3.5-lightning-30b-a3b',
    contextWindow: 131_072,
    maxCompletionTokens: 32_768,
    capabilities: { structuredJson: 'prompt_only', toolCalling: 'unverified', reasoningEffort: false },
    roles: ['fast_classification', 'general'],
    tier: 'production',
    availability: 'generally_available',
    productionEligible: false,
    verificationNote: 'NVIDIA API Catalog evaluation endpoints — see licensing note above.',
  },
  {
    provider: 'nvidia-nim',
    modelId: 'qwen/qwen3-next-80b-a3b-instruct',
    contextWindow: 131_072,
    maxCompletionTokens: 32_768,
    capabilities: { structuredJson: 'prompt_only', toolCalling: 'unverified', reasoningEffort: false },
    roles: ['tool_workflows', 'general'],
    tier: 'production',
    availability: 'generally_available',
    productionEligible: false,
    verificationNote:
      'Present in the live NVIDIA API Catalog; tool-calling and structured-output support unverified for this endpoint — not routed to tool/JSON-mode tasks.',
  },
  {
    provider: 'nvidia-nim',
    modelId: 'meta/llama-3.3-70b-instruct',
    contextWindow: 131_072,
    maxCompletionTokens: 32_768,
    capabilities: { structuredJson: 'prompt_only', toolCalling: 'unverified', reasoningEffort: false },
    roles: ['deep_reasoning', 'general'],
    tier: 'production',
    availability: 'generally_available',
    productionEligible: false,
    verificationNote:
      'NVIDIA API Catalog model; evaluation endpoints for general reasoning and instruction following.',
  },
  // ------------------------------------------------------- Paid (opt-in) ---
  {
    provider: 'anthropic',
    modelId: 'claude-3-5-haiku-20241022',
    contextWindow: 200_000,
    maxCompletionTokens: 4_096,
    capabilities: { structuredJson: 'prompt_only', toolCalling: 'unverified', reasoningEffort: false },
    roles: ['general', 'fast_classification'],
    tier: 'production',
    availability: 'generally_available',
    productionEligible: true,
  },
  {
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    contextWindow: 128_000,
    maxCompletionTokens: 16_384,
    capabilities: { structuredJson: 'json_mode', toolCalling: 'unverified', reasoningEffort: false },
    roles: ['general', 'fast_classification'],
    tier: 'production',
    availability: 'generally_available',
    productionEligible: true,
  },
];

export function getModelsForProvider(provider: ProviderId): ModelDefinition[] {
  return MODEL_REGISTRY.filter((m) => m.provider === provider);
}

export function findModel(provider: ProviderId, modelId: string): ModelDefinition | undefined {
  return MODEL_REGISTRY.find((m) => m.provider === provider && m.modelId === modelId);
}

export interface ProviderConfig {
  id: ProviderId;
  /** Provider API key from the server-side environment. Never exposed to the frontend. */
  apiKey: string | null;
  /** Key present and the provider not explicitly disabled via AI_ENABLE_* flags. */
  available: boolean;
}

/**
 * Reads provider configuration from the environment.
 * A missing/disabled key disables the provider — it never blocks application startup
 * as long as some other provider (or mock mode) is available.
 */
export function readProviderConfig(env: NodeJS.ProcessEnv = process.env): Record<ProviderId, ProviderConfig> {
  const validKey = (value?: string) =>
    value && !value.includes('mock') && !value.includes('placeholder') ? value : null;

  const groqKey = validKey(env.GROQ_API_KEY);
  const nimKey = validKey(env.NVIDIA_NIM_API_KEY);
  const anthropicKey = validKey(env.ANTHROPIC_API_KEY || env.AI_API_KEY);
  const openaiKey = validKey(env.OPENAI_API_KEY || env.AI_API_KEY);

  return {
    groq: {
      id: 'groq',
      apiKey: groqKey,
      available: env.AI_ENABLE_GROQ !== 'false' && Boolean(groqKey),
    },
    'nvidia-nim': {
      id: 'nvidia-nim',
      apiKey: nimKey,
      available: env.AI_ENABLE_NVIDIA_NIM !== 'false' && Boolean(nimKey),
    },
    anthropic: {
      id: 'anthropic',
      apiKey: anthropicKey,
      available: Boolean(anthropicKey),
    },
    openai: {
      id: 'openai',
      apiKey: openaiKey,
      available: Boolean(openaiKey),
    },
  };
}

/**
 * Ordered provider failover chain.
 *
 * Rules:
 *  1. The explicitly configured primary (AI_PROVIDER) is always first when its key
 *     exists — even a paid provider, because selecting it is explicit configuration,
 *     not an automatic fallback.
 *  2. Free providers follow in fixed order (groq → nvidia-nim) when available.
 *  3. Paid providers never join the chain automatically (AI_ENABLE_PAID_FALLBACK=false).
 */
export function buildProviderChain(env: NodeJS.ProcessEnv = process.env): ProviderId[] {
  const config = readProviderConfig(env);
  const primary = (env.AI_PROVIDER || 'groq').toLowerCase();
  const routingMode = env.AI_ROUTING_MODE || 'failover';

  const isProviderId = (v: string): v is ProviderId => (PROVIDER_IDS as readonly string[]).includes(v);
  const chain: ProviderId[] = [];

  if (isProviderId(primary) && config[primary].available) chain.push(primary);

  if (routingMode !== 'single') {
    for (const provider of [...FREE_PROVIDERS, ...PAID_PROVIDERS]) {
      if (provider === primary) continue;
      // Paid providers only join when explicitly enabled as fallback.
      if (PAID_PROVIDERS.includes(provider) && env.AI_ENABLE_PAID_FALLBACK !== 'true') continue;
      if (config[provider].available) chain.push(provider);
    }
  }

  return chain;
}
