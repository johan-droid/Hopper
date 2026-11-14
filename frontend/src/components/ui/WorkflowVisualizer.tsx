import React from 'react';
import {
  Terminal,
  Fingerprint,
  Activity,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react';
import { GithubIcon } from './primitives';

interface Step {
  id: string;
  number: string;
  title: string;
  detail: string;
  tag: string;
  icon: React.ElementType;
}

const STEPS: Step[] = [
  {
    id: 'ingest',
    number: '01',
    title: 'Ingest CI Failure Event',
    detail: 'HMAC-SHA256 verified GitHub App webhook ingress for workflow_job and workflow_run events. Deduplicated in PostgreSQL.',
    tag: 'GitHub App',
    icon: GithubIcon,
  },
  {
    id: 'slice',
    number: '02',
    title: 'Log Slicing & Redaction',
    detail: 'Bounded 300 KB tail extraction. ANSI control characters stripped; passwords, tokens, and secrets scrubbed before storage.',
    tag: 'Scrubber',
    icon: Terminal,
  },
  {
    id: 'fingerprint',
    number: '03',
    title: 'Deterministic Fingerprinting',
    detail: 'Volatile timestamps, memory addresses, UUIDs, and commit SHAs normalized to collapse duplicate failures into stable signatures.',
    tag: 'Token Normalizer',
    icon: Fingerprint,
  },
  {
    id: 'flakiness',
    number: '04',
    title: 'Flakiness Evidence Scoring',
    detail: 'Same-SHA retry passes, default-branch stability, and cross-PR spread evaluated into an evidence-grounded flakiness metric.',
    tag: 'Moat Engine',
    icon: Activity,
  },
  {
    id: 'report',
    number: '05',
    title: 'In-Situ PR Diagnosis',
    detail: 'Updates a single sticky PR comment and GitHub Check Run with verified log lines, root cause clues, and local repro commands.',
    tag: 'PR Reporter',
    icon: MessageSquare,
  },
];

export const WorkflowVisualizer: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`relative flex flex-col space-y-4 ${className}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-hairline/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-cyan-400 motion-safe:animate-pulse" />
          <span className="font-mono text-[11px] font-medium tracking-wide uppercase text-ink-muted">
            Failure Diagnosis Pipeline
          </span>
        </div>
        <span className="font-mono text-[10px] text-ink-muted bg-inset/80 px-2 py-0.5 rounded border border-hairline">
          v2.0-engine
        </span>
      </div>

      {/* Steps List */}
      <div className="relative space-y-2.5">
        {/* Continuous connector line */}
        <div
          className="absolute left-[19px] top-4 bottom-4 w-px bg-gradient-to-b from-hairline via-accent/30 to-hairline/20"
          aria-hidden="true"
        />

        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isFinal = idx === STEPS.length - 1;

          return (
            <div
              key={step.id}
              className="group relative flex items-start gap-3.5 rounded-lg border border-hairline/40 bg-raised/50 p-3 transition-colors hover:border-hairline hover:bg-raised/80"
            >
              {/* Step indicator circle */}
              <div
                className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-mono transition-transform duration-200 group-hover:scale-105 ${
                  isFinal
                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400'
                    : 'border-hairline bg-inset text-ink-secondary group-hover:text-accent group-hover:border-accent/40'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>

              {/* Step content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-ink-muted">{step.number}</span>
                    <h2 className="text-xs font-medium text-ink tracking-tight">{step.title}</h2>
                  </div>
                  <span
                    className={`font-mono text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                      isFinal
                        ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400'
                        : 'border-hairline bg-inset text-ink-muted'
                    }`}
                  >
                    {step.tag}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-secondary">
                  {step.detail}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Evidence-First Callout */}
      <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-hairline/60 bg-inset/70 p-3">
        <ShieldCheck className="h-4 w-4 shrink-0 text-cyan-400 mt-0.5" />
        <div className="text-[11px] leading-relaxed text-ink-secondary">
          <strong className="font-medium text-ink">Evidence-First Guarantee:</strong>{' '}
          Every diagnosis cites verifiable log line numbers and concrete stack frames.{' '}
          <span className="text-ink">Zero speculative hallucination.</span>
        </div>
      </div>
    </div>
  );
};

export default WorkflowVisualizer;
