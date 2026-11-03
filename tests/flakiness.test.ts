import { describe, it, expect } from 'vitest';
import { calculateFlakinessScore } from '../src/lib/moat/flakiness-engine.js';

describe('Flakiness Engine', () => {
  it('should score high confidence (>70%) for multiple same-SHA retry passes', () => {
    const score = calculateFlakinessScore({
      sameShaRetryPasses: 2,
      uniquePrsAffected: 1,
      totalOccurrences: 3,
      mainBranchOccurrences: 0,
      cleanedSnippet: 'Assertion failed',
    });
    expect(score).toBeGreaterThanOrEqual(75);
  });

  it('should boost flakiness score when transient timeout / network patterns exist', () => {
    const baseScore = calculateFlakinessScore({
      sameShaRetryPasses: 0,
      uniquePrsAffected: 1,
      totalOccurrences: 1,
      mainBranchOccurrences: 0,
      cleanedSnippet: 'Deterministic syntax error in build',
    });

    const transientScore = calculateFlakinessScore({
      sameShaRetryPasses: 0,
      uniquePrsAffected: 1,
      totalOccurrences: 1,
      mainBranchOccurrences: 0,
      cleanedSnippet: 'ETIMEDOUT: Test timeout of 30000ms exceeded',
    });

    expect(transientScore).toBeGreaterThan(baseScore);
    expect(transientScore).toBeGreaterThanOrEqual(20);
  });

  it('should bound score between 2 and 99', () => {
    const minScore = calculateFlakinessScore({
      sameShaRetryPasses: 0,
      uniquePrsAffected: 0,
      totalOccurrences: 0,
      mainBranchOccurrences: 0,
      cleanedSnippet: 'clean',
    });
    expect(minScore).toBeGreaterThanOrEqual(2);

    const maxScore = calculateFlakinessScore({
      sameShaRetryPasses: 10,
      uniquePrsAffected: 10,
      totalOccurrences: 100,
      mainBranchOccurrences: 10,
      cleanedSnippet: 'timeout of 5000ms exceeded ECONNRESET exit code 137',
    });
    expect(maxScore).toBeLessThanOrEqual(99);
  });
});
