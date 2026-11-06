import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { useRepositoriesQuery, queryKeys } from '../../api/hooks';
import { api, ApiError } from '../../api/client';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  InlineNotice,
  PageHeader,
  Select,
} from '../../components/ui/primitives';
import { DataTable } from '../../components/ui/DataTable';
import { ROUTES } from '../../lib/routes';
import { formatDate } from '../../lib/format';
import type { Repository } from '../../api/schema';
import { GitBranch, GitFork, Link2, Search } from 'lucide-react';

const RepositoriesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { workspaceId, workspace, workspaces, setWorkspaceId, errorMessage, refetch } = useWorkspace();
  const repositoriesQuery = useRepositoriesQuery(workspaceId);
  const repositories = repositoriesQuery.data?.repositories ?? [];
  const [query, setQuery] = useState('');
  const [linkTarget, setLinkTarget] = useState<Record<string, string>>({});

  const linkMutation = useMutation({
    mutationFn: ({ repoId, targetWorkspaceId }: { repoId: string; targetWorkspaceId: string }) =>
      api.linkRepositoryToWorkspace(repoId, targetWorkspaceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.repositories(workspaceId) });
    },
  });

  const filtered = repositories.filter((repository) =>
    repository.full_name.toLowerCase().includes(query.trim().toLowerCase())
  );

  if (repositoriesQuery.isError) {
    const unauthorized = repositoriesQuery.error instanceof ApiError && repositoriesQuery.error.isUnauthorized;
    return (
      <>
        <PageHeader title="Repositories" />
        <ErrorState
          title={unauthorized ? 'Access denied' : 'Could not load repositories'}
          message={errorMessage ?? (repositoriesQuery.error as Error).message}
          onRetry={refetch}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Repositories"
        description="Repositories visible in the active workspace, with connection state and branch defaults."
        actions={
          <Button size="sm" variant="ghost" onClick={() => void repositoriesQuery.refetch()} loading={repositoriesQuery.isFetching}>
            Refresh
          </Button>
        }
      />

      <Card>
        <CardHeader
          title={`${filtered.length} ${filtered.length === 1 ? 'repository' : 'repositories'}`}
          description={
            workspace ? `Scope: ${workspace.name}. Repository access is enforced by the API.` : undefined
          }
          actions={
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-muted" aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter repositories"
                aria-label="Filter repositories"
                className="h-8 w-56 rounded-md border border-hairline bg-inset pl-8 pr-2 text-xs text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
              />
            </div>
          }
        />

        <DataTable<Repository>
          caption="Repositories in this workspace"
          columns={[
            {
              id: 'name',
              header: 'Repository',
              cell: (repository) => (
                <div className="flex items-center gap-2">
                  <GitBranch className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
                  <Link
                    to={ROUTES.repository(repository.id)}
                    className="font-medium text-ink hover:text-accent hover:underline"
                  >
                    {repository.full_name}
                  </Link>
                </div>
              ),
            },
            {
              id: 'branch',
              header: 'Default branch',
              hideOnMobile: true,
              cell: (repository) => <span className="font-mono text-ink-secondary">{repository.default_branch}</span>,
            },
            {
              id: 'workspace',
              header: 'Workspace',
              hideOnMobile: true,
              cell: (repository) =>
                repository.workspace_id === workspaceId ? (
                  <Badge tone="accent">This workspace</Badge>
                ) : repository.workspace_id ? (
                  <Badge tone="neutral">Linked elsewhere</Badge>
                ) : (
                  <Badge tone="warning">Unlinked</Badge>
                ),
            },
            {
              id: 'state',
              header: 'State',
              cell: (repository) => (
                <Badge tone={repository.is_active ? 'success' : 'neutral'}>
                  {repository.is_active ? 'Active' : 'Inactive'}
                </Badge>
              ),
            },
            {
              id: 'created',
              header: 'Added',
              hideOnMobile: true,
              cell: (repository) => <span className="text-ink-muted">{formatDate(repository.created_at)}</span>,
            },
            {
              id: 'actions',
              header: '',
              className: 'text-right',
              cell: (repository) =>
                repository.workspace_id === workspaceId ? (
                  <Link
                    to={ROUTES.repository(repository.id)}
                    className="text-xs text-accent hover:underline"
                  >
                    Open
                  </Link>
                ) : (
                  <div className="flex items-center justify-end gap-1.5">
                    <label className="sr-only" htmlFor={`link-${repository.id}`}>
                      Workspace to link {repository.full_name} to
                    </label>
                    <Select
                      id={`link-${repository.id}`}
                      value={linkTarget[repository.id] ?? workspaceId ?? ''}
                      onChange={(event) =>
                        setLinkTarget((current) => ({ ...current, [repository.id]: event.target.value }))
                      }
                      className="h-7 w-36 text-[11px]"
                    >
                      {workspaces.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </Select>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={linkMutation.isPending}
                      onClick={() =>
                        linkMutation.mutate({
                          repoId: repository.id,
                          targetWorkspaceId: linkTarget[repository.id] ?? workspaceId ?? '',
                        })
                      }
                    >
                      <Link2 className="h-3 w-3" aria-hidden />
                      Link
                    </Button>
                  </div>
                ),
            },
          ]}
          rows={filtered}
          rowKey={(repository) => repository.id}
          loading={repositoriesQuery.isLoading}
          empty={
            <EmptyState
              icon={<GitFork className="h-5 w-5" />}
              title={query ? 'No repositories match that filter' : 'No repositories connected'}
              description={
                query
                  ? 'Try a different owner or repository name.'
                  : 'Install the GitHub App on a repository and deliver a workflow event. The repository is created on first webhook.'
              }
              action={
                query ? (
                  <Button size="sm" onClick={() => setQuery('')}>
                    Clear filter
                  </Button>
                ) : undefined
              }
            />
          }
        />
        {linkMutation.isError ? (
          <div className="px-5 pb-4">
            <InlineNotice tone="danger" title="Could not link the repository">
              {(linkMutation.error as Error).message}
            </InlineNotice>
          </div>
        ) : null}
      </Card>

      {workspaces.length > 1 ? (
        <p className="mt-3 text-[11px] text-ink-muted">
          Repository lists are scoped server-side. Switching workspace:{' '}
          <button
            type="button"
            className="text-accent hover:underline"
            onClick={() => setWorkspaceId(workspaces[0].id)}
          >
            {workspaces[0].name}
          </button>
        </p>
      ) : null}
    </>
  );
};

export default RepositoriesPage;
