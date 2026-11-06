import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { useRepoFailuresQuery, useRepositoriesQuery } from '../../api/hooks';
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
import { ArrowLeft, ExternalLink, GitCommit, GitPullRequest } from 'lucide-react';

const PAGE_SIZE = 10;

const RepositoryDetailPage: React.FC = () => {
  const { repositoryId } = useParams<{ repositoryId: string }>();
  const { workspaceId } = useWorkspace();
  const repositoriesQuery = useRepositoriesQuery(workspaceId);
  const failuresQuery = useRepoFailuresQuery(repositoryId ?? null);

  const [range, setRange] = useState<TimeRange>('30d');
  const [branch, setBranch] = useState<'all' | 'default' | 'pull_request'>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<WorkflowFailure | null>(null);

  const repository = repositoriesQuery.data?.repositories.find((item) => item.id === repositoryId);

  const failures = failuresQuery.data?.failures ?? [];
  const filtered = useMemo(
    () => filterFailures(failures, { query, branch, range }),
    [failures, query, branch, range]
  );
  const totalPages = pageCount(filtered.length, PAGE_SIZE);
  const visible = paginate(filtered, Math.min(page, totalPages), PAGE_SIZE);

  const runUrl = (failure: WorkflowFailure) =>
    repository
      ? `https://github.com/${repository.full_name}/actions/runs/${failure.githubRunId}`
      : null;

  if (failuresQuery.isError) {
    return (
      <>
        <PageHeader
          title="Repository"
          breadcrumbs={
            <Link to={ROUTES.repositories} className="hover:text-ink">
              Repositories
            </Link>
          }
        />
        <ErrorState
          title="Could not load this repository's failures"
          message={(failuresQuery.error as Error).message}
          onRetry={() => void failuresQuery.refetch()}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={repository?.full_name ?? 'Repository'}
        description={
          repository
            ? `Default branch ${repository.default_branch} · ${repository.is_active ? 'active' : 'inactive'}`
            : 'Repository details'
        }
        breadcrumbs={
          <Link to={ROUTES.repositories} className="inline-flex items-center gap-1 hover:text-ink">
            <ArrowLeft className="h-3 w-3" aria-hidden />
            All repositories
          </Link>
        }
        actions={
          repository ? (
            <>
              <Badge tone={repository.is_active ? 'success' : 'neutral'}>
                {repository.is_active ? 'Active' : 'Inactive'}
              </Badge>
              <Button size="sm" variant="ghost" onClick={() => void failuresQuery.refetch()} loading={failuresQuery.isFetching}>
                Refresh
              </Button>
            </>
          ) : null
        }
      />

      {!repository && repositoriesQuery.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !repository ? (
        <Card>
          <EmptyState
            title="Repository not found in this workspace"
            description="It may belong to another workspace, or access may have been revoked. Open the repository list to see what you can reach."
            action={
              <Link to={ROUTES.repositories} className="text-xs text-accent hover:underline">
                Back to repositories
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardHeader
              title="Failure history"
              description={`${filtered.length} matching of ${failures.length} recorded failures`}
              actions={
                <>
                  <label className="sr-only" htmlFor="range">
                    Time range
                  </label>
                  <Select
                    id="range"
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
                  <label className="sr-only" htmlFor="branch">
                    Branch filter
                  </label>
                  <Select
                    id="branch"
                    value={branch}
                    onChange={(event) => {
                      setBranch(event.target.value as typeof branch);
                      setPage(1);
                    }}
                    className="h-8 w-32 text-[11px]"
                  >
                    <option value="all">All branches</option>
                    <option value="default">Default branch</option>
                    <option value="pull_request">Pull requests</option>
                  </Select>
                </>
              }
            />

            <div className="px-4 pb-3">
              <label className="sr-only" htmlFor="failure-search">
                Search failures
              </label>
              <input
                id="failure-search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search commit, branch, workflow, job or PR number"
                className="h-8 w-full rounded-md border border-hairline bg-inset px-2.5 text-xs text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
              />
            </div>

            <DataTable<WorkflowFailure>
              caption="Repository failure history"
              columns={[
                {
                  id: 'commit',
                  header: 'Commit',
                  cell: (failure) => (
                    <div className="flex items-center gap-1.5 font-mono">
                      <GitCommit className="h-3 w-3 text-ink-muted" aria-hidden />
                      <span className="text-ink">{shortSha(failure.commitSha)}</span>
                      {failure.prNumber ? (
                        <span className="flex items-center gap-0.5 text-[10px] text-ink-muted">
                          <GitPullRequest className="h-3 w-3" aria-hidden />#{failure.prNumber}
                        </span>
                      ) : null}
                    </div>
                  ),
                },
                {
                  id: 'job',
                  header: 'Workflow / job',
                  hideOnMobile: true,
                  cell: (failure) => (
                    <div className="min-w-0">
                      <p className="truncate text-ink-secondary">{failure.workflowName ?? 'Workflow'}</p>
                      <p className="truncate text-[10px] text-ink-muted">
                        {failure.jobName ?? 'job'}
                        {failure.failedStepName ? ` · ${failure.failedStepName}` : ''}
                      </p>
                    </div>
                  ),
                },
                {
                  id: 'branch',
                  header: 'Branch',
                  hideOnMobile: true,
                  cell: (failure) => <span className="font-mono text-[11px] text-ink-muted">{failure.branch}</span>,
                },
                {
                  id: 'duration',
                  header: 'Duration',
                  hideOnMobile: true,
                  cell: (failure) => (
                    <span className="font-mono text-ink-secondary">{formatDuration(failure.durationMs)}</span>
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
              loading={failuresQuery.isLoading}
              onRowClick={(failure) => setSelected(failure)}
              rowAriaLabel={(failure) => `Inspect failure ${failure.id}`}
              empty={
                <EmptyState
                  title={failures.length === 0 ? 'No failures recorded' : 'No failures match these filters'}
                  description={
                    failures.length === 0
                      ? 'This repository has no stored failures. A completed failing workflow is required.'
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
          </Card>

          <Card className="h-fit">
            <CardHeader
              title={selected ? 'Failure detail' : 'Select a failure'}
              description={
                selected
                  ? `${selected.workflowName ?? 'Workflow'} · ${selected.jobName ?? 'job'}`
                  : 'Choose a row to inspect the scrubbed log excerpt.'
              }
            />
            {selected ? (
              <div className="space-y-3 px-5 pb-5">
                <dl className="grid grid-cols-2 gap-2 text-[11px]">
                  {[
                    ['Branch', selected.branch],
                    ['Commit', shortSha(selected.commitSha, 12)],
                    ['Exit code', selected.exitCode ?? '—'],
                    ['Duration', formatDuration(selected.durationMs)],
                    ['Actor', selected.actorLogin ?? '—'],
                    ['Run id', String(selected.githubRunId)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-ink-muted">{label}</dt>
                      <dd className="truncate font-mono text-ink-secondary">{String(value)}</dd>
                    </div>
                  ))}
                </dl>

                <div className="flex flex-wrap gap-2">
                  <CopyButton value={selected.commitSha} label="Copy SHA" />
                  {runUrl(selected) ? (
                    <a
                      href={runUrl(selected)!}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-accent hover:bg-overlay"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden />
                      Open run on GitHub
                    </a>
                  ) : null}
                </div>

                <LogViewer content={selected.sanitizedLogSnippet} maxHeight="18rem" />
                <p className="text-[10px] text-ink-muted">
                  This excerpt is the scrubbed copy stored by Hopper, not the full raw log.
                </p>
              </div>
            ) : (
              <EmptyState
                title="Nothing selected"
                description="The scrubber stores a truncated, secret-free excerpt of each failed job."
              />
            )}
          </Card>
        </div>
      )}
    </>
  );
};

export default RepositoryDetailPage;
