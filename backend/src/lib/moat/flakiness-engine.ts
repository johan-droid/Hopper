/**
 * Flakiness Engine: Computes a 0-100% flakiness probability based on:
 * 1. Same-SHA Retry Passes (Commit failed on attempt 1, passed on attempt 2)
 * 2. Cross-PR Spread (Same error signature across unrelated PRs)
 * 3. Default branch failure frequency (Occurring on main)
 * 4. Transient error pattern recognition (Timeouts, network resets, docker OOM, race conditions)
 */

export interface FlakinessInput {
  sameShaRetryPasses: number;
  uniquePrsAffected: number;
  totalOccurrences: number;
  mainBranchOccurrences: number;
  cleanedSnippet: string;
  /** Git branch partition: default_branch (e.g. main/master) vs feature pr_branch */
  branchClass?: 'default_branch' | 'pr_branch';
  /** CI rerun attempt (e.g. attempt 2 on the same commit SHA) */
  runAttempt?: number;
  commitSha?: string;
  /** Whether the files touched in the commit intersect with the failing test file/module */
  hasCodeChangeIntersection?: boolean;
  /** Consecutive clean commits on the default branch where pass/fail oscillated */
  consecutiveCleanBranchOscillations?: number;
}

export const TRANSIENT_PATTERNS: RegExp[] = [
  /timeout\s+of\s+\d+ms\s+exceeded/i,
  /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i,
  /Test timeout of \d+ms exceeded/i,
  /waiting for (?:selector|locator|navigation)/i,
  /exit code 137/i, // Docker OOM / SIGKILL
  /Deadlock found when trying to get lock/i,
  /rate limit exceeded|429 Too Many Requests/i,
  /Connection reset by peer/i,
  /Socket closed unexpectedly/i,
];

export function calculateFlakinessScore(input: FlakinessInput): number {
  let score = 0;

  // Signal 1: Confirmed pass-on-retry on the exact same commit SHA (strongest direct signal)
  if (input.sameShaRetryPasses >= 2) {
    score += 75;
  } else if (input.sameShaRetryPasses === 1) {
    score += 55;
  } else if (input.runAttempt && input.runAttempt > 1) {
    score += 20;
  }

  // Signal 2: Partitioned Default Branch Oscillation without Code Intersection
  if (input.branchClass === 'default_branch') {
    if (input.hasCodeChangeIntersection === false) {
      // Failed on main even though commit didn't touch the failing code -> strong flake signal
      score += 35;
    }
    if (input.consecutiveCleanBranchOscillations && input.consecutiveCleanBranchOscillations >= 1) {
      score += 20;
    }
    if (input.mainBranchOccurrences >= 2) {
      score += 10;
    }
  }

  // Signal 3: Appears across multiple unrelated PRs (indicates pre-existing instability)
  if (input.uniquePrsAffected >= 4) {
    score += 25;
  } else if (input.uniquePrsAffected >= 2) {
    score += 15;
  }

  // Signal 4: Known transient timing, network, or infra markers in the log snippet
  const matchesTransient = TRANSIENT_PATTERNS.some((rx) => rx.test(input.cleanedSnippet));
  if (matchesTransient) {
    score += 20;
  }

  // Anti-Pattern Suppression: Developer-Induced PR Branch Breakage
  // If the failure occurs on a feature/PR branch, the developer directly modified the
  // failing file, and there are NO same-SHA retry passes, this is deterministic author
  // breakage, NOT flakiness. Suppress flakiness score.
  if (
    input.branchClass === 'pr_branch' &&
    input.hasCodeChangeIntersection === true &&
    input.sameShaRetryPasses === 0
  ) {
    score = Math.min(score, 15);
  }

  // Bound between 2% and 99%
  return Math.min(99, Math.max(2, score));
}
