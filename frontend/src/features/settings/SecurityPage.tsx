import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession, signOut } from '../auth/useSession';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  InlineNotice,
  PageHeader,
} from '../../components/ui/primitives';
import { ROUTES } from '../../lib/routes';
import { formatTimestamp } from '../../lib/format';
import { ShieldCheck } from 'lucide-react';

const SecurityPage: React.FC = () => {
  const { user, session } = useSession();
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOutEverywhere = async () => {
    setError(null);
    setBusy(true);
    try {
      if (isSupabaseConfigured) {
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
        if (signOutError) throw signOutError;
      }
      await signOut();
      navigate(ROUTES.landing, { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not revoke the session.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Security"
        description="Session state and the guarantees that protect tenant data. Credentials are never displayed."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Current session"
            description="Authoritative identity verified via GitHub."
            actions={<Badge tone={session ? 'success' : 'neutral'}>{session ? 'Active' : 'None'}</Badge>}
          />
          <dl className="divide-y divide-hairline">
            {[
              ['GitHub account', user?.login ? `@${user.login}` : (user?.name ?? '—')],
              ['Email', user?.email ?? '—'],
              ['User ID', user?.id ?? '—'],
              ['Auth provider', 'GitHub (OAuth / Personal Access Token)'],
              ['Token type', session?.token_type ?? 'Bearer'],
              ['Expires', session?.expires_at ? formatTimestamp(new Date(session.expires_at * 1000).toISOString()) : '—'],
              ['Active workspace', workspace?.name ?? '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-6 px-5 py-2.5">
                <dt className="text-xs text-ink-muted">{label}</dt>
                <dd className="max-w-[60%] break-words text-right font-mono text-[11px] text-ink-secondary">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-hairline px-5 py-3">
            <Button variant="danger" size="sm" onClick={signOutEverywhere} loading={busy}>
              Sign out of session
            </Button>
            {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Guarantees" description="Implemented in the API and database, not in this UI." />
          <ul className="space-y-2.5 px-5 pb-5">
            {[
              'Authoritative GitHub identity is cryptographically verified on every request.',
              'Every tenant query is scoped by workspace and repository; multi-tenant isolation is strictly enforced.',
              'GitHub and Stripe webhooks verify cryptographic signatures and never use a user session.',
              'Secrets are redacted from logs before storage and before any model call.',
              'The backend secret keys and GitHub App private key are never sent to the browser.',
              'Signing out clears the query cache and purges browser authentication tokens.',
            ].map((item) => (
              <li key={item} className="flex gap-2 text-xs leading-relaxed text-ink-secondary">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4">
        <InlineNotice tone="neutral" title="Verified GitHub Authentication">
          Hopper authenticates using GitHub OAuth and Personal Access Tokens, validating numerical user IDs and
          organization permissions directly against GitHub's authoritative API before issuing scoped JWT sessions.
        </InlineNotice>
      </div>
    </>
  );
};

export default SecurityPage;
