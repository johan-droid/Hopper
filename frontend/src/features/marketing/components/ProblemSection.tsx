import React from 'react';
import {
  XCircle,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Clock,
  GitPullRequest,
  Fingerprint,
  Zap,
} from 'lucide-react';

const PAIN_POINTS = [
  {
    icon: AlertTriangle,
    title: 'Unbounded Log Archaeology',
    body: 'GitHub shows a 50MB+ raw terminal dump. You scroll, ctrl+F, miss context, give up and re-run the job hoping it was a fluke.',
  },
  {
    icon: RefreshCw,
    title: 'Blind Re-Runs',
    body: 'Teams re-run 30-minute pipelines without knowing if the failure is deterministic or flaky. Cloud compute evaporates. Developers context-switch.',
  },
  {
    icon: ShieldAlert,
    title: 'Credentials in Plain Sight',
    body: 'AWS keys, GitHub tokens, and DB URIs leak into runner logs. They propagate to CI artifact stores, log aggregators, and PR comments.',
  },
  {
    icon: Clock,
    title: 'Duplicate Diagnosis Work',
    body: 'Three developers on the same team investigate the same fingerprinted failure on separate branches, write the same Slack messages.',
  },
];

const AFTER_ITEMS = [
  { icon: Zap,            text: 'Webhook ingested in <50ms with HMAC-SHA256 verification' },
  { icon: Fingerprint,    text: 'SHA-256 canonical fingerprint collapses duplicate failures' },
  { icon: ShieldCheck,    text: 'Credentials scrubbed from log before LLM context window' },
  { icon: GitPullRequest, text: 'Sticky PR comment updated — not spammed — with root cause' },
];

export const ProblemSection: React.FC = () => {
  return (
    <section id="problem" className="relative border-t border-hairline/60 py-16 sm:py-24 bg-raised/10">
      {/* Subtle top gradient */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rose-500/30 to-transparent"
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* ── HEADER ── */}
        <div className="mx-auto max-w-3xl text-center space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-inset px-3 py-1 text-xs font-mono text-ink-muted">
            THE DEVELOPER BOTTLENECK
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            A red build is not a diagnosis.
          </h2>
          <p className="text-sm sm:text-base text-ink-secondary leading-relaxed">
            CI runners tell you <em className="text-white not-italic">that</em> something failed.
            Developers spend hours figuring out <em className="text-white not-italic">why</em>,
            whether it matters, and whether anyone else already fixed it.
          </p>
        </div>

        {/* ── PAIN GRID ── */}
        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {PAIN_POINTS.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                className="group flex gap-4 rounded-xl border border-rose-500/15 bg-canvas p-5 transition-colors hover:border-rose-500/30 hover:bg-rose-950/10"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-950/30 text-rose-400 group-hover:border-rose-500/40 transition-colors">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-white">{p.title}</h3>
                  <p className="text-xs text-ink-secondary leading-relaxed">{p.body}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── BEFORE / AFTER COMPARISON ── */}
        <div className="mt-14 grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* BEFORE */}
          <div className="rounded-2xl border border-rose-500/25 bg-canvas/90 overflow-hidden shadow-xl">
            <div className="flex items-center gap-2.5 border-b border-hairline/60 px-5 py-3.5 bg-rose-950/20">
              <XCircle className="h-4 w-4 text-rose-500" />
              <span className="text-sm font-semibold text-white">Without Hopper</span>
              <span className="ml-auto font-mono text-[10px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                Current
              </span>
            </div>
            <div className="p-5 space-y-3">
              {/* Raw log terminal */}
              <div className="rounded-lg border border-hairline/50 bg-black/70 p-4 font-mono text-xs text-slate-300 space-y-1.5">
                <div className="text-ink-muted text-[10px] flex items-center justify-between pb-2 border-b border-white/5 mb-2">
                  <span>github-actions://runs/8492019482/jobs/19481029481</span>
                  <span className="text-rose-400">52.4 MB</span>
                </div>
                <p className="text-neutral-600">##[group]Setting up container runner 2.319.0...</p>
                <p className="text-neutral-600">##[group]Run actions/setup-node@v4...</p>
                <p className="text-neutral-500 italic">... 84,219 lines omitted ...</p>
                <p className="text-rose-400 font-semibold">
                  FAIL src/auth/jwt-verifier.spec.ts {'>'} rejects expired token
                </p>
                <p className="text-rose-300">
                  AssertionError: expected 'active' to deeply equal 'expired'
                </p>
                <p className="text-amber-400/70">
                  ENV_SECRET=AKIAIOSFODNN7EXAMPLE (leaked)
                </p>
                <p className="text-neutral-500">Process completed with exit code 1.</p>
              </div>

              {/* Developer workflow without Hopper */}
              <ul className="space-y-2.5 pt-1">
                {[
                  'Open 52MB log in browser — wait 8s to load',
                  'Ctrl+F "error" — 1,847 matches, all ANSI noise',
                  'Paste log into ChatGPT — context window exceeded',
                  'Re-run the job and go get coffee',
                  'Come back to same failure 30 minutes later',
                ].map((step) => (
                  <li key={step} className="flex items-start gap-2 text-xs text-ink-secondary">
                    <XCircle className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
              <div className="pt-2 font-mono text-xs text-rose-400 border-t border-hairline/50">
                Mean time to diagnosis: <span className="font-bold">47 minutes</span>
              </div>
            </div>
          </div>

          {/* AFTER */}
          <div className="rounded-2xl border border-cyan-500/25 bg-canvas/90 overflow-hidden shadow-xl">
            <div className="flex items-center gap-2.5 border-b border-hairline/60 px-5 py-3.5 bg-cyan-950/20">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-semibold text-white">With Hopper</span>
              <span className="ml-auto font-mono text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                14.2s
              </span>
            </div>
            <div className="p-5 space-y-3">
              {/* Diagnosis result */}
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/20 p-4 font-mono text-xs space-y-2">
                <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider pb-1 border-b border-cyan-500/20 mb-1">
                  {'<!-- ci-doctor-sticky-comment -->'}
                </div>
                <p className="text-slate-200 font-sans text-xs leading-relaxed">
                  <strong className="text-white">Root Cause:</strong> Test fixture initializes{' '}
                  <code className="text-cyan-300">expires_at</code> before fake timers are
                  installed, so the JWT verifier reads a wall-clock expired timestamp.
                </p>
                <pre className="text-[11px] bg-black/40 rounded p-2 overflow-x-auto text-slate-300">
{`- const token = generateTestToken({ ttl: 3600 });
- vi.useFakeTimers();
+ vi.useFakeTimers();
+ const token = generateTestToken({ ttl: 3600 });`}
                </pre>
                <p className="text-[10px] text-cyan-300/70">
                  Confidence: 94% · Flakiness: 12% (non-flaky) · sig: e3b0c44298fc1c14…
                </p>
              </div>

              {/* Hopper workflow */}
              <ul className="space-y-2.5 pt-1">
                {AFTER_ITEMS.map((a) => {
                  const Icon = a.icon;
                  return (
                    <li key={a.text} className="flex items-start gap-2 text-xs text-ink-secondary">
                      <Icon className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{a.text}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="pt-2 font-mono text-xs text-emerald-400 border-t border-hairline/50">
                Mean time to diagnosis: <span className="font-bold">14.2 seconds</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
