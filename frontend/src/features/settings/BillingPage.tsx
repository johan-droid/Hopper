import React from 'react';
import { Badge, Card, CardHeader, InlineNotice, PageHeader } from '../../components/ui/primitives';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import { Check } from 'lucide-react';

const TIERS = [
  {
    name: 'Free',
    price: '$0',
    runs: '30 runs / month',
    history: '24 hours',
    features: ['Failure ingestion', 'Deterministic diagnoses', 'Sticky PR comment'],
  },
  {
    name: 'Pro Developer',
    price: '$9',
    runs: '250 runs / month',
    history: '30 days',
    features: ['Everything in Free', 'Live AI provider', 'Full flaky matrix'],
  },
  {
    name: 'Small Team',
    price: '$29',
    runs: '1,000 runs / month',
    history: '90 days',
    features: ['Everything in Pro', 'Slack / Discord alerts', 'Auto-retry above 80% confidence'],
  },
];

const BillingPage: React.FC = () => {
  const { workspace } = useWorkspace();

  return (
    <>
      <PageHeader
        title="Billing & Usage"
        description="Plan limits are enforced by the backend quota guard. Usage meters appear only when the API can supply them."
      />

      <div className="mb-4">
        <InlineNotice tone="warning" title="Plan and usage are not exposed to this dashboard yet">
          The plan summary endpoint is keyed by organisation slug, and no endpoint currently lists an
          organisation for a workspace. Rather than hardcode a slug and display fabricated usage, this
          page shows the published tiers only. Required contract:{' '}
          <code className="font-mono">GET /api/organizations</code> returning{' '}
          <code className="font-mono">{'{ id, slug, plan, monthly_runs_limit, runs_used }'}</code>.
        </InlineNotice>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {TIERS.map((tier) => (
          <Card key={tier.name} className="flex flex-col p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">{tier.name}</h2>
              {workspace?.type === 'personal' && tier.name === 'Free' ? (
                <Badge tone="neutral">Default</Badge>
              ) : null}
            </div>
            <p className="mt-2 font-mono text-2xl font-semibold text-ink">
              {tier.price}
              <span className="text-xs font-normal text-ink-muted">/mo</span>
            </p>
            <dl className="mt-3 space-y-1 text-[11px] text-ink-secondary">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Runs</dt>
                <dd>{tier.runs}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">History</dt>
                <dd>{tier.history}</dd>
              </div>
            </dl>
            <ul className="mt-3 flex-1 space-y-1.5 border-t border-hairline pt-3 text-[11px] text-ink-secondary">
              {tier.features.map((feature) => (
                <li key={feature} className="flex gap-1.5">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" aria-hidden />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled
              title="Checkout needs an organisation context that the API does not expose yet"
              className="mt-4 h-8 cursor-not-allowed rounded-md border border-hairline bg-overlay px-3 text-xs text-ink-muted"
            >
              {tier.price === '$0' ? 'Included' : 'Upgrade unavailable'}
            </button>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader title="How billing is enforced" />
        <ul className="space-y-2 px-5 pb-5 text-xs leading-relaxed text-ink-secondary">
          <li>Quota checks run server-side before a diagnosis is queued.</li>
          <li>Stripe webhooks are signature-verified and processed idempotently.</li>
          <li>No paid plan is activated without a completed checkout session.</li>
          <li>Vercel Hobby cannot host commercial billing — see the cost and limits document.</li>
        </ul>
      </Card>
    </>
  );
};

export default BillingPage;
