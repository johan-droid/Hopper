/**
 * Timeout Policy & Deadline Manager (Hopper AI Gateway).
 *
 * Enforces fine-grained deadline control across model invocations:
 * 1. Connection timeout (establishing socket connection)
 * 2. Response start / TTFT timeout (waiting for first byte)
 * 3. Total task deadline (hard bound on end-to-end model response)
 * 4. Cooperative cancellation (forwarding AbortSignal to underlying HTTP transport)
 */

import type { TaskComplexity, TaskType } from '../contracts.js';

export interface TimeoutConfig {
  readonly connectTimeoutMs: number;
  readonly responseStartTimeoutMs: number;
  readonly overallTimeoutMs: number;
}

export const TASK_TIMEOUT_MAP: Record<TaskComplexity, TimeoutConfig> = {
  light: {
    connectTimeoutMs: 3_000,
    responseStartTimeoutMs: 5_000,
    overallTimeoutMs: 10_000,
  },
  medium: {
    connectTimeoutMs: 5_000,
    responseStartTimeoutMs: 10_000,
    overallTimeoutMs: 25_000,
  },
  heavy: {
    connectTimeoutMs: 5_000,
    responseStartTimeoutMs: 15_000,
    overallTimeoutMs: 45_000,
  },
};

export class TimeoutPolicy {
  /**
   * Resolves the appropriate timeout configuration for a task type and complexity.
   */
  static getTimeout(
    complexity: TaskComplexity = 'medium',
    overrideMs?: number
  ): TimeoutConfig {
    const base = TASK_TIMEOUT_MAP[complexity] ?? TASK_TIMEOUT_MAP.medium;
    if (overrideMs && overrideMs > 0) {
      return {
        ...base,
        overallTimeoutMs: overrideMs,
      };
    }
    return base;
  }

  /**
   * Creates a linked AbortSignal that aborts if either:
   * 1. The parent caller signal aborts, or
   * 2. The task deadline fires.
   */
  static createDeadlineSignal(
    deadlineMs: number,
    parentSignal?: AbortSignal
  ): { signal: AbortSignal; cleanup: () => void } {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new Error(`AI Gateway request exceeded deadline of ${deadlineMs}ms`));
    }, deadlineMs);

    let onParentAbort: (() => void) | undefined;
    if (parentSignal) {
      if (parentSignal.aborted) {
        clearTimeout(timer);
        controller.abort(parentSignal.reason);
      } else {
        onParentAbort = () => {
          clearTimeout(timer);
          controller.abort(parentSignal.reason);
        };
        parentSignal.addEventListener('abort', onParentAbort, { once: true });
      }
    }

    const cleanup = () => {
      clearTimeout(timer);
      if (parentSignal && onParentAbort) {
        parentSignal.removeEventListener('abort', onParentAbort);
      }
    };

    return { signal: controller.signal, cleanup };
  }
}
