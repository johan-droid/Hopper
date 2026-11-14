import React from 'react';
import {
  Database,
  Layers,
  Cpu,
  CreditCard,
  Server,
  CheckCircle2,
} from 'lucide-react';
import { GithubIcon } from '../../../components/ui/primitives';

interface IntegrationCard {
  name: string;
  badge: string;
  category: string;
  description: string;
  details: string[];
  icon: React.ElementType;
}

const INTEGRATIONS: IntegrationCard[] = [
  {
    name: 'GitHub Actions & GitHub App',
    badge: 'Core Ingress',
    category: 'CI/CD & Source Control',
    description: 'Ingests workflow_job and workflow_run failure webhooks in under 50ms with constant-time HMAC verification.',
    details: [
      'Zero-YAML setup via GitHub App installation',
      'Automated sticky comment updates on pull requests',
      'Installation tokens cached with 55-minute rotation',
    ],
    icon: GithubIcon,
  },
  {
    name: 'Supabase PostgreSQL 16 + pgvector',
    badge: 'Storage & Vector Moat',
    category: 'Database & Queue',
    description: 'Acts as the single durable system of record for outbox jobs, failure signatures, and multi-tenant RLS.',
    details: [
      'pgvector HNSW index for semantic error clustering',
      'Durable outbox with SELECT FOR UPDATE SKIP LOCKED',
      'Strict Row-Level Security with dedicated hopper_app role',
    ],
    icon: Database,
  },
  {
    name: 'AI Gateway: Groq + NVIDIA NIM',
    badge: 'Provider-Independent AI',
    category: 'Serverless Edge AI',
    description: 'Routes every AI request through one internal gateway with task-aware model selection, failover, and circuit breakers.',
    details: [
      'Groq OpenAI-compatible API as primary provider',
      'NVIDIA NIM API Catalog as secondary provider',
      'Deterministic fallback when every provider is unavailable',
    ],
    icon: Cpu,
  },
  {
    name: 'Anthropic Claude & OpenAI',
    badge: 'Optional Paid LLMs',
    category: 'Reasoning Providers',
    description: 'Provides structured diagnostic reasoning with strict Zod schema validation and prompt injection defenses.',
    details: [
      'Supports Claude 3.5 Haiku and OpenAI GPT-4o-mini',
      'Bounded input wrapped in <UNTRUSTED_CI_LOG> boundaries',
      'Deterministic local mock engine for offline testing',
    ],
    icon: Layers,
  },
  {
    name: 'Stripe Billing & Subscriptions',
    badge: 'Monetization',
    category: 'Payments & Quota Guard',
    description: 'Manages subscription lifecycles, Checkout sessions, and automated plan quota enforcement across Free, Pro, and Team tiers.',
    details: [
      'Signed webhook verification via stripe.webhooks.constructEvent',
      'Tier quotas: Free (30 runs), Pro ($9/mo, 250), Team ($29/mo, 1000)',
      'Customer portal integration for self-service upgrades',
    ],
    icon: CreditCard,
  },
  {
    name: 'Vercel Multi-Service Platform',
    badge: 'Cloud Host',
    category: 'Hosting & Serverless Ingress',
    description: 'Hosts both the Express API Gateway and Vite React SPA on a single origin, eliminating cross-origin CORS latency.',
    details: [
      'Same-origin multi-service routing via vercel.json',
      'Vercel Queues push delivery adapter for serverless scaling',
      'Automated daily cron drain backstop for stale lease reaping',
    ],
    icon: Server,
  },
];

export const IntegrationsSection: React.FC = () => {
  return (
    <section id="integrations" className="relative border-t border-hairline/70 bg-raised/20 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-inset px-3 py-1 text-xs font-mono text-rose-400">
            <span>VERIFIED ECOSYSTEM</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Integrations Grounded in Real Architecture
          </h2>
          <p className="text-sm sm:text-base text-ink-secondary leading-relaxed">
            Every integration displayed below is implemented, tested, and guarded in the Hopper repository. No fictional partnerships or unverified marketing claims.
          </p>
        </div>

        {/* Integrations Grid */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {INTEGRATIONS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.name}
                className="flex flex-col justify-between rounded-xl border border-hairline/80 bg-raised/70 p-6 shadow-lg backdrop-blur-sm transition-all duration-200 hover:border-hairline hover:bg-raised"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-ink-muted uppercase">
                      {item.category}
                    </span>
                    <span className="font-mono text-[10px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                      {item.badge}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-hairline bg-inset text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-base font-bold text-white tracking-tight">
                      {item.name}
                    </h3>
                  </div>

                  <p className="text-xs text-ink-secondary leading-relaxed">
                    {item.description}
                  </p>

                  <ul className="space-y-2 pt-2 border-t border-hairline/50 text-[11px] text-slate-300">
                    {item.details.map((detail, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
