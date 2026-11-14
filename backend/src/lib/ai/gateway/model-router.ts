/**
 * Task-Aware Model Router (Hopper AI Gateway).
 *
 * Implements intelligent, weighted model selection and candidate ranking:
 * 1. Task requirement matching (role, structured output, tool calling)
 * 2. Model context window sufficiency against input size
 * 3. Provider health (circuit breaker state, consecutive failures)
 * 4. Free-tier preference (Groq + NVIDIA NIM prioritized over paid providers)
 * 5. Production eligibility policy (distinguishes preview vs production tiers)
 * 6. Account availability (generally available vs account-dependent)
 */

import {
  type ProviderId,
  type TaskComplexity,
  type TaskType,
  FREE_PROVIDERS,
  PAID_PROVIDERS,
} from './contracts.js';
import {
  type ModelDefinition,
  type ModelRole,
  MODEL_REGISTRY,
  readProviderConfig,
} from './model-registry.js';
import type { CircuitSnapshot } from './resilience/circuit-breaker.js';
import type { ProviderHealthRecord } from './resilience/provider-health.js';

export interface RouteRequest {
  readonly taskType: TaskType;
  readonly complexity: TaskComplexity;
  readonly structuredOutputRequired?: boolean;
  readonly toolCallingRequired?: boolean;
  readonly estimatedInputTokens?: number;
  readonly preferredProvider?: ProviderId;
  readonly enablePaidFallback?: boolean;
}

export interface ScoredModelCandidate {
  readonly model: ModelDefinition;
  readonly score: number;
  readonly routingReasons: string[];
}

export interface RouterOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly healthProvider?: (provider: ProviderId) => {
    circuit?: CircuitSnapshot;
    health?: Partial<ProviderHealthRecord>;
  };
}

/** Mapping from task type to primary expected model role. */
const TASK_ROLE_MAP: Record<TaskType, ModelRole> = {
  'failure.classify': 'fast_classification',
  'failure.extract_evidence': 'fast_classification',
  'failure.diagnose': 'deep_reasoning',
  'failure.suggest_remediation': 'deep_reasoning',
  'failure.compare_occurrences': 'deep_reasoning',
  'flakiness.explain': 'deep_reasoning',
  'log.summarize': 'fast_classification',
  'log.security_review': 'deep_reasoning',
  'pr.report': 'fast_classification',
  'ai.repair_output': 'fast_classification',
};

export class ModelRouter {
  private readonly env: NodeJS.ProcessEnv;
  private readonly healthProvider?: RouterOptions['healthProvider'];

  constructor(options: RouterOptions = {}) {
    this.env = options.env ?? process.env;
    this.healthProvider = options.healthProvider;
  }

  /**
   * Evaluates all models in the registry against the routing request
   * and returns an ordered list of viable candidates sorted by score descending.
   */
  rankCandidates(request: RouteRequest): ScoredModelCandidate[] {
    const providerConfig = readProviderConfig(this.env);
    const targetRole = TASK_ROLE_MAP[request.taskType] ?? 'general';
    const enablePaid =
      request.enablePaidFallback ??
      this.env.AI_ENABLE_PAID_FALLBACK === 'true';

    const candidates: ScoredModelCandidate[] = [];

    for (const model of MODEL_REGISTRY) {
      const provider = model.provider;
      const config = providerConfig[provider];

      // 1. Provider availability check
      if (!config || !config.available) {
        continue;
      }

      // 2. Paid provider restriction: paid providers (anthropic, openai) are never
      // auto-selected unless explicitly enabled or requested
      if (PAID_PROVIDERS.includes(provider) && !enablePaid && request.preferredProvider !== provider) {
        continue;
      }

      // 3. Structured JSON capability check: if task requires verified JSON mode,
      // disqualify models that only support prompt-based extraction
      if (request.structuredOutputRequired && model.capabilities.structuredJson !== 'json_mode') {
        // Still allow if no other json_mode model is available, but heavily penalized
      }

      // 4. Tool-calling capability check
      if (request.toolCallingRequired && model.capabilities.toolCalling !== 'verified') {
        continue; // Hard requirement
      }

      // 5. Context window check
      const inputTokens = request.estimatedInputTokens ?? 2000;
      if (model.contextWindow < inputTokens + 1000) {
        continue; // Context window cannot fit input + minimum completion
      }

      // 6. Compute multi-factor weighted score
      let score = 100;
      const reasons: string[] = [];

      // A. Preferred provider bonus
      if (request.preferredProvider === provider) {
        score += 50;
        reasons.push('preferred_provider_bonus (+50)');
      }

      // B. Free-tier provider priority
      if (FREE_PROVIDERS.includes(provider)) {
        score += 30;
        reasons.push('free_tier_priority (+30)');
      }

      // C. Role match
      if (model.roles.includes(targetRole)) {
        score += 25;
        reasons.push(`role_match_${targetRole} (+25)`);
      }

      // D. Production eligibility
      if (model.productionEligible) {
        score += 20;
        reasons.push('production_eligible (+20)');
      } else {
        score -= 15;
        reasons.push('preview_tier_penalty (-15)');
      }

      // E. Structured JSON mode support
      if (request.structuredOutputRequired) {
        if (model.capabilities.structuredJson === 'json_mode') {
          score += 20;
          reasons.push('json_mode_verified (+20)');
        } else {
          score -= 30;
          reasons.push('prompt_only_json_penalty (-30)');
        }
      }

      // F. General availability vs account-dependent
      if (model.availability === 'generally_available') {
        score += 10;
        reasons.push('generally_available (+10)');
      } else {
        score -= 25;
        reasons.push('account_dependent_penalty (-25)');
      }

      // G. Provider health and circuit breaker evaluation
      if (this.healthProvider) {
        const pHealth = this.healthProvider(provider);
        if (pHealth.circuit) {
          if (pHealth.circuit.state === 'open') {
            score -= 100;
            reasons.push('circuit_open_penalty (-100)');
          } else if (pHealth.circuit.state === 'half_open') {
            score -= 40;
            reasons.push('circuit_half_open_penalty (-40)');
          } else if (pHealth.circuit.consecutiveFailures > 0) {
            const pen = pHealth.circuit.consecutiveFailures * 10;
            score -= pen;
            reasons.push(`consecutive_failures_penalty (-${pen})`);
          }
        }
      }

      candidates.push({ model, score, routingReasons: reasons });
    }

    // Sort descending by score
    return candidates.sort((a, b) => b.score - a.score);
  }

  /**
   * Returns the single best model candidate for a task, or undefined if no provider is eligible.
   */
  selectBestModel(request: RouteRequest): ModelDefinition | undefined {
    const ranked = this.rankCandidates(request);
    return ranked[0]?.model;
  }
}

/**
 * Functional convenience wrapper for evaluating and ranking models for a given task.
 */
export function rankModelsForTask(options: {
  taskType: TaskType;
  complexity?: TaskComplexity;
  role?: string;
  strategy?: string;
  env?: NodeJS.ProcessEnv;
}): ScoredModelCandidate[] {
  const router = new ModelRouter({ env: options.env });
  return router.rankCandidates({
    taskType: options.taskType,
    complexity: options.complexity ?? 'heavy',
  });
}
