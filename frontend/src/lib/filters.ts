import type { WorkflowFailure, DiagnosisHistoryItem } from '../api/schema';

export type TimeRange = '24h' | '7d' | '30d' | 'all';

export interface FailureFilters {
  query?: string;
  branch?: 'all' | 'default' | 'pull_request';
  status?: 'all' | 'failed' | 'success';
  range?: TimeRange;
}

export function rangeToMs(range: TimeRange, now: Date = new Date()): number | null {
  switch (range) {
    case '24h':
      return now.getTime() - 24 * 60 * 60 * 1000;
    case '7d':
      return now.getTime() - 7 * 24 * 60 * 60 * 1000;
    case '30d':
      return now.getTime() - 30 * 24 * 60 * 60 * 1000;
    case 'all':
    default:
      return null;
  }
}

function matchesQuery(failure: WorkflowFailure, query: string): boolean {
  const haystack = [
    failure.commitSha,
    failure.branch,
    failure.workflowName,
    failure.jobName,
    failure.failedStepName,
    failure.actorLogin,
    failure.prNumber ? `#${failure.prNumber}` : '',
    String(failure.githubRunId),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

/**
 * Filters are applied client-side over a single repository's failure feed — the
 * backend exposes no server-side filter parameters, so this must stay cheap and
 * predictable. Unknown values are treated as "no data" rather than guessed.
 */
export function filterFailures(
  failures: WorkflowFailure[],
  filters: FailureFilters,
  now: Date = new Date()
): WorkflowFailure[] {
  const query = filters.query?.trim() ?? '';
  const since = rangeToMs(filters.range ?? 'all', now);

  return failures.filter((failure) => {
    if (query && !matchesQuery(failure, query)) return false;

    if (filters.branch === 'pull_request' && failure.prNumber === null) return false;
    if (filters.branch === 'default' && failure.prNumber !== null) return false;

    if (filters.status === 'failed' && failure.exitCode === 0) return false;
    if (filters.status === 'success' && failure.exitCode !== 0) return false;

    if (since !== null) {
      const failedAt = new Date(failure.failedAt).getTime();
      if (!Number.isNaN(failedAt) && failedAt < since) return false;
    }

    return true;
  });
}

export function filterDiagnoses(
  diagnoses: DiagnosisHistoryItem[],
  options: { query?: string; category?: string; range?: TimeRange },
  now: Date = new Date()
): DiagnosisHistoryItem[] {
  const query = options.query?.trim().toLowerCase() ?? '';
  const since = rangeToMs(options.range ?? 'all', now);

  return diagnoses.filter((diagnosis) => {
    if (options.category && options.category !== 'all' && diagnosis.errorCategory !== options.category) {
      return false;
    }
    if (query) {
      const haystack = [
        diagnosis.repoFullName,
        diagnosis.workflowName,
        diagnosis.jobName,
        diagnosis.failedStepName,
        diagnosis.commitSha,
        diagnosis.branch,
        diagnosis.rootCauseClues,
        diagnosis.signatureHash,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (since !== null) {
      const created = new Date(diagnosis.createdAt).getTime();
      if (!Number.isNaN(created) && created < since) return false;
    }
    return true;
  });
}

export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function pageCount(totalItems: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export interface DailyBucket {
  date: string;
  count: number;
}

/**
 * Buckets failures into calendar days (UTC) for the reliability chart. Returns
 * only days that have data, oldest first — no zero-filled fabrication.
 */
export function bucketByDay(failures: WorkflowFailure[]): DailyBucket[] {
  const buckets = new Map<string, number>();

  for (const failure of failures) {
    const failedAt = new Date(failure.failedAt);
    if (Number.isNaN(failedAt.getTime())) continue;
    const key = failedAt.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return [...buckets.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function countByCategory(
  diagnoses: DiagnosisHistoryItem[]
): Array<{ category: string; count: number }> {
  const counts = new Map<string, number>();
  for (const diagnosis of diagnoses) {
    const category = diagnosis.errorCategory || 'unknown';
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

export interface RepoFailureSummary {
  repoId: string;
  failures: number;
  lastFailureAt: string | null;
}

export function summariseByRepo(
  entries: Array<{ repoId: string; failures: WorkflowFailure[] }>
): RepoFailureSummary[] {
  return entries.map(({ repoId, failures }) => {
    const timestamps = failures
      .map((failure) => new Date(failure.failedAt).getTime())
      .filter((value) => !Number.isNaN(value));
    return {
      repoId,
      failures: failures.length,
      lastFailureAt: timestamps.length
        ? new Date(Math.max(...timestamps)).toISOString()
        : null,
    };
  });
}
