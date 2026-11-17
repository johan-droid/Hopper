import React, { useState } from 'react';
import {
  Webhook,
  Database,
  Scissors,
  Fingerprint,
  MessageSquare,
  CheckCircle2,
  ArrowRight,
  Activity,
} from 'lucide-react';

interface Step {
  number: string;
  title: string;
  category: string;
  summary: string;
  detail: string;
  invariant: string;
  implementation: string;
  icon: React.ElementType;
}

const STEPS: Step[] = [
  {
    number: '01',
    title: 'Cryptographic Webhook Ingress',
    category: 'Security Boundary',
    summary: 'Receives and verifies GitHub workflow_job events in under 50ms.',
    detail:
      'Every incoming webhook is validated with constant-time HMAC-SHA256 (crypto.timingSafeEqual). The delivery ID is claimed atomically in PostgreSQL to prevent replay. The raw payload is committed to the durable outbox before HTTP 202 is returned.',
    invariant: 'crypto.timingSafeEqual · replay guard',
    implementation: 'backend/src/server/routes/webhooks.ts',
    icon: Webhook,
  },
  {
    number: '02',
    title: 'PostgreSQL Durable Outbox',
    category: 'Delivery Guarantee',
    summary: 'At-least-once job delivery using SELECT FOR UPDATE SKIP LOCKED.',
    detail:
      'Failed CI events are durably persisted in hopper_job_queue before the HTTP response is acknowledged. Workers claim jobs without lock contention using SKIP LOCKED. Failed jobs retry with exponential back-off and graduate to hopper_job_dead_letters after 5 attempts.',
    invariant: 'hopper_job_queue · hopper_claim_next_job()',
    implementation: 'backend/src/queue/job-store.ts',
    icon: Database,
  },
  {
    number: '03',
    title: 'Bounded Log Slicing & Secret Scrubbing',
    category: 'Data Extraction',
    summary: 'Streams 300KB tail window; redacts credentials before any AI context.',
    detail:
      'Streams the failed job log via GitHub API — no 500MB archive downloads. Strips all ANSI control codes, then slices to the 300KB tail window centered on the failing step. SecretScrubber applies deterministic regex to redact AWS keys, GitHub tokens, and database URIs. Injected into the LLM behind <UNTRUSTED_CI_LOG> boundary tags.',
    invariant: '300KB cap · SecretScrubber · <UNTRUSTED_CI_LOG>',
    implementation: 'backend/src/lib/parser/secret-scrubber.ts',
    icon: Scissors,
  },
  {
    number: '04',
    title: 'SHA-256 Fingerprinting & Flakiness Scoring',
    category: 'Failure Intelligence',
    summary: 'Collapses duplicate failures; scores flakiness by commit SHA partition.',
    detail:
      'Masks dynamic tokens (UUIDs, timestamps, memory addresses, line/column numbers) from stack traces to produce a canonical template. The SHA-256 hash of job_name + step_name + template becomes the signature. Flakiness is scored with Bayesian heuristics — partitioned by commit SHA and branch class — so developer-pushed breakages are not misclassified as flaky tests.',
    invariant: 'SHA-256 · pgvector HNSW · Bayesian posterior',
    implementation: 'backend/src/lib/moat/flakiness-engine.ts',
    icon: Fingerprint,
  },
  {
    number: '05',
    title: 'AI-Diagnosed Sticky PR Comment',
    category: 'Delivery & Action',
    summary: 'Root-cause diagnosis on your PR in under 15 seconds — zero comment spam.',
    detail:
      'The AI gateway (Groq primary → NVIDIA NIM secondary → deterministic fallback) generates a structured root-cause explanation with a verified code diff. The result is upserted as a single sticky comment identified by <!-- ci-doctor-sticky-comment -->. No new comment is posted if one already exists — it is updated in-place.',
    invariant: '<!-- ci-doctor-sticky-comment --> · upsert only',
    implementation: 'backend/src/lib/github/pr-publisher.ts',
    icon: MessageSquare,
  },
];

export const HowItWorksSection: React.FC = () => {
  const [activeStep, setActiveStep] = useState<string>('01');

  const active = STEPS.find((s) => s.number === activeStep) ?? STEPS[0];
  const ActiveIcon = active.icon;

  return (
    <section id="how-it-works" className="relative border-t border-hairline/60 py-16 sm:py-24 bg-canvas">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent"
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* ── HEADER ── */}
        <div className="mx-auto max-w-3xl text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-inset px-3 py-1 text-xs font-mono text-rose-400">
            THE 5-STAGE DIAGNOSTIC LIFECYCLE
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            From webhook to root cause in 15 seconds.
          </h2>
          <p className="text-sm sm:text-base text-ink-secondary leading-relaxed">
            Every stage has a verifiable implementation. No handwaving — click each step to inspect the actual contract.
          </p>
        </div>

        {/* ── INTERACTIVE STEPS EXPLORER ── */}
        <div className="mt-14 rounded-2xl border border-hairline/70 bg-raised/40 overflow-hidden shadow-2xl backdrop-blur-sm">

          {/* Step navigation tabs */}
          <div className="flex overflow-x-auto border-b border-hairline/60 bg-canvas/60">
            {STEPS.map((s) => {
              const isActive = s.number === activeStep;
              const Icon = s.icon;
              return (
                <button
                  key={s.number}
                  type="button"
                  onClick={() => setActiveStep(s.number)}
                  className={`flex-1 min-w-[120px] flex flex-col items-center gap-1.5 px-3 py-4 text-center text-xs transition-all border-b-2 ${
                    isActive
                      ? 'border-rose-500 bg-rose-950/20 text-white'
                      : 'border-transparent text-ink-muted hover:text-white hover:border-hairline'
                  }`}
                >
                  <span className={`font-mono text-[10px] font-bold ${isActive ? 'text-rose-400' : 'text-ink-muted'}`}>
                    {s.number}
                  </span>
                  <Icon className={`h-4 w-4 ${isActive ? 'text-rose-400' : 'text-ink-muted'}`} />
                  <span className="font-medium leading-tight text-center hidden sm:block">{s.title}</span>
                </button>
              );
            })}
          </div>

          {/* Step detail view */}
          <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-hairline/50">

            {/* Left — explanation */}
            <div className="lg:col-span-5 p-6 sm:p-8 space-y-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold text-rose-400 uppercase tracking-wider">
                    Stage {active.number} of 05 · {active.category}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-950/30 text-rose-400">
                    <ActiveIcon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    {active.title}
                  </h3>
                </div>

                <p className="text-sm text-white/90 font-medium">{active.summary}</p>
                <p className="text-xs text-ink-secondary leading-relaxed">{active.detail}</p>
              </div>

              {/* Implementation invariant */}
              <div className="rounded-lg border border-hairline/60 bg-inset/70 p-3.5 space-y-2">
                <div className="text-[10px] font-mono uppercase tracking-wider text-ink-muted">
                  Safety Invariant
                </div>
                <div className="font-mono text-xs text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>{active.invariant}</span>
                </div>
                <div className="text-[10px] font-mono text-ink-muted flex items-center gap-1.5 pt-1">
                  <Activity className="h-3 w-3" />
                  <span>{active.implementation}</span>
                </div>
              </div>
            </div>

            {/* Right — pipeline flow visualization */}
            <div className="lg:col-span-7 p-6 sm:p-8 bg-canvas/50 flex flex-col justify-center">
              <div className="font-mono text-[10px] uppercase tracking-wider text-ink-muted mb-5">
                Full Pipeline — Stage {active.number} highlighted
              </div>

              <div className="flex flex-col gap-2">
                {STEPS.map((s, idx) => {
                  const SIcon = s.icon;
                  const isCurrent = s.number === active.number;
                  const isPast = parseInt(s.number) < parseInt(active.number);
                  return (
                    <React.Fragment key={s.number}>
                      <div
                        className={`flex items-center gap-3 rounded-lg px-4 py-3 border transition-all cursor-pointer ${
                          isCurrent
                            ? 'border-rose-500/50 bg-rose-950/25 shadow-sm shadow-rose-500/10'
                            : isPast
                            ? 'border-emerald-500/20 bg-emerald-950/10'
                            : 'border-hairline/40 bg-raised/30'
                        }`}
                        onClick={() => setActiveStep(s.number)}
                      >
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            isCurrent
                              ? 'bg-rose-500/20 border border-rose-500/40 text-rose-400'
                              : isPast
                              ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
                              : 'bg-inset border border-hairline/50 text-ink-muted'
                          }`}
                        >
                          {isPast ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <SIcon className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-white truncate">{s.title}</div>
                          <div className="text-[11px] text-ink-muted truncate">{s.summary}</div>
                        </div>
                        <span className={`font-mono text-[10px] font-bold ${
                          isCurrent ? 'text-rose-400' : isPast ? 'text-emerald-400' : 'text-ink-muted'
                        }`}>
                          {s.number}
                        </span>
                      </div>
                      {idx < STEPS.length - 1 && (
                        <div className={`flex justify-start pl-6 ${isPast ? 'text-emerald-500/40' : 'text-hairline/30'}`}>
                          <ArrowRight className="h-3 w-3 rotate-90" />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
