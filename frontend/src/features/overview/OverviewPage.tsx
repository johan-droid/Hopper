import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { useDiagnosisHistoryQuery, useRepositoriesQuery } from '../../api/hooks';
import { api, ApiError } from '../../api/client';
import { queryKeys } from '../../api/hooks';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  InlineNotice,
  MetricCard,
  PageHeader,
  Skeleton,
} from '../../components/ui/primitives';
import { DataTable } from '../../components/ui/DataTable';
import { BarChart } from '../../components/ui/Chart';
import { bucketByDay } from '../../lib/filters';
import { formatNumber, formatRelativeTime, flakinessLabel, shortSha } from '../../lib/format';
import { ROUTES } from '../../lib/routes';
import type { WorkflowFailure } from '../../api/schema';
import { Activity, ArrowRight, GitBranch, Plus, Search } from 'lucide-react';

const MAX_REPOS_FOR_AGGREGATE = 8;

const OverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const { workspaceId, workspace, errorMessage, refetch } = useWorkspace();

  const repositoriesQuery = useRepositoriesQuery(workspaceId);
  const repositories = repositoriesQuery.data?.repositories ?? [];
  const diagnosesQuery = useDiagnosisHistoryQuery(workspaceId);
  const diagnoses = diagnosesQuery.data?.diagnoses ?? [];

  const sampledRepos = repositories.slice(0, MAX_REPOS_FOR_AGGREGATE);
  const failureQueries = useQueries({
    queries: sampledRepos.map((repository) => ({
      queryKey: queryKeys.repoFailures(repository.id),
      queryFn: () => api.getRepositoryFailures(repository.id),
      staleTime: 30_000,
      retry: 1,
    })),
  });

  const failures = useMemo(() => {
    const rows: Array<WorkflowFailure & { repoFullName: string }> = [];
    failureQueries.forEach((query, index) => {
      const repository = sampledRepos[index];
      for (const failure of query.data?.failures ?? []) {
        rows.push({ ...failure, repoFullName: repository.full_name });
      }
    });
    return rows.sort((a, b) => new Date(b.failedAt).getTime() - new Date(a.failedAt).getTime());
  }, [failureQueries, sampledRepos]);

  const loadingFailures = failureQueries.some((query) => query.isLoading);

  const signatures = useMemo(() => {
    const map = new Map<string, { hash: string; count: number; score: number; category: string }>();
    for (const diagnosis of diagnoses) {
      const hash = diagnosis.signatureHash ?? diagnosis.id;
      const existing = map.get(hash);
      if (existing) {
        existing.count += 1;
        existing.score = Math.max(existing.score, diagnosis.flakinessScore);
      } else {
        map.set(hash, {
          hash,
          count: 1,
          score: diagnosis.flakinessScore,
          category: diagnosis.errorCategory,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  }, [diagnoses]);

  const dailyBuckets = useMemo(
    () =>
      bucketByDay(failures)
        .slice(-14)
        .map((bucket) => ({ label: bucket.date.slice(5), value: bucket.count })),
    [failures]
  );

  if (repositoriesQuery.isError) {
    const error = repositoriesQuery.error;
    const unauthorized = error instanceof ApiError && error.isUnauthorized;
    return (
      <>
        <PageHeader title="Overview" description="Your workspace at a glance." />
        <ErrorState
          title={unauthorized ? 'You do not have access to this workspace' : 'Could not load your workspace'}
          message={errorMessage ?? (error as Error)?.message ?? 'The repositories request failed.'}
          onRetry={refetch}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Overview"
        description={
          workspace
            ? `Recorded CI activity and diagnoses for ${workspace.name}.`
            : 'Recorded CI activity and diagnoses.'
        }
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => void repositoriesQuery.refetch()} loading={repositoriesQuery.isFetching}>
              Refresh
            </Button>
            <Button size="sm" variant="primary" onClick={() => navigate(ROUTES.investigations)}>
              <Search className="h-3.5 w-3.5" aria-hidden />
              Diagnose a log
            </Button>
          </>
        }
      />

      <section aria-label="Workspace metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Repositories"
          value={formatNumber(repositories.length)}
          hint="Connected to this workspace"
          tone={repositories.length > 0 ? 'success' : 'neutral'}
        />
        <MetricCard
          label="Failures recorded"
          value={loadingFailures ? '…' : formatNumber(failures.length)}
          hint={
            repositories.length > MAX_REPOS_FOR_AGGREGATE
              ? `Across the ${MAX_REPOS_FOR_AGGREGATE} most recent of ${repositories.length} repositories`
              : 'Across connected repositories'
          }
          tone={failures.length > 0 ? 'warning' : 'neutral'}
        />
        <MetricCard
          label="Diagnoses stored"
          value={diagnosesQuery.isLoading ? '…' : formatNumber(diagnoses.length)}
          hint="Persisted diagnosis records"
          tone={diagnoses.length > 0 ? 'accent' : 'neutral'}
        />
        <MetricCard
          label="Mean time to recovery"
          unavailableReason="The API does not expose run durations or recovery timestamps, so this cannot be computed."
        />
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader
            title="Recent failures"
            description="Newest first, from the repositories in this workspace."
            actions={
              <Link
                to={ROUTES.activity}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              >
                All activity <ArrowRight className="h-3 w-3" aria-hidden />
              </Link>
            }
          />
          <DataTable
            caption="Recent CI failures"
            columns={[
              {
                id: 'repo',
                header: 'Repository',
                cell: (row) => (
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{row.repoFullName}</p>
                    <p className="truncate text-[11px] text-ink-muted">
                      {row.workflowName ?? 'Workflow'} · {row.jobName ?? 'job'}
                    </p>
                  </div>
                ),
              },
              {
                id: 'commit',
                header: 'Commit',
                hideOnMobile: true,
                cell: (row) => (
                  <span className="font-mono text-ink-secondary">
                    {shortSha(row.commitSha)}
                    {row.prNumber ? <span className="ml-1.5 text-ink-muted">#{row.prNumber}</span> : null}
                  </span>
                ),
              },
              {
                id: 'step',
                header: 'Failed step',
                hideOnMobile: true,
                cell: (row) =>
                  row.failedStepName ? (
                    <Badge tone="danger">{row.failedStepName}</Badge>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  ),
              },
              {
                id: 'when',
                header: 'When',
                className: 'text-right',
                cell: (row) => <span className="text-ink-muted">{formatRelativeTime(row.failedAt)}</span>,
              },
            ]}
            rows={failures.slice(0, 8)}
            rowKey={(row) => row.id}
            loading={repositoriesQuery.isLoading || loadingFailures}
            empty={
              <EmptyState
                icon={<Activity className="h-5 w-5" />}
                title="No failures recorded yet"
                description="Hopper has not stored a workflow failure for these repositories. Failures appear here once the GitHub App delivers a completed failing run."
              />
            }
          />
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Failures per day" description="Last 14 days that have data." />
            <BarChart
              data={dailyBuckets}
              title="Recorded failures per day"
              valueLabel="Failures"
              tone="danger"
              emptyMessage="No failures in the sampled repositories."
            />
          </Card>

          <Card>
            <CardHeader
              title="Recurring signatures"
              description="Grouped by fingerprint across stored diagnoses."
            />
            {diagnosesQuery.isLoading ? (
              <div className="space-y-2 px-5 pb-5">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-8 w-full" />
                ))}
              </div>
            ) : signatures.length === 0 ? (
              <EmptyState
                title="No signatures yet"
                description="Signatures are created when a failure is fingerprinted. Run an ad-hoc diagnosis to see one."
              />
            ) : (
              <ul className="divide-y divide-hairline">
                {signatures.map((signature) => {
                  const tone = flakinessLabel(signature.score);
                  return (
                    <li key={signature.hash} className="flex items-center justify-between gap-3 px-5 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[11px] text-ink-secondary">{signature.hash}</p>
                        <p className="mt-0.5 text-[10px] text-ink-muted">
                          {signature.category} · {signature.count} diagnosis{signature.count === 1 ? '' : 'es'}
                        </p>
                      </div>
                      <Badge tone={tone.tone === 'danger' ? 'danger' : tone.tone === 'warning' ? 'warning' : 'neutral'}>
                        {tone.label}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {repositories.length === 0 && !repositoriesQuery.isLoading ? (
        <div className="mt-4">
          <InlineNotice tone="accent" title="Connect a repository to begin">
            Install the GitHub App on a repository and send one completed workflow event. Repositories
            linked to this workspace appear here automatically.{' '}
            <Link to={ROUTES.repositories} className="underline">
              Manage repositories
            </Link>
            .
          </InlineNotice>
        </div>
      ) : null}

      {repositories.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link
            to={ROUTES.repositories}
            className="surface flex items-center gap-3 rounded-lg px-4 py-3 transition-colors hover:bg-overlay/50"
          >
            <GitBranch className="h-4 w-4 text-accent" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink">Repositories</p>
              <p className="truncate text-[11px] text-ink-muted">Branches, connection state, failures</p>
            </div>
          </Link>
          <Link
            to={ROUTES.investigations}
            className="surface flex items-center gap-3 rounded-lg px-4 py-3 transition-colors hover:bg-overlay/50"
          >
            <Search className="h-4 w-4 text-accent" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink">Investigate</p>
              <p className="truncate text-[11px] text-ink-muted">Paste a log for an ad-hoc diagnosis</p>
            </div>
          </Link>
          <Link
            to={ROUTES.trends}
            className="surface flex items-center gap-3 rounded-lg px-4 py-3 transition-colors hover:bg-overlay/50"
          >
            <Plus className="h-4 w-4 text-accent" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-medium text-ink">Reliability</p>
              <p className="truncate text-[11px] text-ink-muted">Categories and daily distribution</p>
            </div>
          </Link>
        </div>
      ) : null}
    </>
  );
};

export default OverviewPage;
