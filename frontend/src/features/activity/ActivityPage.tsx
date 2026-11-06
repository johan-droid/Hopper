import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { useRepositoriesQuery, useRepoFailuresQuery } from '../../api/hooks';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CopyButton,
  EmptyState,
  ErrorState,
  PageHeader,
  Select,
  Skeleton,
} from '../../components/ui/primitives';
import { DataTable, Pagination } from '../../components/ui/DataTable';
import { LogViewer } from '../../components/ui/LogViewer';
import { filterFailures, pageCount, paginate, type TimeRange } from '../../lib/filters';
import { formatDuration, formatRelativeTime, shortSha } from '../../lib/format';
import { ROUTES } from '../../lib/routes';
import type { WorkflowFailure } from '../../api/schema';
import { Activity, ExternalLink, GitCommit } from 'lucide-react';

const PAGE_SIZE = 15;

const ActivityPage: React.FC = () => {
  const { workspaceId } = useWorkspace();
  const repositoriesQuery = useRepositoriesQuery(workspaceId);
  const repositories = repositoriesQuery.data?.repositories ?? [];

  const [repoId, setRepoId] = useState<string | null>(null);
  const activeRepoId = repoId ?? repositories[0]?.id ?? null;
  const activeRepo = repositories.find((repository) => repository.id === activeRepoId) ?? null;

  const failuresQuery = useRepoFailuresQuery(activeRepoId);
  const failures = failuresQuery.data?.failures ?? [];

  const [query, setQuery] = useState('');
  const [range, setRange] = useState<TimeRange>('30d');
  const [status, setStatus] = useState<'all' | 'failed' | 'success'>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<WorkflowFailure | null>(null);

  const filtered = useMemo(
    () => filterFailures(failures, { query, range, status }),
    [failures, query, range, status]
  );
  const totalPages = pageCount(filtered.length, PAGE_SIZE);
  const visible = paginate(filtered, Math.min(page, totalPages), PAGE_SIZE);

  if (repositoriesQuery.isError) {
    return (
      <>
        <PageHeader title="Pipeline Activity" />
        <ErrorState
          title="Could not load repositories"
          message={(repositoriesQuery.error as Error).message}
          onRetry={() => void repositoriesQuery.refetch()}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Pipeline Activity"
        description="Every workflow failure Hopper has recorded. Feed entries are stored events, refreshed on demand — not a live stream."
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void failuresQuery.refetch()}
            loading={failuresQuery.isFetching}
            disabled={!activeRepoId}
          >
            Refresh
          </Button>
        }
      />

      <Card>
        <CardHeader
          title={activeRepo ? activeRepo.full_name : 'Select a repository'}
          description={
            activeRepo
              ? `Default branch ${activeRepo.default_branch}`
              : 'Activity is fetched per repository because the API scopes the failure feed by repository.'
          }
          actions={
            <>
              <label className="sr-only" htmlFor="activity-repo">
                Repository
              </label>
              <Select
                id="activity-repo"
                value={activeRepoId ?? ''}
                onChange={(event) => {
                  setRepoId(event.target.value);
                  setPage(1);
                  setSelected(null);
                }}
                className="h-8 w-48 text-[11px]"
              >
                {repositories.length === 0 ? <option value="">No repositories</option> : null}
                {repositories.map((repository) => (
                  <option key={repository.id} value={repository.id}>
                    {repository.full_name}
                  </option>
                ))}
              </Select>
              <label className="sr-only" htmlFor="activity-range">
                Time range
              </label>
              <Select
                id="activity-range"
                value={range}
                onChange={(event) => {
                  setRange(event.target.value as TimeRange);
                  setPage(1);
                }}
                className="h-8 w-28 text-[11px]"
              >
                <option value="24h">Last 24h</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="all">All time</option>
              </Select>
              <label className="sr-only" htmlFor="activity-status">
                Result
              </label>
              <Select
                id="activity-status"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as typeof status);
                  setPage(1);
                }}
                className="h-8 w-28 text-[11px]"
              >
                <option value="all">All results</option>
                <option value="failed">Failed</option>
                <option value="success">Passed</option>
              </Select>
            </>
          }
        />

        <div className="px-4 pb-3">
          <label className="sr-only" htmlFor="activity-search">
            Search activity
          </label>
          <input
            id="activity-search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search by commit, branch, workflow, job, actor or PR number"
            className="h-8 w-full rounded-md border border-hairline bg-inset px-2.5 text-xs text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
          />
        </div>

        {repositories.length === 0 && !repositoriesQuery.isLoading ? (
          <EmptyState
            icon={<Activity className="h-5 w-5" />}
            title="No repositories in this workspace"
            description="Pipeline activity appears once a repository is connected and a workflow event has been received."
            action={
              <Link to={ROUTES.repositories} className="text-xs text-accent hover:underline">
                Manage repositories
              </Link>
            }
          />
        ) : (
          <>
            <DataTable<WorkflowFailure>
              caption="Recorded workflow activity"
              columns={[
                {
                  id: 'status',
                  header: 'Result',
                  cell: (failure) => (
                    <Badge tone={failure.exitCode === 0 ? 'success' : 'danger'}>
                      {failure.exitCode === 0 ? 'Passed' : 'Failed'}
                    </Badge>
                  ),
                },
                {
                  id: 'workflow',
                  header: 'Workflow / job',
                  cell: (failure) => (
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{failure.workflowName ?? 'Workflow'}</p>
                      <p className="truncate text-[10px] text-ink-muted">
                        {failure.jobName ?? 'job'}
                        {failure.failedStepName ? ` · ${failure.failedStepName}` : ''}
                      </p>
                    </div>
                  ),
                },
                {
                  id: 'commit',
                  header: 'Commit',
                  hideOnMobile: true,
                  cell: (failure) => (
                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      <GitCommit className="h-3 w-3 text-ink-muted" aria-hidden />
                      <span className="text-ink-secondary">{shortSha(failure.commitSha)}</span>
                      <span className="text-ink-muted">({failure.branch})</span>
                    </div>
                  ),
                },
                {
                  id: 'pr',
                  header: 'PR',
                  hideOnMobile: true,
                  cell: (failure) =>
                    failure.prNumber ? (
                      <span className="font-mono text-ink-secondary">#{failure.prNumber}</span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    ),
                },
                {
                  id: 'duration',
                  header: 'Duration',
                  hideOnMobile: true,
                  cell: (failure) => (
                    <span className="font-mono text-[11px] text-ink-secondary">
                      {formatDuration(failure.durationMs)}
                    </span>
                  ),
                },
                {
                  id: 'when',
                  header: 'When',
                  className: 'text-right',
                  cell: (failure) => (
                    <span className="text-ink-muted">{formatRelativeTime(failure.failedAt)}</span>
                  ),
                },
              ]}
              rows={visible}
              rowKey={(failure) => failure.id}
              loading={failuresQuery.isLoading && Boolean(activeRepoId)}
              onRowClick={(failure) => setSelected(failure)}
              rowAriaLabel={(failure) => `Inspect failure ${failure.id}`}
              empty={
                <EmptyState
                  icon={<Activity className="h-5 w-5" />}
                  title={failures.length === 0 ? 'No activity recorded' : 'No activity matches these filters'}
                  description={
                    failures.length === 0
                      ? 'The feed is empty for this repository. A completed failing workflow event is required.'
                      : 'Widen the time range or clear the search.'
                  }
                />
              }
            />
            <Pagination
              page={Math.min(page, totalPages)}
              totalPages={totalPages}
              totalItems={filtered.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      {selected ? (
        <Card className="mt-4">
          <CardHeader
            title="Failure detail"
            description={`${selected.workflowName ?? 'Workflow'} · ${selected.jobName ?? 'job'} · run ${selected.githubRunId}`}
            actions={
              <>
                <CopyButton value={selected.commitSha} label="Copy SHA" />
                {activeRepo ? (
                  <a
                    href={`https://github.com/${activeRepo.full_name}/actions/runs/${selected.githubRunId}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-accent hover:bg-overlay"
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden />
                    Open on GitHub
                  </a>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                  Close
                </Button>
              </>
            }
          />
          <div className="px-5 pb-5">
            <LogViewer content={selected.sanitizedLogSnippet} maxHeight="22rem" />
          </div>
        </Card>
      ) : failuresQuery.isLoading && activeRepoId ? (
        <Skeleton className="mt-4 h-32 w-full" />
      ) : null}
    </>
  );
};

export default ActivityPage;
