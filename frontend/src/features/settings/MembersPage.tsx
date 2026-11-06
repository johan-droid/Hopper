import React from 'react';
import { useWorkspaceMembersQuery } from '../../api/hooks';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  InlineNotice,
  PageHeader,
  Skeleton,
} from '../../components/ui/primitives';
import { formatDate } from '../../lib/format';
import { Users } from 'lucide-react';

const ROLE_TONE: Record<string, 'accent' | 'info' | 'neutral'> = {
  owner: 'accent',
  admin: 'info',
};

const MembersPage: React.FC = () => {
  const { workspaceId, workspace } = useWorkspace();
  const membersQuery = useWorkspaceMembersQuery(workspaceId);
  const members = membersQuery.data?.members ?? [];

  return (
    <>
      <PageHeader
        title="Members & Permissions"
        description={
          workspace
            ? `People with access to ${workspace.name}. Role names are shown exactly as the API returns them.`
            : 'Workspace membership.'
        }
      />

      <Card>
        <CardHeader
          title={`${members.length} ${members.length === 1 ? 'member' : 'members'}`}
          description="Authorization is enforced server-side on every request, not by this list."
        />

        {membersQuery.isError ? (
          <div className="px-5 pb-5">
            <ErrorState
              title="Could not load members"
              message={(membersQuery.error as Error).message}
              onRetry={() => void membersQuery.refetch()}
            />
          </div>
        ) : membersQuery.isLoading ? (
          <div className="space-y-2 px-5 pb-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="No members returned"
            description="The API returned an empty membership list for this workspace."
          />
        ) : (
          <ul className="divide-y divide-hairline">
            {members.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-overlay text-[10px] font-semibold text-ink-secondary">
                  {(member.full_name ?? member.username ?? member.user_id).slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-ink">
                    {member.full_name ?? member.username ?? 'Member'}
                  </p>
                  <p className="truncate font-mono text-[10px] text-ink-muted">{member.user_id}</p>
                </div>
                <span className="text-[10px] text-ink-muted">Joined {formatDate(member.created_at)}</span>
                <Badge tone={ROLE_TONE[member.role] ?? 'neutral'}>{member.role}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-4">
        <InlineNotice tone="neutral" title="Invitations are not implemented">
          The API exposes membership reads and role updates, but no invitation endpoint. Adding an invite
          flow requires a backend contract — sending an unvalidated email from the browser would be a
          security hole, not a feature.
        </InlineNotice>
      </div>
    </>
  );
};

export default MembersPage;
