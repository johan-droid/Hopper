import React from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../../lib/routes';
import { Check, ArrowRight, Sparkles, Zap, Building2 } from 'lucide-react';

interface PricingTier {
  id: string;
  name: string;
  price: string;
  cadence: string;
  highlighted?: boolean;
  description: string;
  runsPerMonth: string;
  history: string;
  features: string[];
  ctaText: string;
  ctaVariant: 'primary' | 'secondary' | 'enterprise';
}

const TIERS: PricingTier[] = [
  {
    id: 'free',
    name: 'Free Community',
    price: '$0',
    cadence: 'forever',
    description: 'Essential automated failure triage for solo developers and open-source projects.',
    runsPerMonth: '30 runs / month',
    history: '24 hours history',
    features: [
      '1 connected GitHub repository',
      'Webhook ingress (<50ms verified)',
      'Basic sticky PR comment diagnosis',
      'ANSI stripping & secret scrubbing',
      'Flakiness score preview',
      'AI diagnosis via Groq free tier',
    ],
    ctaText: 'Get Started Free',
    ctaVariant: 'secondary',
  },
  {
    id: 'pro',
    name: 'Pro Developer',
    price: '$9',
    cadence: 'per month',
    highlighted: true,
    description: 'Full diagnostic intelligence and flakiness tracking for active engineers.',
    runsPerMonth: '250 runs / month',
    history: '30 days history',
    features: [
      'Up to 5 connected repositories',
      'Sub-15s AI root-cause diagnosis',
      'Verified code diffs in PR comments',
      'Full Bayesian flakiness scoring',
      'SHA-256 failure signature cloud moat',
      'Interactive investigation sandbox',
      'Priority queue processing',
    ],
    ctaText: 'Start Pro Trial',
    ctaVariant: 'primary',
  },
  {
    id: 'team',
    name: 'Small Team',
    price: '$29',
    cadence: 'per month',
    description: 'Org-level flakiness elimination, team collaboration, and RLS-isolated workspaces.',
    runsPerMonth: '1,000 runs / month',
    history: '90 days history',
    features: [
      'Unlimited connected repositories',
      'Full workspace RBAC & team management',
      'Slack & webhook failure alert routing',
      'Auto-retry recommendations (flakiness >80%)',
      'Cross-PR regression clustering',
      'Multi-tenant RLS workspace isolation',
      'Custom monthly AI budget limits',
    ],
    ctaText: 'Upgrade to Team',
    ctaVariant: 'secondary',
  },
];

const TRUST_FACTS = [
  'No credit card required for Free tier',
  'Cancel anytime — data export available',
  'PostgreSQL-native — no vendor lock-in',
  'SOC 2-aligned secret scrubbing',
];

export const PricingSection: React.FC = () => {
  return (
    <section id="pricing" className="relative border-t border-hairline/60 py-16 sm:py-24 bg-canvas">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rose-500/25 to-transparent"
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* ── HEADER ── */}
        <div className="mx-auto max-w-3xl text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-inset px-3 py-1 text-xs font-mono text-rose-400">
            TRANSPARENT PRICING
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Start free. Scale when your pipeline does.
          </h2>
          <p className="text-sm sm:text-base text-ink-secondary leading-relaxed">
            Every tier runs the same hardened diagnostic engine. The difference is quota,
            retention, and team tooling — not features hidden behind a paywall.
          </p>
        </div>

        {/* ── PRICING CARDS ── */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-7 items-stretch">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className={`flex flex-col justify-between rounded-2xl backdrop-blur-md relative transition-all duration-200 overflow-hidden ${
                tier.highlighted
                  ? 'border-2 border-rose-500 bg-raised/90 shadow-2xl shadow-rose-950/40'
                  : 'border border-hairline/80 bg-raised/50 shadow-lg hover:border-hairline hover:bg-raised/80'
              }`}
            >
              {/* Recommended badge */}
              {tier.highlighted && (
                <div className="bg-rose-500 px-4 py-1.5 text-center">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white">
                    <Sparkles className="h-3 w-3" />
                    Most Popular
                  </span>
                </div>
              )}

              <div className="p-6 sm:p-7 space-y-5">
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">{tier.name}</h3>
                  <p className="text-xs text-ink-secondary mt-1 leading-relaxed min-h-[36px]">
                    {tier.description}
                  </p>
                </div>

                {/* Price */}
                <div className="flex items-baseline gap-1.5 pb-4 border-b border-hairline/60">
                  <span className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
                    {tier.price}
                  </span>
                  <span className="text-xs font-mono text-ink-muted">/{tier.cadence}</span>
                </div>

                {/* Quota block */}
                <div className="rounded-lg border border-hairline/60 bg-inset/70 p-3 space-y-1.5 font-mono text-xs">
                  <div className="flex items-center justify-between text-white font-semibold">
                    <span>Diagnosis quota</span>
                    <span className={tier.highlighted ? 'text-rose-400' : 'text-cyan-400'}>
                      {tier.runsPerMonth}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-ink-muted text-[11px]">
                    <span>History retention</span>
                    <span>{tier.history}</span>
                  </div>
                </div>

                {/* Features */}
                <ul className="space-y-2.5 text-xs text-slate-300">
                  {tier.features.map((feat, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className={`h-4 w-4 shrink-0 mt-0.5 ${
                        tier.highlighted ? 'text-rose-400' : 'text-emerald-400'
                      }`} />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* CTA */}
              <div className="px-6 sm:px-7 pb-6 sm:pb-7 pt-2">
                <Link
                  to={ROUTES.login}
                  className={`group flex w-full items-center justify-center gap-2 rounded-lg py-3 px-4 text-xs font-semibold transition-all focus-visible:ring-2 focus-visible:ring-rose-500 ${
                    tier.highlighted
                      ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-950/40'
                      : 'bg-white text-neutral-950 hover:bg-neutral-100 shadow-sm'
                  }`}
                >
                  <span>{tier.ctaText}</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* ── ENTERPRISE ROW ── */}
        <div className="mt-6 rounded-2xl border border-hairline/60 bg-raised/40 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-hairline bg-inset text-ink-secondary">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Enterprise & Self-Hosted</h3>
              <p className="text-xs text-ink-secondary mt-0.5">
                Unlimited repositories, custom AI budgets, SAML SSO, audit logs, and on-premise PostgreSQL deployment.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
            <span className="font-mono text-xs text-ink-muted whitespace-nowrap">Custom pricing</span>
            <a
              href="mailto:enterprise@hopper.dev"
              className="inline-flex items-center gap-2 rounded-lg border border-hairline bg-raised px-4 py-2.5 text-xs font-semibold text-white hover:bg-raised/80 transition-colors"
            >
              <Zap className="h-3.5 w-3.5 text-rose-400" />
              Contact Sales
            </a>
          </div>
        </div>

        {/* ── TRUST FACTS ── */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {TRUST_FACTS.map((fact) => (
            <span key={fact} className="flex items-center gap-1.5 text-xs text-ink-muted">
              <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              {fact}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};
