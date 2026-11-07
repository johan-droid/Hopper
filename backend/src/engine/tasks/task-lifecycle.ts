/**
 * Autonomous Engineering Task State Machine & Execution Policies.
 * Enforces explicit state transitions, human approval gates, and sandbox isolation boundaries.
 */

export type TaskLifecycleState =
  | 'submitted'
  | 'authorized'
  | 'inspected'
  | 'planned'
  | 'awaiting_execution'
  | 'executing'
  | 'verifying'
  | 'repairing'
  | 'ready_for_review'
  | 'pull_request_opened'
  | 'needs_approval'
  | 'blocked'
  | 'cancelled'
  | 'failed'
  | 'completed';

export const ALLOWED_TRANSITIONS: Record<TaskLifecycleState, TaskLifecycleState[]> = {
  submitted: ['authorized', 'blocked', 'cancelled', 'failed'],
  authorized: ['inspected', 'blocked', 'cancelled', 'failed'],
  inspected: ['planned', 'blocked', 'cancelled', 'failed'],
  planned: ['awaiting_execution', 'needs_approval', 'blocked', 'cancelled', 'failed'],
  awaiting_execution: ['executing', 'needs_approval', 'blocked', 'cancelled'],
  executing: ['verifying', 'repairing', 'blocked', 'failed', 'cancelled'],
  verifying: ['ready_for_review', 'repairing', 'failed', 'cancelled'],
  repairing: ['executing', 'verifying', 'blocked', 'failed', 'cancelled'],
  ready_for_review: ['pull_request_opened', 'completed', 'cancelled'],
  pull_request_opened: ['completed', 'cancelled'],
  needs_approval: ['awaiting_execution', 'cancelled', 'blocked'],
  blocked: ['authorized', 'cancelled'],
  failed: ['submitted', 'cancelled'],
  cancelled: [],
  completed: [],
};

export interface TaskTransitionEvent {
  from: TaskLifecycleState;
  to: TaskLifecycleState;
  timestamp: string;
  reason?: string;
  actor?: string;
}

export interface TaskExecutionPolicy {
  /** Explicit human sign-off required before creating or updating PRs. */
  requireHumanApprovalBeforePR: true;
  /** Auto-merge is strictly prohibited on Hopper. */
  autoMergeAllowed: false;
  /** Untrusted code execution boundary. Never run inside Vercel Control Plane. */
  executionSandbox: 'isolated_runner' | 'none';
  /** Max bounded repair loops before transitioning to blocked/needs_approval. */
  maxRepairAttempts: number;
}

export const DEFAULT_EXECUTION_POLICY: TaskExecutionPolicy = {
  requireHumanApprovalBeforePR: true,
  autoMergeAllowed: false,
  executionSandbox: 'isolated_runner',
  maxRepairAttempts: 3,
};

/**
 * Validates whether a state transition is legal in the task lifecycle state machine.
 */
export function isValidTransition(from: TaskLifecycleState, to: TaskLifecycleState): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Validates and records a state transition. Throws if illegal.
 */
export function transitionTaskState(
  currentState: TaskLifecycleState,
  nextState: TaskLifecycleState,
  options: { reason?: string; actor?: string } = {}
): TaskTransitionEvent {
  if (!isValidTransition(currentState, nextState)) {
    throw new Error(
      `Illegal task state transition: Cannot transition from "${currentState}" to "${nextState}".`
    );
  }

  return {
    from: currentState,
    to: nextState,
    timestamp: new Date().toISOString(),
    reason: options.reason,
    actor: options.actor,
  };
}
