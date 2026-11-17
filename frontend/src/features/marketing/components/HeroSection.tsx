import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../../lib/routes';
import { GithubIcon } from '../../../components/ui/primitives';
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Check,
  Terminal,
  Zap,
  ShieldCheck,
  GitPullRequest,
  Fingerprint,
} from 'lucide-react';

// Realistic log stream that plays out in the terminal
const LOG_STREAM_LINES = [
  { delay: 0,    color: 'text-neutral-500', text: '##[group]Run npm test' },
  { delay: 300,  color: 'text-neutral-500', text: '> vitest run --coverage' },
  { delay: 600,  color: 'text-neutral-400', text: '' },
  { delay: 900,  color: 'text-neutral-400', text: ' FAIL  src/auth/jwt-verifier.spec.ts' },
  { delay: 1200, color: 'text-rose-400',    text: ' ● JWT verifier › rejects an expired token' },
  { delay: 1500, color: 'text-neutral-400', text: '' },
  { delay: 1800, color: 'text-neutral-400', text: "   AssertionError: expected 'active' to deeply" },
  { delay: 2100, color: 'text-neutral-400', text: "   equal 'expired'" },
  { delay: 2400, color: 'text-neutral-500', text: '     at verifyTokenSession (src/auth/jwt-verifier.ts:42:15)' },
  { delay: 2700, color: 'text-neutral-400', text: '' },
  { delay: 3000, color: 'text-neutral-500', text: 'Test Suites: 1 failed, 12 passed, 13 total' },
  { delay: 3300, color: 'text-rose-400',    text: 'Process completed with exit code 1.' },
  { delay: 3600, color: 'text-neutral-600', text: '' },
  { delay: 3900, color: 'text-emerald-400', text: '⚡ Hopper: Webhook received in 18ms' },
  { delay: 4200, color: 'text-emerald-300', text: '   HMAC-SHA256 signature verified ✓' },
  { delay: 4500, color: 'text-emerald-300', text: '   Outbox job committed atomically ✓' },
  { delay: 4800, color: 'text-cyan-400',    text: '   Log sliced: 300KB tail extracted' },
  { delay: 5100, color: 'text-cyan-300',    text: '   Fingerprint: sha256=e3b0c44298fc1c14...' },
  { delay: 5400, color: 'text-cyan-300',    text: '   Flakiness score: 12.0% (non-flaky)' },
  { delay: 5700, color: 'text-white',       text: '   Root cause identified — posting PR comment' },
  { delay: 6000, color: 'text-emerald-400', text: '✓ Diagnosis delivered in 14.2s' },
];

const STAGE_INDICATORS = [
  { icon: ShieldCheck,   label: 'HMAC Verified',    color: 'text-emerald-400' },
  { icon: Fingerprint,   label: 'Fingerprinted',    color: 'text-cyan-400' },
  { icon: GitPullRequest,label: 'PR Comment Posted', color: 'text-violet-400' },
];

const STAT_PILLS = [
  { value: '<50ms',    label: 'Webhook ingress' },
  { value: '300KB',   label: 'Log tail window' },
  { value: 'SHA-256', label: 'Fingerprint hash' },
  { value: '<15s',    label: 'Diagnosis delivery' },
];

export const HeroSection: React.FC = () => {
  const [visibleLines, setVisibleLines] = useState<number>(0);
  const [copied, setCopied] = useState(false);
  const [looping, setLooping] = useState(false);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const startAnimation = () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    setVisibleLines(0);
    setLooping(false);

    LOG_STREAM_LINES.forEach((_, idx) => {
      const t = setTimeout(() => {
        setVisibleLines(idx + 1);
        if (idx === LOG_STREAM_LINES.length - 1) {
          const loopT = setTimeout(() => setLooping(true), 2000);
          const restartT = setTimeout(() => startAnimation(), 5000);
          timeoutsRef.current.push(loopT, restartT);
        }
      }, LOG_STREAM_LINES[idx].delay);
      timeoutsRef.current.push(t);
    });
  };

  useEffect(() => {
    startAnimation();
    return () => timeoutsRef.current.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = () => {
    void navigator.clipboard.writeText(
      'npm install -g @hopper-ci/cli && hopper connect --github'
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section
      id="hero"
      className="relative overflow-hidden py-16 sm:py-24 lg:py-32"
      aria-label="Hero — Hopper CI Failure Diagnosis"
    >
      {/* Radial gradient focal glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-rose-600/8 blur-[160px]" />
        <div className="absolute left-1/4 top-1/3 h-[300px] w-[400px] rounded-full bg-cyan-500/6 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* ── EYEBROW ── */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2.5 rounded-full border border-rose-500/30 bg-rose-950/30 px-4 py-1.5 text-xs font-mono text-rose-300 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
            <span>CI/CD FAILURE DIAGNOSIS ENGINE · PRODUCTION</span>
          </div>
        </div>

        {/* ── HEADLINE ── */}
        <div className="mt-8 text-center space-y-5 mx-auto max-w-4xl">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.08]">
            Know why your pipeline{' '}
            <span className="relative">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-rose-300 to-rose-500">
                failed.
              </span>
            </span>
            <br />
            Fix the recurring ones{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-cyan-300">
              first.
            </span>
          </h1>

          <p className="mx-auto max-w-2xl text-base sm:text-lg text-ink-secondary leading-relaxed">
            Hopper watches your GitHub Actions runs, slices failed job logs to their relevant 300KB tail,
            scrubs secrets, fingerprints failures by SHA-256, scores flakiness with Bayesian heuristics,
            and posts a root-cause diagnosis directly on your pull request — in under 15 seconds.
          </p>
        </div>

        {/* ── CTA BUTTONS ── */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to={ROUTES.login}
            className="group flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-lg bg-white px-6 py-3.5 text-sm font-semibold text-neutral-950 shadow-lg shadow-white/5 transition-all hover:bg-neutral-100 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            <GithubIcon className="h-4 w-4 text-neutral-950" />
            <span>Connect GitHub App</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 text-neutral-950" />
          </Link>
          <a
            href="#preview"
            className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-hairline bg-raised/60 px-5 py-3.5 text-sm font-medium text-white transition-colors hover:bg-raised backdrop-blur-sm focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            <Terminal className="h-4 w-4 text-ink-muted" />
            <span>Explore Sandbox</span>
          </a>
        </div>

        {/* ── QUICK INSTALL STRIP ── */}
        <div className="mt-6 flex justify-center">
          <div className="inline-flex items-center gap-3 rounded-lg border border-hairline/50 bg-inset/80 px-4 py-2.5 backdrop-blur-sm">
            <span className="font-mono text-xs text-ink-muted select-none">$</span>
            <code className="font-mono text-xs text-ink-secondary select-all">
              hopper connect --github
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="ml-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-mono text-ink-muted hover:text-white transition-colors"
              title="Copy install command"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* ── STAT PILLS ── */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {STAT_PILLS.map((s) => (
            <div key={s.value} className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span className="font-mono font-semibold text-white">{s.value}</span>
              <span className="text-ink-muted">{s.label}</span>
            </div>
          ))}
        </div>

        {/* ── TERMINAL WINDOW ── */}
        <div className="mt-16 mx-auto max-w-4xl">
          {/* Window chrome */}
          <div className="rounded-t-xl border border-b-0 border-hairline/60 bg-raised/80 px-4 py-3 flex items-center justify-between backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-rose-500/70" />
              <div className="h-3 w-3 rounded-full bg-amber-500/50" />
              <div className="h-3 w-3 rounded-full bg-emerald-500/50" />
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-ink-muted">
              <Zap className="h-3 w-3 text-rose-400" />
              <span>hopper-engine · github-actions://runs/8492019482/jobs/19481029481</span>
            </div>
            <div className="flex items-center gap-2">
              {STAGE_INDICATORS.map((si) => {
                const Icon = si.icon;
                const done = visibleLines >= LOG_STREAM_LINES.length;
                return (
                  <span
                    key={si.label}
                    className={`flex items-center gap-1 text-[10px] font-mono transition-opacity duration-500 ${
                      done ? si.color + ' opacity-100' : 'text-ink-muted opacity-40'
                    }`}
                    title={si.label}
                  >
                    <Icon className="h-3 w-3" />
                    <span className="hidden sm:inline">{si.label}</span>
                  </span>
                );
              })}
            </div>
          </div>

          {/* Terminal body */}
          <div className="relative rounded-b-xl border border-hairline/60 bg-black/70 p-5 backdrop-blur-sm overflow-hidden">
            {/* Scanline overlay for realism */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.01] to-transparent bg-[length:100%_4px] opacity-20"
            />

            <pre className="font-mono text-xs leading-5 select-text min-h-[220px]">
              {LOG_STREAM_LINES.slice(0, visibleLines).map((line, i) => (
                <div key={i} className={`${line.color} transition-opacity duration-150`}>
                  {line.text || '\u00A0'}
                </div>
              ))}
              {/* Blinking cursor */}
              {visibleLines < LOG_STREAM_LINES.length && (
                <span className="inline-block w-2 h-3.5 bg-rose-400/90 animate-pulse align-text-bottom" />
              )}
              {looping && (
                <div className="text-neutral-600 mt-1 text-[10px]">▸ replaying in 5s…</div>
              )}
            </pre>

            {/* Diagnosis result pill — appears after animation */}
            <div
              className={`mt-4 pt-4 border-t border-hairline/40 transition-all duration-700 ${
                visibleLines >= LOG_STREAM_LINES.length
                  ? 'opacity-100 translate-y-0'
                  : 'opacity-0 translate-y-2 pointer-events-none'
              }`}
            >
              <div className="rounded-lg border border-cyan-500/25 bg-cyan-950/20 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400">
                    Hopper Root-Cause Diagnosis
                  </span>
                  <span className="text-[10px] font-mono text-emerald-400">
                    Confidence: 94% · 14.2s
                  </span>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed font-mono">
                  The test fixture sets <code className="text-cyan-300">expires_at</code> before
                  activating fake timers, so the JWT verifier evaluates an already-expired token.
                  Swap the order: call <code className="text-cyan-300">vi.useFakeTimers()</code> before{' '}
                  <code className="text-cyan-300">generateTestToken()</code>.
                </p>
                <div className="pt-1">
                  <pre className="text-[11px] font-mono text-slate-300 bg-black/40 rounded p-2 overflow-x-auto">
{`- const token = generateTestToken({ ttl: 3600 });
- vi.useFakeTimers();
+ vi.useFakeTimers();
+ const token = generateTestToken({ ttl: 3600 });`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── TRUST BADGES ── */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-[11px] font-mono text-ink-muted">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            HMAC-SHA256 Webhook Verification
          </span>
          <span className="hidden sm:block text-hairline">·</span>
          <span className="flex items-center gap-1.5">
            <Fingerprint className="h-3.5 w-3.5 text-cyan-400" />
            SHA-256 Failure Fingerprinting
          </span>
          <span className="hidden sm:block text-hairline">·</span>
          <span className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-rose-400" />
            PostgreSQL Durable Outbox
          </span>
          <span className="hidden sm:block text-hairline">·</span>
          <span className="flex items-center gap-1.5">
            <GithubIcon className="h-3.5 w-3.5 text-ink-muted" />
            Zero-YAML GitHub App Setup
          </span>
        </div>
      </div>
    </section>
  );
};
