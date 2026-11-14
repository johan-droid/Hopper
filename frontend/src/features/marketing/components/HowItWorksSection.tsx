import React from 'react';
import {
  Terminal,
  Fingerprint,
  Activity,
  MessageSquare,
  CheckCircle2,
} from 'lucide-react';
import { GithubIcon } from '../../../components/ui/primitives';

interface PipelineStep {
  number: string;
  title: string;
  category: string;
  summary: string;
  detail: string;
  invariant: string;
  icon: React.ElementType;
}

const LIFECYCLE_STEPS: PipelineStep[] = [
  {
    number: '01',
    title: 'Cryptographic Event Ingestion',
    category: 'Ingress & Deduplication',
    summary: 'Receives GitHub App workflow_job and workflow_run webhooks in under 50ms.',
    detail: 'Verifies X-Hub-Signature-256 with constant-time HMAC-SHA256 comparison. Atomically claims delivery GUIDs in hopper_webhook_deliveries to reject replay attacks within 24 hours.',
    invariant: 'crypto.timingSafeEqual + Atomic SQL Claim',
    icon: GithubIcon,
  },
  {
    number: '02',
    title: 'Log Slicing & Secret Scrubbing',
    category: 'Parser & Sanitizer',
    summary: 'Extracts the critical failure execution window while redacting sensitive tokens.',
    detail: 'Streams failed job logs capped at the tail 300 KB to avoid multi-hundred megabyte zip archives. Strips ANSI escape codes and runner group noise. Deterministic regex scrubbing purges AWS keys, tokens, and DB URIs.',
    invariant: 'Tail 300KB Cap + Deterministic SecretScrubber',
    icon: Terminal,
  },
  {
    number: '03',
    title: 'Failure Fingerprinting & Cloud Moat',
    category: 'AST Normalization',
    summary: 'Collapses identical failures across runs, branches, and PRs into a canonical signature.',
    detail: 'Masks dynamic tokens (UUIDs, timestamps, memory addresses, line/column coordinates). Generates canonical signature_hash = SHA256(job_name + step_name + normalized_template) stored in PostgreSQL with pgvector embeddings.',
    invariant: 'SHA-256 Canonical Normalization + pgvector',
    icon: Fingerprint,
  },
  {
    number: '04',
    title: 'Bayesian Flakiness Engine',
    category: 'Statistical Intelligence',
    summary: 'Differentiates genuine code breakages from non-deterministic test failures.',
    detail: 'Evaluates four weighted signals: immediate retry passes on the exact same commit SHA, recurrence frequency on the main branch, spread across independent PRs, and infrastructure timeout categories.',
    invariant: 'Multi-Signal Bayesian Posterior (0-100%)',
    icon: Activity,
  },
  {
    number: '05',
    title: 'In-Situ Pull Request Diagnosis',
    category: 'Delivery & Action',
    summary: 'Posts structured root-cause explanations and verified code diffs to GitHub.',
    detail: 'Invokes multi-provider LLM reasoning (Claude 3.5 Haiku, OpenAI GPT-4o-mini, browser Puter.js, or local mock) wrapped in untrusted log boundaries. Upserts a single sticky PR comment without notification noise.',
    invariant: 'Sticky PR Comment (<!-- ci-doctor-sticky-comment -->)',
    icon: MessageSquare,
  },
];

export const HowItWorksSection: React.FC = () => {
  return (
    <section id="how-it-works" className="relative border-t border-hairline/70 bg-canvas py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-inset px-3 py-1 text-xs font-mono text-rose-400">
            <span>THE 5-STAGE LIFECYCLE</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            How Hopper Diagnoses CI Failures
          </h2>
          <p className="text-sm sm:text-base text-ink-secondary leading-relaxed">
            From the moment a CI runner encounters an unhandled exception to a structured pull request comment, Hopper executes an automated, hardened diagnostic lifecycle.
          </p>
        </div>

        {/* Connected Steps Grid */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {LIFECYCLE_STEPS.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className={`flex flex-col justify-between rounded-xl border border-hairline/80 bg-raised/70 p-6 sm:p-7 shadow-lg backdrop-blur-sm transition-all duration-200 hover:border-hairline hover:bg-raised ${
                  idx === 4 ? 'md:col-span-2 lg:col-span-2' : ''
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                      STEP {step.number}
                    </span>
                    <span className="font-mono text-[11px] text-ink-muted">
                      {step.category}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-hairline bg-inset text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                      {step.title}
                    </h3>
                  </div>

                  <p className="text-xs sm:text-sm font-medium text-white/90">
                    {step.summary}
                  </p>

                  <p className="text-xs text-ink-secondary leading-relaxed">
                    {step.detail}
                  </p>
                </div>

                <div className="mt-6 pt-3.5 border-t border-hairline/60 flex items-center justify-between text-[11px] font-mono text-ink-muted">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span className="truncate max-w-[200px]">{step.invariant}</span>
                  </span>
                  <span className="text-neutral-500">Phase {idx + 1}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
