import React from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../../lib/routes';
import { Check, ArrowRight, Sparkles } from 'lucide-react';

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
  ctaVariant: 'primary' | 'secondary';
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
      'Instant webhook ingress (<50ms)',
      'Basic sticky PR comment diagnosis',
      'ANSI stripping & secret scrubbing',
      'Preview flakiness teaser',
      'Gateway AI diagnosis (Groq / NVIDIA NIM free tier)',
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
    description: 'High-speed diagnostic intelligence and flakiness tracking for active engineers.',
    runsPerMonth: '250 runs / month',
    history: '30 days history',
    features: [
      'Up to 5 connected repositories',
      'Sub-15s AI root-cause diagnosis',
      'Verified code diffs in sticky PR comments',
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
    description: 'Comprehensive flakiness elimination and team notifications for fast engineering groups.',
    runsPerMonth: '1,000 runs / month',
    history: '90 days history',
    features: [
      'Unlimited connected repositories',
      'Full workspace team collaboration & RBAC',
      'Slack & Discord failure alert webhooks',
      'Flakiness auto-retry recommendations (>80%)',
      'Cross-PR regression clustering',
      'Multi-tenant workspace isolation (RLS)',
      'Custom monthly AI budget limits',
    ],
    ctaText: 'Upgrade to Team',
    ctaVariant: 'secondary',
  },
];

export const PricingSection: React.FC = () => {
  return (
    <section id="pricing" className="relative border-t border-hairline/70 bg-canvas py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-inset px-3 py-1 text-xs font-mono text-rose-400">
            <span>TRANSPARENT PRICING</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Predictable Plans for Modern Engineering Teams
          </h2>
          <p className="text-sm sm:text-base text-ink-secondary leading-relaxed">
            Start with 30 free diagnoses every month. Scale to dedicated flakiness tracking and team webhook alerts as your pipeline velocity increases.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-stretch">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className={`flex flex-col justify-between rounded-2xl p-6 sm:p-8 backdrop-blur-md relative transition-all duration-200 ${
                tier.highlighted
                  ? 'border-2 border-rose-500 bg-raised/90 shadow-2xl shadow-rose-950/30'
                  : 'border border-hairline bg-raised/50 shadow-lg hover:border-hairline hover:bg-raised'
              }`}
            >
              {tier.highlighted && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-sm">
                    <Sparkles className="h-3 w-3" />
                    <span>Recommended for Developers</span>
                  </span>
                </div>
              )}

              <div className="space-y-5">
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    {tier.name}
                  </h3>
                  <p className="text-xs text-ink-secondary mt-1 min-h-[32px]">
                    {tier.description}
                  </p>
                </div>

                {/* Price Display */}
                <div className="flex items-baseline gap-1.5 pb-4 border-b border-hairline/60">
                  <span className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
                    {tier.price}
                  </span>
                  <span className="text-xs font-mono text-ink-muted">
                    /{tier.cadence}
                  </span>
                </div>

                {/* Quotas */}
                <div className="rounded-lg border border-hairline bg-inset/70 p-3 space-y-1 font-mono text-xs">
                  <div className="flex items-center justify-between text-white font-medium">
                    <span>Diagnosis Quota</span>
                    <span className="text-rose-400">{tier.runsPerMonth}</span>
                  </div>
                  <div className="flex items-center justify-between text-ink-muted text-[11px]">
                    <span>Retention</span>
                    <span>{tier.history}</span>
                  </div>
                </div>

                {/* Feature Checklist */}
                <ul className="space-y-2.5 pt-2 text-xs text-slate-300">
                  {tier.features.map((feat, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <Check className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action Button */}
              <div className="mt-8 pt-4 border-t border-hairline/60">
                <Link
                  to={ROUTES.login}
                  className={`group flex w-full items-center justify-center gap-2 rounded-lg py-3 px-4 text-xs font-semibold transition-all ${
                    tier.highlighted
                      ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-md shadow-rose-950/40'
                      : 'bg-white text-neutral-950 hover:bg-neutral-100 shadow-sm'
                  }`}
                >
                  <span>{tier.ctaText}</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
