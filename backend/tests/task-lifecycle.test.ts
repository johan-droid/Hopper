import { describe, it, expect } from 'vitest';
import {
  isValidTransition,
  transitionTaskState,
  DEFAULT_EXECUTION_POLICY,
  TaskLifecycleState,
} from '../src/engine/tasks/task-lifecycle.js';

describe('Task Lifecycle State Machine & Execution Policies', () => {
  it('enforces human approval policy and disallows auto-merge', () => {
    expect(DEFAULT_EXECUTION_POLICY.requireHumanApprovalBeforePR).toBe(true);
    expect(DEFAULT_EXECUTION_POLICY.autoMergeAllowed).toBe(false);
    expect(DEFAULT_EXECUTION_POLICY.maxRepairAttempts).toBe(3);
  });

  it('allows valid sequential lifecycle transitions', () => {
    const sequence: TaskLifecycleState[] = [
      'submitted',
      'authorized',
      'inspected',
      'planned',
      'awaiting_execution',
      'executing',
      'verifying',
      'ready_for_review',
      'pull_request_opened',
      'completed',
    ];

    for (let i = 0; i < sequence.length - 1; i++) {
      const from = sequence[i];
      const to = sequence[i + 1];
      expect(isValidTransition(from, to)).toBe(true);
      const transition = transitionTaskState(from, to, { actor: 'hopper-orchestrator' });
      expect(transition.from).toBe(from);
      expect(transition.to).toBe(to);
    }
  });

  it('allows repairing loop up to bounded attempts', () => {
    expect(isValidTransition('verifying', 'repairing')).toBe(true);
    expect(isValidTransition('repairing', 'executing')).toBe(true);
    expect(isValidTransition('repairing', 'verifying')).toBe(true);
  });

  it('rejects illegal skipping transitions', () => {
    // Cannot skip directly from submitted to executing
    expect(isValidTransition('submitted', 'executing')).toBe(false);
    expect(() => transitionTaskState('submitted', 'executing')).toThrow(
      /Illegal task state transition: Cannot transition from "submitted" to "executing"/
    );

    // Cannot skip directly from planned to pull_request_opened without execution & review
    expect(isValidTransition('planned', 'pull_request_opened')).toBe(false);
    expect(() => transitionTaskState('planned', 'pull_request_opened')).toThrow(/Illegal task state transition/);

    // Completed is terminal
    expect(isValidTransition('completed', 'executing')).toBe(false);
  });

  it('supports terminal and exceptional states (needs_approval, blocked, cancelled, failed)', () => {
    expect(isValidTransition('planned', 'needs_approval')).toBe(true);
    expect(isValidTransition('executing', 'blocked')).toBe(true);
    expect(isValidTransition('verifying', 'failed')).toBe(true);
    expect(isValidTransition('awaiting_execution', 'cancelled')).toBe(true);
  });
});

