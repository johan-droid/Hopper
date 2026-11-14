/**
 * Bounded Workflow State Machine (Hopper AI Orchestration Layer).
 *
 * Tracks multi-stage diagnostic progress with strict bounded guardrails:
 * 1. Diagnostic stages (Understanding -> Evidence -> History -> Synthesis -> Verification -> Reporting)
 * 2. Hard limits on model calls, iterations, tool calls, tokens, and time
 * 3. Distinction between verified factual observations and unverified hypotheses
 * 4. Cooperative cancellation & durable checkpointing
 */

export type DiagnosticStage =
  | 'understanding'
  | 'evidence_analysis'
  | 'historical_intelligence'
  | 'synthesis'
  | 'verification'
  | 'reporting'
  | 'completed'
  | 'degraded';

export interface WorkflowBounds {
  readonly maxModelCalls: number;
  readonly maxIterations: number;
  readonly maxTotalTokens: number;
  readonly maxExecutionTimeMs: number;
  readonly maxToolCalls: number;
}

export const DEFAULT_WORKFLOW_BOUNDS: WorkflowBounds = {
  maxModelCalls: 5,
  maxIterations: 4,
  maxTotalTokens: 16_000,
  maxExecutionTimeMs: 60_000,
  maxToolCalls: 8,
};

export interface WorkflowEvidenceLedger {
  confirmedObservations: string[];
  alternativeHypotheses: string[];
  toolOutputs: Record<string, unknown>;
  verifiedLineNumbers: number[];
}

export class WorkflowState {
  readonly workflowId: string;
  readonly startedAt: number;
  readonly bounds: WorkflowBounds;

  currentStage: DiagnosticStage = 'understanding';
  iteration = 0;
  modelCalls = 0;
  toolCalls = 0;
  totalPromptTokens = 0;
  totalCompletionTokens = 0;

  readonly ledger: WorkflowEvidenceLedger = {
    confirmedObservations: [],
    alternativeHypotheses: [],
    toolOutputs: {},
    verifiedLineNumbers: [],
  };

  constructor(
    workflowId: string,
    bounds: Partial<WorkflowBounds> = {},
    now = Date.now
  ) {
    this.workflowId = workflowId;
    this.startedAt = now();
    this.bounds = { ...DEFAULT_WORKFLOW_BOUNDS, ...bounds };
  }

  get elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  get totalTokens(): number {
    return this.totalPromptTokens + this.totalCompletionTokens;
  }

  /**
   * Checks if any bounded guardrail is exceeded. Returns a rejection reason or null.
   */
  checkBudgetExceeded(): string | null {
    if (this.modelCalls >= this.bounds.maxModelCalls) {
      return `Exceeded maximum model calls (${this.modelCalls}/${this.bounds.maxModelCalls})`;
    }
    if (this.iteration >= this.bounds.maxIterations) {
      return `Exceeded maximum orchestration iterations (${this.iteration}/${this.bounds.maxIterations})`;
    }
    if (this.toolCalls >= this.bounds.maxToolCalls) {
      return `Exceeded maximum tool calls (${this.toolCalls}/${this.bounds.maxToolCalls})`;
    }
    if (this.totalTokens >= this.bounds.maxTotalTokens) {
      return `Exceeded maximum token ceiling (${this.totalTokens}/${this.bounds.maxTotalTokens})`;
    }
    if (this.elapsedMs >= this.bounds.maxExecutionTimeMs) {
      return `Exceeded maximum workflow execution time (${this.elapsedMs}ms/${this.bounds.maxExecutionTimeMs}ms)`;
    }
    return null;
  }

  recordModelCall(promptTokens: number, completionTokens: number): void {
    this.modelCalls += 1;
    this.totalPromptTokens += promptTokens;
    this.totalCompletionTokens += completionTokens;
  }

  recordToolCall(toolName: string, output: unknown): void {
    this.toolCalls += 1;
    this.ledger.toolOutputs[toolName] = output;
  }

  transitionTo(stage: DiagnosticStage): void {
    this.currentStage = stage;
  }
}
