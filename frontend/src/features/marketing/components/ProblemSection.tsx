import React from 'react';
import {
  XCircle,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  GitPullRequest,
  Fingerprint,
  Zap,
} from 'lucide-react';

export const ProblemSection: React.FC = () => {
  return (
    <section id="problem" className="relative border-t border-hairline/70 bg-raised/20 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-inset px-3 py-1 text-xs font-mono text-ink-muted">
            <span>THE DEVELOPER BOTTLENECK</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            A red build is not a diagnosis.
          </h2>
          <p className="text-sm sm:text-base text-ink-secondary leading-relaxed">
            Continuous integration engines alert you when a test or step exits with a non-zero code. But developers spend hours sifting through raw terminal dumps to find out why it failed, whether it is flaky, or if someone else already diagnosed it.
          </p>
        </div>

        {/* Side-by-Side Comparison */}
        <div className="mt-12 lg:mt-16 grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 items-stretch">
          {/* Card 1: The Raw Failure Nightmare */}
          <div className="flex flex-col justify-between rounded-2xl border border-rose-500/30 bg-canvas/90 p-6 sm:p-8 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-36 h-36 bg-rose-500/5 rounded-full blur-2xl pointer-events-none" />

            <div className="space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-hairline/60">
                <div className="flex items-center gap-2.5">
                  <XCircle className="h-5 w-5 text-rose-500" />
                  <span className="font-semibold text-white text-base">The Raw CI Failure Experience</span>
                </div>
                <span className="font-mono text-[10px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                  Current Pain
                </span>
              </div>

              {/* Monospace terminal simulation of raw failure */}
              <div className="rounded-lg border border-hairline/70 bg-black/60 p-4 font-mono text-xs text-slate-300 space-y-2 select-text">
                <div className="text-ink-muted text-[11px] flex items-center justify-between pb-1 border-b border-white/5">
                  <span>github-actions://runs/8492019482/job/19481029481</span>
                  <span>52.4 MB Log</span>
                </div>
                <p className="text-neutral-500">##[group]Setting up container runner 2.319.0...</p>
                <p className="text-neutral-500">##[group]Run actions/checkout@v4...</p>
                <p className="text-neutral-500">... [84,000 lines omitted] ...</p>
                <p className="text-rose-400 font-semibold">
                  FAIL src/auth/jwt-verifier.spec.ts &gt; rejects expired token
                </p>
                <p className="text-rose-300">
                  AssertionError: expected 'active' to deeply equal 'expired'
                </p>
                <p className="text-amber-300/80">
                  ENV_AWS_KEY=AKIAIOSFODNN7EXAMPLE (leaked in unscrubbed runner log)
                </p>
                <p className="text-neutral-500">
                  Error: Process completed with exit code 1.
                </p>
              </div>

              {/* Friction points list */}
              <ul className="space-y-3 pt-2 text-xs text-ink-secondary">
                <li className="flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                  <span>
                    <strong className="text-white">Unbounded Data Sifting:</strong> Developers scroll through 50MB+ raw archives, ANSI control artifacts, and irrelevant step logs.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <RefreshCw className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                  <span>
                    <strong className="text-white">Blind Re-Runs:</strong> Teams re-run whole 30-minute pipelines hoping for a green pass, wasting cloud compute without knowing if the failure was non-deterministic.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                  <span>
                    <strong className="text-white">Secret Exposure Risks:</strong> Sensitive AWS keys, tokens, and DB connection strings printed in stdout remain unredacted in raw log storage.
                  </span>
                </li>
              </ul>
            </div>

            <div className="mt-6 pt-4 border-t border-hairline/40 text-xs font-mono text-ink-muted">
              Result: 20-45 minutes wasted per failing build
            </div>
          </div>

          {/* Card 2: The Hopper Investigation Experience */}
          <div className="flex flex-col justify-between rounded-2xl border border-hairline bg-raised/80 p-6 sm:p-8 shadow-xl relative overflow-hidden ring-1 ring-white/5">
            <div className="absolute top-0 right-0 w-36 h-36 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

            <div className="space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-hairline/60">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  <span className="font-semibold text-white text-base">Hopper Structured Investigation</span>
                </div>
                <span className="font-mono text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  Verified Invariant
                </span>
              </div>

              {/* Monospace diagnosis preview */}
              <div className="rounded-lg border border-hairline/70 bg-black/70 p-4 font-mono text-xs text-slate-200 space-y-2 select-text">
                <div className="text-ink-muted text-[11px] flex items-center justify-between pb-1 border-b border-white/5">
                  <span className="flex items-center gap-1.5 text-rose-400">
                    <Zap className="h-3.5 w-3.5" />
                    <span>SHA-256 Fingerprint Moat</span>
                  </span>
                  <span className="text-emerald-400 font-semibold">Flakiness: 84.5%</span>
                </div>
                <p className="text-white font-medium">
                  Root Cause: Stale token evaluation due to clock drift before mock freeze.
                </p>
                <div className="p-2 rounded bg-black/60 border border-hairline/60 text-[11px] space-y-1">
                  <p className="text-rose-400">- const token = generateToken(); vi.useFakeTimers();</p>
                  <p className="text-emerald-400">+ vi.useFakeTimers(); const token = generateToken();</p>
                </div>
                <p className="text-ink-muted text-[11px]">
                  Secrets Redacted: <span className="text-rose-400">[REDACTED_AWS_KEY]</span> · Line: 42:15
                </p>
              </div>

              {/* Value capabilities list */}
              <ul className="space-y-3 pt-2 text-xs text-ink-secondary">
                <li className="flex items-start gap-2.5">
                  <Fingerprint className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                  <span>
                    <strong className="text-white">Normalized Fingerprint Moat:</strong> Dynamic UUIDs, memory addresses, and line numbers are masked to collapse repeat occurrences across runs into one canonical signature.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                  <span>
                    <strong className="text-white">Deterministic Secret Scrubbing:</strong> AWS keys, GitHub tokens, database URIs, and SSH keys are scrubbed before storage or model prompting.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <GitPullRequest className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                  <span>
                    <strong className="text-white">Sticky PR Comment:</strong> Delivers root cause diagnosis and unified diff directly to the PR thread, updating continuously without noisy notifications.
                  </span>
                </li>
              </ul>
            </div>

            <div className="mt-6 pt-4 border-t border-hairline/40 text-xs font-mono text-emerald-400 flex items-center justify-between">
              <span>Result: Sub-15s actionable root cause</span>
              <span>Zero PR Noise</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
