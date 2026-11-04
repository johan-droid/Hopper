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
  }

  // Signal 2: Appears across multiple unrelated PRs (indicates pre-existing instability)
  if (input.uniquePrsAffected >= 4) {
    score += 25;
  } else if (input.uniquePrsAffected >= 2) {
    score += 15;
  }

  // Signal 3: Failing intermittently on default branch (`main`)
  if (input.mainBranchOccurrences >= 2) {
    score += 10;
  }

  // Signal 4: Known transient timing, network, or infra markers in the log snippet
  const matchesTransient = TRANSIENT_PATTERNS.some((rx) => rx.test(input.cleanedSnippet));
  if (matchesTransient) {
    score += 20;
  }

  // Bound between 2% and 99%
  return Math.min(99, Math.max(2, score));
}
