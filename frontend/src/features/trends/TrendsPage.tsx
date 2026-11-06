import React, { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import {
  queryKeys,
  useDiagnosisHistoryQuery,
  useRepositoriesQuery,
} from '../../api/hooks';
import { api } from '../../api/client';
import {
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  InlineNotice,
  MetricCard,
  PageHeader,
  Skeleton,
} from '../../components/ui/primitives';
import { BarChart, DistributionBar } from '../../components/ui/Chart';
import { bucketByDay, countByCategory } from '../../lib/filters';
import { formatNumber, formatPercent } from '../../lib/format';
import type { WorkflowFailure } from '../../api/schema';

const MAX_REPOS = 8;

const TrendsPage: React.FC = () => {
  const { workspaceId } = useWorkspace();
  const repositoriesQuery = useRepositoriesQuery(workspaceId);
  const diagnosesQuery = useDiagnosisHistoryQuery(workspaceId);

  const repositories = repositoriesQuery.data?.repositories ?? [];
  const sampled = repositories.slice(0, MAX_REPOS);

  const failureQueries = useQueries({
    queries: sampled.map((repository) => ({
      queryKey: queryKeys.repoFailures(repository.id),
      queryFn: () => api.getRepositoryFailures(repository.id),
      staleTime: 60_000,
      retry: 1,
    })),
  });

  const failures = useMemo<WorkflowFailure[]>(
    () => failureQueries.flatMap((query) => query.data?.failures ?? []),
    [failureQueries]
  );

  const diagnoses = diagnosesQuery.data?.diagnoses ?? [];
  const loading = repositoriesQuery.isLoading || failureQueries.some((query) => query.isLoading);

  const daily = useMemo(
    () => bucketByDay(failures).slice(-21).map((bucket) => ({ label: bucket.date.slice(5), value: bucket.count })),
    [failures]
  );
  const categories = useMemo(() => countByCategory(diagnoses), [diagnoses]);

  const passCount = failures.filter((failure) => failure.exitCode === 0).length;
  const failCount = failures.length - passCount;
  const passRate = failures.length > 0 ? (passCount / failures.length) * 100 : null;

  const repoRows = useMemo(
    () =>
      sampled
        .map((repository, index) => ({
          name: repository.full_name,
          failures: failureQueries[index]?.data?.failures.length ?? 0,
        }))
        .sort((a, b) => b.failures - a.failures),
    [sampled, failureQueries]
  );

  const maxRepoFailures = Math.max(...repoRows.map((row) => row.failures), 1);

  return (
    <>
      <PageHeader
        title="Reliability"
        description="Derived from stored events in this workspace. Charts only include buckets that have data, so an empty chart means no failures were recorded — not zero activity."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Recorded events"
          value={loading ? '…' : formatNumber(failures.length)}
          hint={`Across ${sampled.length} sampled repositor${sampled.length === 1 ? 'y' : 'ies'}`}
        />
        <MetricCard
          label="Failed events"
          value={loading ? '…' : formatNumber(failCount)}
          hint="Rows whose exit code was not zero"
          tone={failCount > 0 ? 'danger' : 'neutral'}
        />
        <MetricCard
          label="Pass rate (sampled)"
          value={loading ? '…' : formatPercent(passRate, 0)}
          hint="Failed feed rows with a zero exit code"
          tone="accent"
        />
        <MetricCard
          label="Distinct error categories"
          value={diagnosesQuery.isLoading ? '…' : formatNumber(categories.length)}
          hint="From stored diagnoses"
        />
      </div>

      {repositoriesQuery.isError ? (
        <div className="mt-4">
          <ErrorState
            title="Could not load repositories"
            message={(repositoriesQuery.error as Error).message}
            onRetry={() => void repositoriesQuery.refetch()}
          />
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Failures per day" description="Last 21 days with recorded failures." />
          {loading ? <Skeleton className="mx-5 mb-5 h-36" /> : (
            <BarChart
              data={daily}
              title="Failures per day"
              valueLabel="Failures"
              tone="danger"
              emptyMessage="No failures recorded in the sampled repositories."
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Error categories" description="Distribution across stored diagnoses." />
          {diagnosesQuery.isLoading ? (
            <Skeleton className="mx-5 mb-5 h-36" />
          ) : (
            <DistributionBar
              items={categories.map((item) => ({ label: item.category, value: item.count }))}
              total={categories.reduce((sum, item) => sum + item.count, 0)}
              emptyMessage="No diagnoses stored yet, so no categories can be derived."
            />
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Failures by repository"
            description="Counted from each repository's stored failure feed."
          />
          {loading ? (
            <Skeleton className="mx-5 mb-5 h-28" />
          ) : repoRows.length === 0 ? (
            <EmptyState title="No repositories" description="Connect a repository to see per-repository reliability." />
          ) : (
            <ul className="space-y-2.5 px-5 pb-5">
              {repoRows.map((row) => (
                <li key={row.name}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="truncate font-mono text-ink-secondary">{row.name}</span>
                    <span className="shrink-0 font-mono text-ink-muted">{row.failures}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-overlay" aria-hidden>
                    <div
                      className="h-full rounded-full bg-danger/70"
                      style={{ width: `${(row.failures / maxRepoFailures) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <InlineNotice tone="neutral" title="What is not shown">
          Mean time to recovery and total workflow volume need run-level timestamps and a
          workspace-wide event count, which the current API does not expose. They are omitted rather
          than estimated.
        </InlineNotice>
      </div>
    </>
  );
};

export default TrendsPage;
