/**
 * Fallback & Failover Manager (Hopper AI Gateway).
 *
 * Implements resilient multi-tiered model and provider failover:
 * Tier 1: Primary provider's preferred model (e.g. Groq gpt-oss-120b)
 * Tier 2: Alternate model on primary provider (e.g. Groq gpt-oss-20b)
 * Tier 3: Secondary free provider model (e.g. NVIDIA NIM nemotron-3-super-120b)
 * Tier 4: Alternate model on secondary provider (e.g. NVIDIA NIM nemotron-3.5-lightning)
 * Tier 5: Explicitly enabled paid provider (Anthropic/OpenAI — only if AI_ENABLE_PAID_FALLBACK=true)
 * Tier 6: High-precision deterministic diagnostic engine (zero-failure guarantee)
 */

import {
  type ProviderId,
  type TaskType,
  FREE_PROVIDERS,
  PAID_PROVIDERS,
  GatewayExhaustedError,
} from '../contracts.js';
import {
  type ModelDefinition,
  MODEL_REGISTRY,
  readProviderConfig,
} from '../model-registry.js';
import type { ModelRouter, ScoredModelCandidate } from '../model-router.js';

export interface FailoverTier {
  tierNumber: number;
  provider: ProviderId;
  modelId: string;
  isPaid: boolean;
  description: string;
}

export class FallbackManager {
  private readonly env: NodeJS.ProcessEnv;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  /**
   * Constructs the ordered failover execution plan for a given task.
   */
  buildFailoverPlan(
    taskType: TaskType,
    rankedCandidates: ScoredModelCandidate[],
    preferredProvider?: ProviderId
  ): FailoverTier[] {
    const enablePaid = this.env.AI_ENABLE_PAID_FALLBACK === 'true';
    const plan: FailoverTier[] = [];
    const seen = new Set<string>();

    let tierIndex = 1;
    for (const candidate of rankedCandidates) {
      const { model } = candidate;
      const key = `${model.provider}:${model.modelId}`;
      if (seen.has(key)) continue;

      const isPaid = PAID_PROVIDERS.includes(model.provider);
      if (isPaid && !enablePaid && preferredProvider !== model.provider) {
        continue; // Strict: no auto paid fallback
      }

      seen.add(key);
      plan.push({
        tierNumber: tierIndex++,
        provider: model.provider,
        modelId: model.modelId,
        isPaid,
        description: `${model.provider} / ${model.modelId} (${model.roles.join(', ')})`,
      });
    }

    return plan;
  }

  /**
   * Determines whether an error warrants trying an alternate model on the same provider
   * or failing over to a completely different provider.
   */
  shouldFailoverProvider(errorClass: string): boolean {
    // 401/403 auth errors, 429 quota exhaustion, or 503 provider outages
    // mean the entire provider is down or unusable.
    return ['auth', 'rate_limit', 'overloaded', 'circuit_open'].includes(errorClass);
  }
}
