import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../lib/routes';
import { useSession } from '../auth/useSession';
import { Badge, Button, Card, Divider } from '../../components/ui/primitives';
import {
  ArrowRight,
  Braces,
  CheckCircle2,
  GitBranch,
  Layers,
  Lock,
  Sparkles,
  Terminal,
  Timer,
  Zap,
} from 'lucide-react';

const CAPABILITIES = [
  {
    icon: Terminal,
    title: 'Log slicing and redaction',
    body: 'The failed job log is fetched, capped at the tail 300 KB, stripped of ANSI noise and scrubbed of credentials before anything is stored or sent to a model.',
  },
  {
    icon: Braces,
    title: 'Deterministic fingerprinting',
    body: 'Volatile tokens — UUIDs, SHAs, line and column numbers, durations, ports — are normalised and hashed, so a repeat failure collapses into one signature instead of a thousand rows.',
  },
  {
    icon: Timer,
    title: 'Flakiness scoring',
    body: 'Same-SHA retry passes, cross-PR spread and default-branch frequency produce a confidence score. The score is evidence-based; the number is shown next to the inputs that produced it.',
  },
  {
    icon: Sparkles,
    title: 'Structured diagnosis',
    body: 'OpenAI, Anthropic, or a deterministic provider returns a Zod-validated diagnosis with root-cause clues, relevant log lines and a reproduction command.',
  },
  {
    icon: Layers,
    title: 'Durable ingestion',
    body: 'A webhook is acknowledged only after it is persisted to a PostgreSQL outbox. Vercel Queues drives push consumption; a daily cron reaps anything a crashed consumer left behind.',
  },
  {
    icon: Lock,
    title: 'Tenant isolation',
    body: 'Every record is scoped through an organisation and repository, with PostgreSQL row-level security and tenant context applied per transaction.',
  },
];

const STEPS = [
  {
    step: '01',
    title: 'GitHub sends the failure',
    body: 'A workflow_run or workflow_job webhook is verified with HMAC-SHA256, rate-limited and deduplicated in PostgreSQL.',
  },
  {
    step: '02',
    title: 'Hopper fingerprints it',
    body: 'The log is sliced, scrubbed and normalised, then hashed into a stable signature shared by every recurrence.',
  },
  {
    step: '03',
    title: 'A diagnosis is produced',
    body: 'Root cause, evidence lines and next checks are generated and validated against a strict schema.',
  },
  {
    step: '04',
    title: 'The pull request is updated',
    body: 'A single sticky comment is posted or updated, so reviewers see the diagnosis where the failure happened.',
  },
];

const TIERS = [
  { name: 'Free', price: '$0', runs: '30 runs / month', history: '24 hours of history', note: 'Evaluate the diagnosis pipeline' },
  { name: 'Pro Developer', price: '$9', runs: '250 runs / month', history: '30 days of history', note: 'Solo maintainers' },
  { name: 'Small Team', price: '$29', runs: '1,000 runs / month', history: '90 days of history', note: 'Shared triage and alerts' },
];

const LandingPage: React.FC = () => {
  const { isAuthenticated } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate(ROUTES.overview, { replace: true });
    }
  }, [isAuthenticated, navigate]);

  return (
  <div className="min-h-screen bg-canvas">
    <header className="sticky top-0 z-20 border-b border-hairline bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link to={ROUTES.landing} className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-accent text-accent-contrast">
            <Zap className="h-3.5 w-3.5" aria-hidden />
          </span>
          Hopper
        </Link>
        <nav className="hidden items-center gap-5 text-xs text-ink-secondary md:flex" aria-label="Sections">
          <a href="#how-it-works" className="hover:text-ink">How it works</a>
          <a href="#capabilities" className="hover:text-ink">Capabilities</a>
          <a href="#pricing" className="hover:text-ink">Pricing</a>
          <a href="#security" className="hover:text-ink">Security</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to={ROUTES.login}
            className="hidden h-8 items-center rounded-md px-2.5 text-xs text-ink-secondary hover:text-ink sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            to={ROUTES.login}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-medium text-accent-contrast hover:bg-accent/90"
          >
            Open dashboard
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </div>
    </header>

    <main>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 md:px-6 md:pt-24">
        <Badge tone="accent" mono>
          CI/CD failure diagnosis
        </Badge>
        <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-ink md:text-5xl">
          Know why your pipeline failed.
          <span className="block text-ink-secondary">Fix the recurring ones first.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-ink-secondary md:text-base">
          Hopper ingests failed GitHub Actions runs, fingerprints the failure so recurrences collapse
          into one signature, scores flakiness from real retry evidence, and posts a structured
          diagnosis on the pull request.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link
            to={ROUTES.login}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-contrast hover:bg-accent/90"
          >
            Start with the free tier
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-hairline px-4 text-sm text-ink-secondary hover:text-ink"
          >
            See how ingestion works
          </a>
        </div>

        <div className="mt-14 overflow-hidden rounded-lg border border-hairline bg-raised shadow-raised">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs text-ink-secondary">
              <span className="flex gap-1" aria-hidden>
                <span className="h-2 w-2 rounded-full bg-danger/70" />
                <span className="h-2 w-2 rounded-full bg-warning/70" />
                <span className="h-2 w-2 rounded-full bg-success/70" />
              </span>
              <span className="font-mono">failure investigation</span>
            </div>
            <span className="text-[10px] uppercase tracking-wide text-ink-muted">
              Interface preview
            </span>
          </div>
          <div className="grid gap-0 md:grid-cols-[1.4fr_1fr]">
            <div className="border-b border-hairline p-5 md:border-b-0 md:border-r">
              <p className="text-[11px] uppercase tracking-wide text-ink-muted">Root cause</p>
              <p className="mt-2 text-sm leading-relaxed text-ink">
                Test asserts on a stale session token: the fixture writes{' '}
                <code className="rounded bg-inset px-1 font-mono text-xs">expires_at</code> before the
                clock override, so the verifier sees an already-expired token.
              </p>
              <div className="mt-4 space-y-1.5">
                {[
                  'AssertionError: expected "active" to equal "expired"',
                  'at src/auth/jwt-verifier.spec.ts:42:15',
                  'Process completed with exit code 1.',
                ].map((line, index) => (
                  <div
                    key={line}
                    className="flex gap-3 rounded border border-hairline bg-inset px-2.5 py-1.5 font-mono text-[11px] text-ink-secondary"
                  >
                    <span className="text-ink-muted">{18 + index}</span>
                    <span className="log-line">{line}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-5">
              <p className="text-[11px] uppercase tracking-wide text-ink-muted">Evidence</p>
              <dl className="mt-2 space-y-3 text-xs">
                {[
                  ['Signature', '9 recurrences'],
                  ['Same-SHA retries', '3 passes'],
                  ['Pull requests affected', '4'],
                  ['Suggested next check', 'Freeze the clock before writing the fixture'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-3">
                    <dt className="text-ink-muted">{label}</dt>
                    <dd className="max-w-[60%] text-right text-ink-secondary">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-ink-muted">
          Illustrative interface preview with example content, not live workspace data.
        </p>
      </section>

      <section id="how-it-works" className="border-y border-hairline bg-raised/40 py-16">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <h2 className="text-xl font-semibold tracking-tight text-ink">What happens to a failure</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
            Four steps, each with an explicit durability guarantee.
          </p>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <li key={step.step} className="rounded-lg border border-hairline bg-raised p-4">
                <span className="font-mono text-[11px] text-accent">{step.step}</span>
                <h3 className="mt-2 text-sm font-semibold text-ink">{step.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-ink-secondary">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="capabilities" className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <h2 className="text-xl font-semibold tracking-tight text-ink">Built for evidence, not guesses</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          Every number on a screen is derived from stored events. Where the API cannot supply a
          metric, Hopper shows it as unavailable instead of inventing one.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-lg border border-hairline bg-raised p-4">
              <Icon className="h-4 w-4 text-accent" aria-hidden />
              <h3 className="mt-2.5 text-sm font-semibold text-ink">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-secondary">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="security" className="border-y border-hairline bg-raised/40 py-16">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-2 md:px-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-ink">Security posture</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-ink-secondary">
              {[
                'GitHub and Stripe webhooks use their own cryptographic verification, never a user session.',
                'Secrets are scrubbed from logs before storage and before any model call.',
                'Supabase JWT signature, issuer, audience, expiry and algorithm are all validated.',
                'The service-role key and GitHub App private key never reach the browser.',
                'Demo sign-in has been removed: there is no client-side token minting of any kind.',
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                  <span className="text-xs leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-xs text-ink-secondary">
              <GitBranch className="h-3.5 w-3.5 text-accent" aria-hidden />
              Integrations
            </div>
            <ul className="mt-3 divide-y divide-hairline text-xs">
              {[
                ['GitHub App', 'Webhook ingress, installation tokens, PR comments'],
                ['Supabase', 'Authentication, PostgreSQL, pgvector'],
                ['OpenAI / Anthropic', 'Structured diagnosis'],
                ['Stripe', 'Subscription billing'],
                ['Vercel', 'Functions, queues, daily cron'],
              ].map(([name, purpose]) => (
                <li key={name} className="flex items-start justify-between gap-3 py-2">
                  <span className="font-medium text-ink">{name}</span>
                  <span className="max-w-[60%] text-right text-ink-muted">{purpose}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <h2 className="text-xl font-semibold tracking-tight text-ink">Pricing</h2>
        <p className="mt-1 text-sm text-ink-secondary">
          Limits are enforced by the backend quota guard; they are not decorative.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {TIERS.map((tier) => (
            <div key={tier.name} className="flex flex-col rounded-lg border border-hairline bg-raised p-5">
              <h3 className="text-sm font-semibold text-ink">{tier.name}</h3>
              <p className="mt-2 font-mono text-2xl font-semibold text-ink">
                {tier.price}
                <span className="text-xs font-normal text-ink-muted">/mo</span>
              </p>
              <Divider className="my-3" />
              <ul className="space-y-1.5 text-xs text-ink-secondary">
                <li>{tier.runs}</li>
                <li>{tier.history}</li>
                <li className="text-ink-muted">{tier.note}</li>
              </ul>
              <Button className="mt-4 w-full" variant={tier.price === '$0' ? 'secondary' : 'primary'}>
                <Link to={ROUTES.login} className="flex w-full items-center justify-center">
                  {tier.price === '$0' ? 'Start free' : 'Choose plan'}
                </Link>
              </Button>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-ink-muted">
          Checkout is completed in Stripe. Plan changes are reconciled through signed webhooks.
        </p>
      </section>

      <section className="border-t border-hairline py-14">
        <div className="mx-auto max-w-3xl px-4 text-center md:px-6">
          <h2 className="text-xl font-semibold tracking-tight text-ink">
            Start with your next failing build
          </h2>
          <p className="mt-2 text-sm text-ink-secondary">
            Connect a repository, let one failure through, and read the diagnosis it produces.
          </p>
          <Link
            to={ROUTES.login}
            className="mt-6 inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-contrast hover:bg-accent/90"
          >
            Open the dashboard
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </main>

    <footer className="border-t border-hairline px-4 py-6 md:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 text-[11px] text-ink-muted sm:flex-row">
        <span>Hopper — CI/CD failure diagnosis · Named after Rear Admiral Grace Hopper</span>
        <span className="font-mono">Supabase · Vercel · GitHub</span>
      </div>
    </footer>
  </div>
  );
};

export default LandingPage;
