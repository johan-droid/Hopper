import { describe, it, expect } from 'vitest';
import {
  bucketByDay,
  countByCategory,
  filterDiagnoses,
  filterFailures,
  pageCount,
  paginate,
  rangeToMs,
  summariseByRepo,
} from './filters';
import type { DiagnosisHistoryItem, WorkflowFailure } from '../api/schema';

const NOW = new Date('2026-11-06T12:00:00Z');

const failure = (overrides: Partial<WorkflowFailure> = {}): WorkflowFailure => ({
  id: 'f1',
  githubRunId: 1,
  commitSha: 'abc1234',
  branch: 'main',
  failedAt: '2026-11-05T10:00:00Z',
  sanitizedLogSnippet: 'boom',
  ...overrides,
});

const diagnosis = (overrides: Partial<DiagnosisHistoryItem> = {}): DiagnosisHistoryItem => ({
  id: 'd1',
  rootCauseClues: 'database unreachable',
  createdAt: '2026-11-05T10:00:00Z',
  errorCategory: 'infra',
  flakinessScore: 10,
  ...overrides,
});

describe('rangeToMs', () => {
  it('returns a cutoff for bounded ranges and null for all time', () => {
    expect(rangeToMs('24h', NOW)).toBe(NOW.getTime() - 86_400_000);
    expect(rangeToMs('7d', NOW)).toBe(NOW.getTime() - 7 * 86_400_000);
    expect(rangeToMs('all', NOW)).toBeNull();
  });
});

describe('filterFailures', () => {
  it('matches commit, branch, workflow, job and PR number', () => {
    const rows = [
      failure({ id: 'a', commitSha: 'deadbeef', branch: 'release' }),
      failure({ id: 'b', workflowName: 'Nightly', jobName: 'e2e' }),
    ];

    expect(filterFailures(rows, { query: 'deadbe' })).toHaveLength(1);
    expect(filterFailures(rows, { query: 'release' })).toHaveLength(1);
    expect(filterFailures(rows, { query: 'nightly' })).toHaveLength(1);
  });

  it('separates pull-request rows from default-branch rows', () => {
    const rows = [
      failure({ id: 'pr', prNumber: 42 }),
      failure({ id: 'main', prNumber: null }),
    ];

    expect(filterFailures(rows, { branch: 'pull_request' }).map((row) => row.id)).toEqual(['pr']);
    expect(filterFailures(rows, { branch: 'default' }).map((row) => row.id)).toEqual(['main']);
  });

  it('applies the time window and excludes rows with no parseable date only when a cutoff exists', () => {
    const rows = [
      failure({ id: 'fresh', failedAt: '2026-11-06T09:00:00Z' }),
      failure({ id: 'stale', failedAt: '2026-10-01T09:00:00Z' }),
      failure({ id: 'relative', failedAt: '12 mins ago' }),
    ];

    const recent = filterFailures(rows, { range: '24h' }, NOW).map((row) => row.id);
    expect(recent).toContain('fresh');
    expect(recent).toContain('relative');
    expect(recent).not.toContain('stale');
  });

  it('filters by exit code', () => {
    const rows = [failure({ id: 'ok', exitCode: 0 }), failure({ id: 'bad', exitCode: 1 })];
    expect(filterFailures(rows, { status: 'failed' }).map((row) => row.id)).toEqual(['bad']);
    expect(filterFailures(rows, { status: 'success' }).map((row) => row.id)).toEqual(['ok']);
  });
});

describe('filterDiagnoses', () => {
  it('searches root cause text and filters by category', () => {
    const rows = [
      diagnosis({ id: 'x', rootCauseClues: 'Docker daemon unreachable' }),
      diagnosis({ id: 'y', errorCategory: 'test_assertion', rootCauseClues: 'expected true' }),
    ];

    expect(filterDiagnoses(rows, { query: 'docker' }).map((row) => row.id)).toEqual(['x']);
    expect(filterDiagnoses(rows, { category: 'test_assertion' }).map((row) => row.id)).toEqual(['y']);
    expect(filterDiagnoses(rows, { category: 'all' })).toHaveLength(2);
  });
});

describe('pagination', () => {
  it('slices pages without losing or duplicating items', () => {
    const items = Array.from({ length: 23 }, (_, index) => index);
    expect(paginate(items, 1, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(paginate(items, 3, 10)).toEqual([20, 21, 22]);
    expect(pageCount(23, 10)).toBe(3);
    expect(pageCount(0, 10)).toBe(1);
    expect(paginate(items, 0, 10)[0]).toBe(0);
  });
});

describe('aggregation', () => {
  it('buckets failures by UTC day, oldest first, skipping unparseable rows', () => {
    const buckets = bucketByDay([
      failure({ id: 'a', failedAt: '2026-11-05T23:00:00Z' }),
      failure({ id: 'b', failedAt: '2026-11-05T01:00:00Z' }),
      failure({ id: 'c', failedAt: '2026-11-04T12:00:00Z' }),
      failure({ id: 'd', failedAt: 'not a date' }),
    ]);

    expect(buckets).toEqual([
      { date: '2026-11-04', count: 1 },
      { date: '2026-11-05', count: 2 },
    ]);
  });

  it('counts categories in descending order', () => {
    const counts = countByCategory([
      diagnosis({ id: '1', errorCategory: 'timeout' }),
      diagnosis({ id: '2', errorCategory: 'timeout' }),
      diagnosis({ id: '3', errorCategory: 'infra' }),
    ]);

    expect(counts[0]).toEqual({ category: 'timeout', count: 2 });
    expect(counts[1]).toEqual({ category: 'infra', count: 1 });
  });

  it('summarises failures per repository with the newest timestamp', () => {
    const summary = summariseByRepo([
      {
        repoId: 'r1',
        failures: [failure({ failedAt: '2026-11-01T00:00:00Z' }), failure({ failedAt: '2026-11-03T00:00:00Z' })],
      },
      { repoId: 'r2', failures: [] },
    ]);

    expect(summary[0]).toEqual({ repoId: 'r1', failures: 2, lastFailureAt: '2026-11-03T00:00:00.000Z' });
    expect(summary[1]).toEqual({ repoId: 'r2', failures: 0, lastFailureAt: null });
  });
});
