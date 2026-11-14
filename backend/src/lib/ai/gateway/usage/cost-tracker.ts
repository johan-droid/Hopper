/**
 * Model Token Cost Tracker (Hopper AI Gateway).
 *
 * Tracks provider-reported token usage and computes calibrated USD cost estimates:
 * - Free-tier providers (Groq evaluation tier, NVIDIA NIM catalog) = $0.00
 * - Paid providers (Anthropic Claude 3.5 Haiku, OpenAI GPT-4o-mini) priced per 1M tokens
 * - Deterministic fallback = $0.00
 */

import type { ProviderId, TokenUsage } from '../contracts.js';

export interface ModelPricing {
  promptCostPerMillion: number;
  completionCostPerMillion: number;
  isFreeTier: boolean;
}

const MODEL_PRICING_TABLE: Record<string, ModelPricing> = {
  // Groq models (Free / Developer Tier)
  'groq:openai/gpt-oss-120b': { promptCostPerMillion: 0.15, completionCostPerMillion: 0.60, isFreeTier: true },
  'groq:openai/gpt-oss-20b': { promptCostPerMillion: 0.075, completionCostPerMillion: 0.30, isFreeTier: true },
  'groq:qwen/qwen3.8-27b': { promptCostPerMillion: 0.10, completionCostPerMillion: 0.40, isFreeTier: true },
  'groq:minimaxai/minimax-m2.7': { promptCostPerMillion: 0.20, completionCostPerMillion: 0.80, isFreeTier: true },

  // NVIDIA NIM API Catalog (Free Developer Evaluation Allowance)
  'nvidia-nim:nvidia/nemotron-3-super-120b-a12b': { promptCostPerMillion: 0.0, completionCostPerMillion: 0.0, isFreeTier: true },
  'nvidia-nim:nvidia/nemotron-3.5-lightning-30b-a3b': { promptCostPerMillion: 0.0, completionCostPerMillion: 0.0, isFreeTier: true },
  'nvidia-nim:qwen/qwen3-next-80b-a3b-instruct': { promptCostPerMillion: 0.0, completionCostPerMillion: 0.0, isFreeTier: true },

  // Paid Providers (Opt-in only)
  'anthropic:claude-3-5-haiku-20241022': { promptCostPerMillion: 0.80, completionCostPerMillion: 4.00, isFreeTier: false },
  'openai:gpt-4o-mini': { promptCostPerMillion: 0.15, completionCostPerMillion: 0.60, isFreeTier: false },
};

export class CostTracker {
  /**
   * Calculates the estimated cost in USD for a request.
   */
  static estimateCostUsd(
    provider: ProviderId,
    modelId: string,
    usage: TokenUsage
  ): { costUsd: number; isFreeTier: boolean } {
    const key = `${provider}:${modelId}`;
    const pricing = MODEL_PRICING_TABLE[key] ?? {
      promptCostPerMillion: 0.10,
      completionCostPerMillion: 0.40,
      isFreeTier: provider === 'groq' || provider === 'nvidia-nim',
    };

    const promptTokens = usage.promptTokens ?? 0;
    const completionTokens = usage.completionTokens ?? 0;

    const promptCost = (promptTokens / 1_000_000) * pricing.promptCostPerMillion;
    const completionCost = (completionTokens / 1_000_000) * pricing.completionCostPerMillion;
    const totalCost = promptCost + completionCost;

    return {
      costUsd: pricing.isFreeTier ? 0.0 : Math.round(totalCost * 100_000) / 100_000,
      isFreeTier: pricing.isFreeTier,
    };
  }
}
