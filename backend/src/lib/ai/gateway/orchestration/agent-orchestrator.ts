/**
 * Diagnostic Agent Orchestrator (Hopper AI Orchestration Layer).
 *
 * Implements bounded, multi-stage diagnostic agent execution:
 * Stage 1: Failure understanding & metadata intake
 * Stage 2: Evidence correlation & hypothesis generation
 * Stage 3: Historical intelligence & flakiness evaluation
 * Stage 4: Structured diagnosis synthesis
 * Stage 5: Output schema & line-number verification
 * Stage 6: Persistence preparation & reporting handoff
 *
 * Enforces hard bounds on model calls, iterations, tool execution, and token ceilings.
 * Gracefully falls back to high-precision deterministic analysis upon any boundary violation.
 */

import crypto from 'node:crypto';
import type { AiGateway } from '../gateway.js';
import type { GatewayContext } from '../contracts.js';
import {
  WorkflowState,
  type WorkflowBounds,
} from './workflow-state.js';
import { ToolRegistry } from './tool-registry.js';
import { OutputValidator } from './output-validator.js';
import {
  type DiagnosisContext,
  type DiagnosisOutput,
  synthesizeDeterministicDiagnosis,
} from '../../diagnose.js';

export interface OrchestrationOptions extends GatewayContext {
  readonly bounds?: Partial<WorkflowBounds>;
  readonly toolRegistry?: ToolRegistry;
}

export class AgentOrchestrator {
  private readonly gateway: AiGateway;
  private readonly toolRegistry: ToolRegistry;

  constructor(gateway: AiGateway, toolRegistry = new ToolRegistry()) {
    this.gateway = gateway;
    this.toolRegistry = toolRegistry;
  }

  /**
   * Executes the bounded diagnostic workflow.
   */
  async runDiagnosticWorkflow(
    context: DiagnosisContext,
    options: OrchestrationOptions = {}
  ): Promise<DiagnosisOutput> {
    const workflowId = options.workflowId ?? crypto.randomUUID();
    const state = new WorkflowState(workflowId, options.bounds);

    try {
      // ------------------------------------------------ Stage 1: Failure Understanding ---
      state.transitionTo('understanding');
      state.iteration += 1;

      // Extract verified factual observations from context
      if (context.workflowName && context.jobName) {
        state.ledger.confirmedObservations.push(
          `Failure occurred in workflow "${context.workflowName}" during job "${context.jobName}" (step "${context.stepName}", exit code ${context.exitCode}).`
        );
      }
      if (context.commitSha) {
        state.ledger.confirmedObservations.push(
          `Failing commit SHA: ${context.commitSha}.`
        );
      }

      // Check bounds
      const budgetViolation1 = state.checkBudgetExceeded();
      if (budgetViolation1) {
        return synthesizeDeterministicDiagnosis(context, budgetViolation1);
      }

      // ------------------------------------------------ Stage 2: Evidence Analysis ---
      state.transitionTo('evidence_analysis');
      const toolContext = {
        organizationId: options.organizationId,
        workflowData: {
          workflowName: context.workflowName,
          jobName: context.jobName,
          stepName: context.stepName,
          exitCode: context.exitCode,
          commitSha: context.commitSha,
          modifiedFiles: context.modifiedFiles,
          historicalStats: context.historicalStats,
          slicedLogSnippet: context.slicedLogSnippet,
          signatureHash: context.signatureHash,
        },
      };

      // Query sanitized log excerpt via tool registry
      const logToolResult = await this.toolRegistry.executeTool(
        'get_sanitized_log_excerpt',
        JSON.stringify({ maxLines: 50 }),
        toolContext
      );
      if (logToolResult.success) {
        state.recordToolCall('get_sanitized_log_excerpt', logToolResult.result);
      }

      // ------------------------------------------------ Stage 3: Historical Intelligence ---
      state.transitionTo('historical_intelligence');
      const historyToolResult = await this.toolRegistry.executeTool(
        'get_historical_occurrences',
        '{}',
        toolContext
      );
      if (historyToolResult.success) {
        state.recordToolCall('get_historical_occurrences', historyToolResult.result);
      }

      const flakinessToolResult = await this.toolRegistry.executeTool(
        'get_flakiness_statistics',
        '{}',
        toolContext
      );
      if (flakinessToolResult.success) {
        state.recordToolCall('get_flakiness_statistics', flakinessToolResult.result);
      }

      // ------------------------------------------------ Stage 4: Diagnosis Synthesis ---
      state.transitionTo('synthesis');
      const budgetViolation2 = state.checkBudgetExceeded();
      if (budgetViolation2) {
        return synthesizeDeterministicDiagnosis(context, budgetViolation2);
      }

      // Execute synthesis task through the central gateway
      const gatewayResult = await this.gateway.execute<DiagnosisContext, DiagnosisOutput>(
        'failure.diagnose',
        context,
        {
          organizationId: options.organizationId,
          correlationId: options.correlationId ?? workflowId,
          signal: options.signal,
        },
        // Fallback builder if all AI providers fail
        (input) => synthesizeDeterministicDiagnosis(input, 'AI Gateway exhausted all eligible providers')
      );

      state.recordModelCall(
        gatewayResult.usage.promptTokens ?? 1500,
        gatewayResult.usage.completionTokens ?? 400
      );

      // ------------------------------------------------ Stage 5: Output Verification ---
      state.transitionTo('verification');
      const validation = OutputValidator.validateDiagnosisOutput(
        gatewayResult.value,
        context.slicedLogSnippet
      );

      const attachTelemetry = (diag: DiagnosisOutput): DiagnosisOutput => {
        if (!diag.telemetry) {
          diag.telemetry = {
            provider: (gatewayResult.provider as any) || 'groq',
            model: gatewayResult.model,
            latencyMs: gatewayResult.latencyMs,
            promptTokens: gatewayResult.usage.promptTokens ?? 0,
            completionTokens: gatewayResult.usage.completionTokens ?? 0,
            costUsd: 0,
            isFallback: gatewayResult.failoverPath.length > 1 || gatewayResult.model.includes('fallback'),
            fallbackReason: gatewayResult.model.includes('fallback') ? 'All external AI providers failed' : undefined,
          };
        }
        return diag;
      };

      if (!validation.isValid && validation.requiresRepair && state.modelCalls < state.bounds.maxModelCalls) {
        // Bounded 1-attempt repair policy
        try {
          const repairResult = await this.gateway.execute<{ rawOutput: string; errors: string[] }, { repairedJson: string }>(
            'ai.repair_output',
            { rawOutput: validation.rawText ?? JSON.stringify(gatewayResult.value), errors: validation.errors },
            { organizationId: options.organizationId, signal: options.signal }
          );
          state.recordModelCall(500, 400);
          const repairedValidation = OutputValidator.validateDiagnosisOutput(
            repairResult.value.repairedJson,
            context.slicedLogSnippet
          );
          if (repairedValidation.isValid && repairedValidation.validatedData) {
            state.transitionTo('reporting');
            return attachTelemetry(repairedValidation.validatedData);
          }
        } catch {
          // Repair attempt failed — proceed to deterministic fallback
        }
      }

      if (validation.isValid && validation.validatedData) {
        state.transitionTo('reporting');
        return attachTelemetry(validation.validatedData);
      }

      // If output failed verification and could not be repaired, return deterministic fallback
      return synthesizeDeterministicDiagnosis(
        context,
        `AI output failed verification: ${validation.errors.join('; ')}`
      );
    } catch (err: any) {
      state.transitionTo('degraded');
      return synthesizeDeterministicDiagnosis(
        context,
        `Orchestration degraded: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
