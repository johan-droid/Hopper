import React from 'react';
import { useHealthQuery } from '../../api/hooks';
import { useSession } from '../auth/useSession';
import {
  Badge,
  Card,
  CardHeader,
  ErrorState,
  InlineNotice,
  PageHeader,
  Skeleton,
  StatusDot,
} from '../../components/ui/primitives';
import { formatNumber } from '../../lib/format';
import { CircleDashed, Github, Sparkles, CreditCard, Database } from 'lucide-react';

type IntegrationState = 'verified' | 'unverified' | 'unavailable';

const STATE_BADGE: Record<IntegrationState, { tone: 'success' | 'warning' | 'neutral'; label: string }> = {
  verified: { tone: 'success', label: 'Verified from this browser' },
  unverified: { tone: 'warning', label: 'Configured server-side' },
  unavailable: { tone: 'neutral', label: 'Not configured' },
};

const IntegrationsPage: React.FC = () => {
  const { data: health, isLoading, isError, refetch } = useHealthQuery();
  const { status } = useSession();

  const dependency = (key: 'database' | 'coordination' | 'queue') => health?.dependencies?.[key];

  const rows: Array<{
    name: string;
    purpose: string;
    icon: React.ComponentType<{ className?: string }>;
    state: IntegrationState;
    detail: string;
  }> = [
    {
      name: 'GitHub Authentication',
      purpose: 'OAuth 2.0 Web Application Flow & Personal Access Token verification',
      icon: Github,
      state: status === 'authenticated' ? 'verified' : 'unverified',
      detail:
        status === 'authenticated'
          ? 'A live verified GitHub session is active in this browser.'
          : 'Sign in with GitHub or a Personal Access Token to complete authentication.',
    },
    {
      name: 'Supabase PostgreSQL',
      purpose: 'Tenant data, signatures, diagnoses, queue outbox',
      icon: Database,
      state: dependency('database')?.isHealthy ? 'verified' : isError ? 'unavailable' : 'unverified',
      detail: dependency('database')?.isHealthy
        ? `Responding${dependency('database')?.latencyMs !== undefined ? ` in ${dependency('database')?.latencyMs} ms` : ''}. ${
            dependency('database')?.hasPgvector === false ? 'pgvector is not installed.' : 'pgvector available.'
          }`
        : 'Health has not confirmed the database yet.',
    },
    {
      name: 'Vercel Queues',
      purpose: 'Push delivery of workflow events',
      icon: Sparkles,
      state: dependency('queue')?.isHealthy ? 'verified' : 'unverified',
      detail: dependency('queue')?.isHealthy
        ? `Transport ${dependency('queue')?.backend ?? 'postgres'} · ${formatNumber(dependency('queue')?.pending ?? 0)} pending`
        : 'Queue health is reported by the API; delivery requires the queue trigger on the deployed function.',
    },
    {
      name: 'GitHub App',
      purpose: 'Webhook ingress, installation tokens, PR comments',
      icon: Github,
      state: 'unverified',
      detail:
        'Credentials are server-side only, so this page cannot read them. Confirm delivery in the GitHub App’s Recent Deliveries.',
    },
    {
      name: 'Stripe',
      purpose: 'Subscription checkout and billing webhooks',
      icon: CreditCard,
      state: 'unverified',
      detail:
        'Billing keys are server-side. Without them, checkout returns the free-tier response instead of a session.',
    },
  ];

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Service status as reported by the API. Anything the browser cannot verify is labelled as such — no integration is shown as connected on assumption."
      />

      <Card>
        <CardHeader
          title="API runtime"
          description={
            health
              ? `${health.service ?? 'Hopper API'} v${health.version ?? '—'} · ${
                  health.environment ?? 'unknown environment'
                } · ${health.region ?? 'region not reported'}`
              : 'Waiting for the health endpoint.'
          }
          actions={
            isLoading ? (
              <Skeleton className="h-5 w-20" />
            ) : (
              <Badge tone={health?.status === 'healthy' ? 'success' : isError ? 'danger' : 'warning'}>
                <StatusDot tone={health?.status === 'healthy' ? 'success' : isError ? 'danger' : 'warning'} />
                {health?.status ?? 'unreachable'}
              </Badge>
            )
          }
        />
        {isError ? (
          <div className="px-5 pb-5">
            <ErrorState
              title="Health check failed"
              message="The API did not answer. The dashboard may be running against an unavailable backend."
              onRetry={() => void refetch()}
            />
          </div>
        ) : (
          <dl className="grid gap-3 px-5 pb-5 sm:grid-cols-3">
            {(['database', 'coordination', 'queue'] as const).map((key) => {
              const value = dependency(key);
              return (
                <div key={key} className="rounded-md border border-hairline px-3 py-2.5">
                  <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-muted">
                    <StatusDot tone={value?.isHealthy ? 'success' : 'warning'} />
                    {key}
                  </dt>
                  <dd className="mt-1 text-xs text-ink-secondary">
                    {isLoading
                      ? 'Checking…'
                      : value?.isHealthy
                        ? `Healthy${value.latencyMs !== undefined ? ` · ${value.latencyMs} ms` : ''}`
                        : 'Not reported as healthy'}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </Card>

      <Card className="mt-4">
        <CardHeader title="Connected services" description="What each integration is responsible for." />
        <ul className="divide-y divide-hairline">
          {rows.map(({ name, purpose, icon: Icon, state, detail }) => (
            <li key={name} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-hairline bg-inset">
                <Icon className="h-3.5 w-3.5 text-ink-secondary" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium text-ink">{name}</p>
                  <Badge tone={STATE_BADGE[state].tone}>
                    {state === 'unavailable' ? <CircleDashed className="h-3 w-3" aria-hidden /> : null}
                    {STATE_BADGE[state].label}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[11px] text-ink-muted">{purpose}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-secondary">{detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="mt-4">
        <InlineNotice tone="neutral" title="Why some states say “configured server-side”">
          Provider credentials are deliberately never exposed to the browser. The honest maximum this
          page can verify is the API's own health report; the rest must be confirmed from the provider's
          delivery log.
        </InlineNotice>
      </div>
    </>
  );
};

export default IntegrationsPage;
