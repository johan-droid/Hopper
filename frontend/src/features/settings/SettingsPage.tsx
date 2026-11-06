import React from 'react';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { useSession } from '../auth/useSession';
import {
  Card,
  CardHeader,
  InlineNotice,
  PageHeader,
  Skeleton,
} from '../../components/ui/primitives';
import { formatDate } from '../../lib/format';

const SettingsPage: React.FC = () => {
  const { profile, workspace, loading } = useWorkspace();
  const { user } = useSession();

  const rows: Array<[string, string]> = [
    ['Email', user?.email ?? '—'],
    ['User ID', user?.id ?? '—'],
    ['Username', profile?.username ?? '—'],
    ['Full name', profile?.full_name ?? '—'],
    ['Bio', profile?.bio ?? '—'],
    ['Profile created', formatDate(profile?.created_at)],
    ['Active workspace', workspace?.name ?? '—'],
    ['Workspace ID', workspace?.id ?? '—'],
    ['Workspace type', workspace?.type ?? '—'],
    ['Workspace visibility', workspace ? (workspace.is_public ? 'Public' : 'Private') : '—'],
  ];

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your profile and the active workspace. Values are read from the API; nothing on this page is editable yet."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" description="Supabase user record plus the Hopper profile row." />
          {loading ? (
            <div className="space-y-2 px-5 pb-5">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-6 w-full" />
              ))}
            </div>
          ) : (
            <dl className="divide-y divide-hairline">
              {rows.slice(0, 6).map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-6 px-5 py-2.5">
                  <dt className="text-xs text-ink-muted">{label}</dt>
                  <dd className="max-w-[60%] break-words text-right font-mono text-[11px] text-ink-secondary">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Card>

        <Card>
          <CardHeader title="Workspace" description="The tenant that scopes every query on this session." />
          {loading ? (
            <div className="space-y-2 px-5 pb-5">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-6 w-full" />
              ))}
            </div>
          ) : (
            <dl className="divide-y divide-hairline">
              {rows.slice(6).map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-6 px-5 py-2.5">
                  <dt className="text-xs text-ink-muted">{label}</dt>
                  <dd className="max-w-[60%] break-words text-right font-mono text-[11px] text-ink-secondary">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      </div>

      <div className="mt-4 space-y-3">
        <InlineNotice tone="neutral" title="Profile editing is not wired up yet">
          The API exposes <code className="font-mono">PUT /api/user/profile</code>, but the dashboard has
          no validated form for it yet. Rather than ship a half-working editor, the fields are read-only
          and the gap is recorded in <code className="font-mono">docs/frontend/FRONTEND_RELEASE_REPORT.md</code>.
        </InlineNotice>
        <InlineNotice tone="neutral" title="Workspace switching">
          Use the selector in the sidebar. The selection is a UI preference and is re-validated against
          the server's workspace list on every load, so a stale id cannot address another tenant.
        </InlineNotice>
      </div>
    </>
  );
};

export default SettingsPage;
