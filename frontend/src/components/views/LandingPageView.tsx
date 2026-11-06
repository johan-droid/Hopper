import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useHealthQuery, useAdhocDiagnoseMutation } from '../../api/hooks';
import {
  Zap,
  Activity,
  ArrowRight,
  ShieldCheck,
  Database,
  Terminal,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Play,
  Github,
  Lock,
} from 'lucide-react';

interface Preset {
  title: string;
  category: string;
  flakiness: string;
  rawLog: string;
  jobName: string;
  stepName: string;
  modifiedFiles: string[];
}

const PRESETS: Record<string, Preset> = {
  playwright: {
    title: 'Playwright Async Timeout',
    category: 'Flaky Async Race Condition',
    flakiness: '92.5% Flaky (Passes on retry)',
    jobName: 'E2E Testing (Chromium)',
    stepName: 'npx playwright test',
    modifiedFiles: ['tests/checkout.spec.ts', 'src/components/cart.tsx'],
    rawLog: `Running 42 tests using 4 workers
  ✓ tests/auth/login.spec.ts:12:3 › User Login › successfully logs in with valid credentials (1.2s)
  1) tests/checkout.spec.ts:45:5 › Checkout Flow › 3D Secure verification modal ──
    Error: Timeout of 30000ms exceeded waiting for selector "[data-testid='3ds-challenge-frame']"
      at tests/checkout.spec.ts:52:19
      at Frame.waitForSelector (node_modules/playwright-core/lib/client/frame.js:321:12)
    Pending selector request:
      - waiting for locator('[data-testid=\\'3ds-challenge-frame\\']') to be visible
      - locator resolved to <iframe id="stripe-3ds-frame"> hidden
    AWS_SECRET_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
    DB_URL=postgres://root:p%40ssw0rd@10.0.4.12:5432/production_replica
  2 failed, 40 passed (34.2s)`,
  },
  jest: {
    title: 'Jest / Vitest Assertion',
    category: 'Deterministic Regression',
    flakiness: '2% Flaky (Deterministic bug)',
    jobName: 'Unit Tests',
    stepName: 'vitest run',
    modifiedFiles: ['src/auth/jwt-verifier.ts', 'src/auth/jwt-verifier.spec.ts'],
    rawLog: `FAIL  src/auth/jwt-verifier.spec.ts > Authentication Service
● Authentication Service > should verify valid signed JWT token
  AssertionError: expected 'active' to deeply equal 'revoked'
  - Expected: "revoked"
  + Received: "active"
      at src/auth/jwt-verifier.spec.ts:48:22
      at processTicksAndRejections (node:internal/process/task_queues:95:5)
  Tests: 1 failed, 24 passed, 25 total
  Snapshots: 0 total
  Time: 1.482s`,
  },
  oom: {
    title: 'Docker Node.js OOM',
    category: 'Resource Exhaustion (Code 137)',
    flakiness: '15% Flaky (Memory threshold)',
    jobName: 'Production Assets Bundle',
    stepName: 'npm run build',
    modifiedFiles: ['package.json'],
    rawLog: `<--- Last few GCs --->
[1428:0x55a1200]    42150 ms: Mark-sweep 2045.2 (2055.8) -> 2040.1 (2056.8) MB
<--- JS stacktrace --->
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
 1: 0xb09c10 node::Abort() [node]
 2: 0xa1c285 node::FatalError(char const*, char const*) [node]
 3: 0xcf8e4e v8::Utils::ReportOOMFailure(v8::internal::Isolate*, char const*, bool) [node]
Process exited with code 137`,
  },
};

export const LandingPageView: React.FC = () => {
  const { setTab, setPlanTier, supabaseUser, setAuthModalOpen } = useAppStore();
  const { data: health, isLoading: healthLoading } = useHealthQuery();
  const isHealthy = health?.status === 'healthy';

  const [activePresetKey, setActivePresetKey] = useState<string>('playwright');
  const [activeLogTab, setActiveLogTab] = useState<'hopper' | 'raw'>('hopper');
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // Live interactive demo state
  const [demoLog, setDemoLog] = useState(PRESETS.playwright.rawLog);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [demoResult, setDemoResult] = useState<{
    signature: string;
    flakiness: number;
    cleanedLines: string[];
    rootCause: string;
    fix: string;
    localCmd: string;
  } | null>({
    signature: 'sha256:7f8a91c20e149d8c3621980be103f6f1c4a921d7',
    flakiness: 92.5,
    cleanedLines: [
      '1) tests/checkout.spec.ts:45:5 › Checkout Flow › 3D Secure verification modal ──',
      '   Error: Timeout of 30000ms exceeded waiting for selector "[data-testid=\'3ds-challenge-frame\']"',
      '     at tests/checkout.spec.ts:52:19',
      '     at Frame.waitForSelector (node_modules/playwright-core/lib/client/frame.js:321:12)',
      '   AWS_SECRET_ACCESS_KEY=[REDACTED_AWS_KEY]',
      '   DB_URL=[REDACTED_CONNECTION_STRING]',
    ],
    rootCause:
      'Async race condition: iframe takes >30s to mount when Stripe sandbox API latency spikes during CI test concurrency.',
    fix: 'Increase test timeout or stub 3DS modal using Playwright route mock.',
    localCmd: 'npx playwright test tests/checkout.spec.ts --headed',
  });

  const diagnoseMutation = useAdhocDiagnoseMutation();

  const handleSelectPreset = (key: string) => {
    setActivePresetKey(key);
    const p = PRESETS[key];
    setDemoLog(p.rawLog);
    runDemoAnalysis(p.rawLog, p.jobName, p.stepName, p.modifiedFiles);
  };

  const runDemoAnalysis = async (
    rawText: string,
    job = 'CI Test',
    step = 'test',
    files: string[] = []
  ) => {
    setIsAnalyzing(true);
    try {
      const resp = await diagnoseMutation.mutateAsync({
        rawLog: rawText,
        jobName: job,
        stepName: step,
        modifiedFiles: files,
      });

      setDemoResult({
        signature: resp.signatureHash,
        flakiness: resp.flakinessScore,
        cleanedLines: resp.diagnosis?.relevant_log_lines?.length
          ? resp.diagnosis.relevant_log_lines.map((l) => `L${l.line_number}: ${l.content}`)
          : [
              'Error: Failure in ' + step,
              'AWS_SECRET_ACCESS_KEY=[REDACTED_KEY]',
              'Extracted high-signal lines from runner output',
            ],
        rootCause: resp.diagnosis?.root_cause_clues || 'Correlated failure in step execution.',
        fix: resp.diagnosis?.recommended_next_checks?.join(' ') || 'Run verbose test suite locally.',
        localCmd: resp.diagnosis?.recommended_next_checks?.[0] || 'npx vitest run',
      });
    } catch {
      // Offline fallback
      const isOOM = rawText.includes('137') || rawText.includes('out of memory');
      const isJest = rawText.includes('FAIL') || rawText.includes('AssertionError');

      if (isOOM) {
        setDemoResult({
          signature: 'sha256:4b91ac039e128bb9c011e03a98f12d8a01124f9c',
          flakiness: 15.0,
          cleanedLines: [
            'FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory',
            ' 1: 0xb09c10 node::Abort() [node]',
            'Process exited with code 137',
          ],
          rootCause: 'Node.js V8 heap limit exceeded (2048 MB) during asset bundling.',
          fix: 'Increase V8 max old space size: NODE_OPTIONS="--max-old-space-size=4096"',
          localCmd: 'NODE_OPTIONS="--max-old-space-size=4096" npm run build',
        });
      } else if (isJest) {
        setDemoResult({
          signature: 'sha256:a0a1294bfeabba4d588cf9a954aab2232b32cebf',
          flakiness: 2.0,
          cleanedLines: [
            'FAIL  src/auth/jwt-verifier.spec.ts > Authentication Service',
            'AssertionError: expected "active" to deeply equal "revoked"',
            '- Expected: "revoked"',
            '+ Received: "active"',
          ],
          rootCause:
            'Assertion mismatch: test expects token status to be "revoked" after expiration check.',
          fix: 'Review token revocation logic in jwt-verifier.ts.',
          localCmd: 'npx vitest run src/auth/jwt-verifier.spec.ts',
        });
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const faqs = [
    {
      q: 'Does Hopper require adding or modifying my GitHub Actions YAML files?',
      a: 'Zero YAML configuration required. Hopper installs as a native GitHub App in 60 seconds with read access to workflow runs and write access to pull request comments. It never edits your workflow files.',
    },
    {
      q: 'How does Hopper determine whether a test failure is flaky vs. a real bug?',
      a: 'Hopper computes a Bayesian flakiness score by analyzing cross-run history: same-commit retry passes (tests that pass on retry without code changes), multi-PR spread, and default-branch occurrence rates. A single run lies, but historical cross-run patterns never do.',
    },
    {
      q: 'How does Hopper protect sensitive credentials and secrets in CI logs?',
      a: 'Hopper runs a multi-pattern regex secret scrubber directly on the incoming log stream before any data is persisted or sent to an LLM. AWS access keys, GitHub tokens, Bearer tokens, PEM keys, and database connection strings are replaced with masked placeholders.',
    },
    {
      q: 'Does Hopper clone or store my private proprietary repository code?',
      a: 'Never. Hopper is built on a zero-code-retention architecture. It receives only the failed step log snippet and file change diffs over webhooks. Your source repository is never cloned, indexed, or stored on our servers.',
    },
    {
      q: 'What happens when our team exceeds the monthly diagnosed run limit?',
      a: 'On the Free tier (30 runs), runs past the limit are politely queued or skipped without disrupting your CI pipeline. On Pro and Team plans, you receive predictable burst limits and usage notifications.',
    },
    {
      q: 'Can Hopper be run completely locally or self-hosted in our own cloud?',
      a: 'Yes! Hopper includes a Docker Compose definition with PostgreSQL 16 (pgvector) and Redis 7, and a single-command orchestrator (npm run local) for complete on-premise development and deployment.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* ==================================================================== */}
      {/* 1. STICKY TOP NAVIGATION BAR */}
      {/* ==================================================================== */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-[#070b14]/85 border-b border-white/10 px-6 py-3.5 transition-all">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/25">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-wider text-white">HOPPER</span>
                <span className="text-[10px] font-mono tracking-widest text-cyan-400 bg-cyan-950/80 border border-cyan-800/50 px-1.5 py-0.5 rounded">
                  CI/CD INTELLIGENCE
                </span>
              </div>
            </div>
          </div>

          {/* Links */}
          <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-slate-300">
            <a href="#problem-solution" className="hover:text-cyan-400 transition-colors">
              Before & After
            </a>
            <a href="#interactive-demo" className="hover:text-cyan-400 transition-colors">
              Live Sandbox
            </a>
            <a href="#how-it-works" className="hover:text-cyan-400 transition-colors">
              How It Works
            </a>
            <a href="#flakiness-moat" className="hover:text-cyan-400 transition-colors">
              Flakiness Moat
            </a>
            <a href="#pricing" className="hover:text-cyan-400 transition-colors">
              Pricing
            </a>
            <a href="#faq" className="hover:text-cyan-400 transition-colors">
              FAQ
            </a>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {/* Live Gateway Pill */}
            <div
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border ${
                healthLoading
                  ? 'bg-slate-900 text-slate-400 border-slate-700'
                  : isHealthy
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50'
                  : 'bg-rose-950/40 text-rose-400 border-rose-800/50'
              }`}
            >
              <Activity className="w-3 h-3 animate-pulse" />
              <span>{isHealthy ? 'GATEWAY: HEALTHY' : 'GATEWAY: DEGRADED'}</span>
            </div>

            {/* Launch Console */}
            <button
              onClick={() => setTab('overview')}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-white/10 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>Console</span>
              <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
            </button>

            {/* User Auth or Sign In */}
            {supabaseUser ? (
              <div
                onClick={() => setTab('overview')}
                className="px-3 py-1.5 rounded-lg text-xs font-mono bg-cyan-950/60 border border-cyan-800/60 text-cyan-300 flex items-center gap-1.5 cursor-pointer"
                title={`Signed in as ${supabaseUser.email || supabaseUser.id}`}
              >
                <div className="w-4 h-4 rounded-full bg-cyan-500/30 text-cyan-200 flex items-center justify-center text-[10px] font-bold">
                  {supabaseUser.email ? supabaseUser.email[0].toUpperCase() : 'U'}
                </div>
                <span className="max-w-[100px] truncate">{supabaseUser.email?.split('@')[0] || 'User'}</span>
              </div>
            ) : (
              <button
                onClick={() => setAuthModalOpen(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-cyan-300 border border-cyan-800/40 hover:border-cyan-500/50 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
            )}

            {/* Install GitHub App */}
            <button
              onClick={() => setTab('overview')}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-md shadow-cyan-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Github className="w-3.5 h-3.5" />
              <span>Install App</span>
            </button>
          </div>
        </div>
      </header>

      {/* ==================================================================== */}
      {/* 2. HERO SECTION */}
      {/* ==================================================================== */}
      <section className="relative pt-20 pb-24 overflow-hidden border-b border-white/5">
        {/* Ambient Glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-tr from-cyan-600/15 via-blue-600/10 to-indigo-600/15 blur-[120px] pointer-events-none rounded-full" />
        <div className="absolute top-12 left-10 w-72 h-72 bg-cyan-500/5 blur-[90px] pointer-events-none rounded-full" />

        <div className="max-w-5xl mx-auto px-6 text-center relative z-10 space-y-7">
          {/* Announcement Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/50 text-cyan-300 text-xs font-mono shadow-sm">
            <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
            <span>HOPPER v1.0 • SUB-15s CI FAILURE TRIAGE & LIFECYCLE RUNNER</span>
          </div>

          {/* Master Headline */}
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-[1.12]">
            Turn 50MB CI Failure Logs into{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-300">
              Sticky PR Diagnoses
            </span>{' '}
            in Seconds.
          </h1>

          {/* Subtitle */}
          <p className="max-w-2xl mx-auto text-base sm:text-lg text-slate-300 font-normal leading-relaxed">
            Stop burning developer sprints scrolling through noisy GitHub runner logs. Hopper
            intercepts failed runs, redacts secrets, indexes deterministic SHA-256 signatures,
            quantifies Bayesian flakiness, and posts self-updating root-cause fixes on your pull requests.
          </p>

          {/* Dual CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <button
              onClick={() => setTab('overview')}
              className="px-6 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-xl shadow-cyan-500/25 transition-all flex items-center gap-2 cursor-pointer scale-100 hover:scale-[1.02]"
            >
              <Github className="w-4 h-4" />
              <span>Install GitHub App (Free)</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <a
              href="#interactive-demo"
              className="px-6 py-3.5 rounded-xl font-semibold text-sm bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-white/10 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span>Try Live Sandbox Demo</span>
            </a>

            <button
              onClick={() => setTab('overview')}
              className="px-5 py-3.5 rounded-xl font-semibold text-sm text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Launch Web Console ↗
            </button>
          </div>

          {/* Value Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-10 border-t border-white/10 max-w-4xl mx-auto text-left">
            <div className="p-4 rounded-xl bg-[#0c1220]/70 border border-white/5">
              <div className="text-2xl font-extrabold text-white font-mono">&lt; 15s</div>
              <div className="text-xs text-slate-400 mt-1">Average PR Diagnosis Time</div>
            </div>
            <div className="p-4 rounded-xl bg-[#0c1220]/70 border border-white/5">
              <div className="text-2xl font-extrabold text-cyan-400 font-mono">&lt; 50ms</div>
              <div className="text-xs text-slate-400 mt-1">Webhook Signature Verification</div>
            </div>
            <div className="p-4 rounded-xl bg-[#0c1220]/70 border border-white/5">
              <div className="text-2xl font-extrabold text-emerald-400 font-mono">100%</div>
              <div className="text-xs text-slate-400 mt-1">Zero Source Code Storage</div>
            </div>
            <div className="p-4 rounded-xl bg-[#0c1220]/70 border border-white/5">
              <div className="text-2xl font-extrabold text-indigo-400 font-mono">SHA-256</div>
              <div className="text-xs text-slate-400 mt-1">Normalized Moat Fingerprints</div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 3. BEFORE & AFTER COMPARISON */}
      {/* ==================================================================== */}
      <section id="problem-solution" className="py-20 max-w-6xl mx-auto px-6">
        <div className="text-center space-y-3 mb-12">
          <div className="text-xs font-mono font-bold tracking-wider text-cyan-400 uppercase">
            THE DEVELOPER EXPERIENCE UPGRADE
          </div>
          <h2 className="text-3xl font-extrabold text-white">
            Why CI Debugging Today Sucks — and How Hopper Fixes It
          </h2>
          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            Compare the frustrating reality of raw runner logs with Hopper’s precision sticky pull-request comment.
          </p>
        </div>

        {/* View Switcher */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex p-1 rounded-xl bg-[#0e1628] border border-white/10 text-xs font-mono">
            <button
              onClick={() => setActiveLogTab('hopper')}
              className={`px-5 py-2 rounded-lg font-semibold transition-all cursor-pointer ${
                activeLogTab === 'hopper'
                  ? 'bg-cyan-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ⚡ With Hopper (Sticky PR Comment)
            </button>
            <button
              onClick={() => setActiveLogTab('raw')}
              className={`px-5 py-2 rounded-lg font-semibold transition-all cursor-pointer ${
                activeLogTab === 'raw'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ✕ Without Hopper (50,000 Lines of Noise)
            </button>
          </div>
        </div>

        {activeLogTab === 'hopper' ? (
          /* HOPPER STICKY PR COMMENT PREVIEW */
          <div className="bg-[#0b101b] border-2 border-cyan-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-cyan-500/10">
            {/* PR Sticky Comment Header */}
            <div className="flex flex-wrap items-center justify-between pb-4 border-b border-white/10 gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs">
                  ⚡
                </div>
                <span className="font-bold text-sm text-white">
                  Hopper CI Failure Report — <code className="text-cyan-300">test-job (playwright)</code>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/70 border border-amber-800 text-amber-400">
                  92.5% Flaky (Passes on Retry)
                </span>
              </div>
              <span className="text-xs text-slate-500 font-mono">Sticky comment #142 • Updated 12s ago</span>
            </div>

            {/* Markdown Body */}
            <div className="mt-5 space-y-5 text-xs text-slate-300">
              {/* Summary Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 text-[11px]">
                      <th className="py-2 px-3">Commit</th>
                      <th className="py-2 px-3">Status / Assessment</th>
                      <th className="py-2 px-3">Failed Step</th>
                      <th className="py-2 px-3">GitHub Run</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-white/5">
                      <td className="py-2.5 px-3 font-bold text-cyan-300">8d2f1b4</td>
                      <td className="py-2.5 px-3">
                        <span className="text-amber-400 font-semibold">
                          🟡 Flaky Test (Async Race Condition)
                        </span>
                      </td>
                      <td className="py-2.5 px-3">npx playwright test</td>
                      <td className="py-2.5 px-3 text-cyan-400 hover:underline cursor-pointer">
                        View Log ↗
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 1. Root Cause */}
              <div>
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <span className="text-cyan-400 font-mono">1.</span> Root-Cause Clues
                </h4>
                <p className="mt-1.5 text-slate-300 leading-relaxed">
                  Timeout of 30,000ms exceeded waiting for selector <code className="bg-slate-800 px-1 py-0.5 rounded">[data-testid='3ds-challenge-frame']</code>. Correlated with commit changes to <code className="bg-slate-800 px-1 py-0.5 rounded">tests/checkout.spec.ts</code>. Same SHA passed in previous retry attempt confirming race condition.
                </p>
              </div>

              {/* 2. Sliced & Sanitized Log Snippet */}
              <div>
                <h4 className="font-bold text-white text-sm flex items-center gap-2">
                  <span className="text-cyan-400 font-mono">2.</span> High-Signal Sliced Snippet (Secrets Redacted)
                </h4>
                <pre className="mt-2 p-3.5 rounded-lg bg-[#050811] border border-white/10 font-mono text-[11px] text-slate-300 overflow-x-auto leading-relaxed">
{`L1:  1) tests/checkout.spec.ts:45:5 › Checkout Flow › 3D Secure verification modal ──
L2:     Error: Timeout of 30000ms exceeded waiting for selector "[data-testid='3ds-challenge-frame']"
L3:       at tests/checkout.spec.ts:52:19
L4:       at Frame.waitForSelector (node_modules/playwright-core/lib/client/frame.js:321:12)
L5:     AWS_SECRET_ACCESS_KEY=[REDACTED_AWS_KEY]
L6:     DB_URL=[REDACTED_CONNECTION_STRING]`}</pre>
              </div>

              {/* 3. Actionable Next Step */}
              <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-800/40">
                <div className="font-bold text-white text-xs flex items-center justify-between">
                  <span>Suggested Next Check & Local Reproduction</span>
                  <button
                    onClick={() => copyToClipboard('npx playwright test tests/checkout.spec.ts --headed')}
                    className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 cursor-pointer"
                  >
                    {copiedCmd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCmd ? 'Copied!' : 'Copy Command'}</span>
                  </button>
                </div>
                <code className="block mt-1 font-mono text-[11px] text-cyan-300">
                  npx playwright test tests/checkout.spec.ts --headed
                </code>
              </div>
            </div>
          </div>
        ) : (
          /* THE PAIN: RAW UNFILTERED CI LOG */
          <div className="bg-[#0b101b] border border-rose-900/40 rounded-2xl p-6 sm:p-8 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-rose-950/60 text-rose-400 text-xs font-mono">
              <span>raw-runner-output.log (48.2 MB • 54,291 lines)</span>
              <span>45 minutes spent hunting through noise</span>
            </div>
            <pre className="mt-4 p-4 rounded-lg bg-[#050811] font-mono text-[11px] text-slate-500 overflow-x-auto max-h-96 leading-relaxed">
{`\u001b[32m2026-11-06T02:14:10.491Z\u001b[0m ##[group]Operating System
Ubuntu 22.04.4 LTS
\u001b[32m2026-11-06T02:14:10.492Z\u001b[0m ##[endgroup]
\u001b[32m2026-11-06T02:14:10.493Z\u001b[0m ##[group]Virtual Environment
Included Software: apt, git, curl, docker, node...
\u001b[32m2026-11-06T02:14:10.501Z\u001b[0m ##[endgroup]
\u001b[34m[npm install]\u001b[0m added 1421 packages in 42s
\u001b[34m[npm install]\u001b[0m 87 packages are looking for funding
... [42,000 lines of npm dependency downloads and runner telemetry] ...
\u001b[31m[CRITICAL]\u001b[0m leaked token detected: AKIAIOSFODNN7EXAMPLE  <-- LEAKED UNPROTECTED!
\u001b[31m[CRITICAL]\u001b[0m postgres://root:p%40ssw0rd@10.0.4.12:5432/production_replica  <-- LEAKED!
... [8,000 lines of unrelated test outputs] ...
Error: Timeout of 30000ms exceeded waiting for selector [data-testid=3ds-challenge-frame]
    at Frame.waitForSelector (node_modules/playwright-core/lib/client/frame.js:321:12)
    at tests/checkout.spec.ts:52:19
... [4,000 more lines of runner teardown logs] ...
Process completed with exit code 1.`}</pre>
          </div>
        )}
      </section>

      {/* ==================================================================== */}
      {/* 4. LIVE INTERACTIVE DIAGNOSTIC SANDBOX */}
      {/* ==================================================================== */}
      <section id="interactive-demo" className="py-20 bg-[#060913] border-y border-white/5">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center space-y-3 mb-10">
            <div className="text-xs font-mono font-bold tracking-wider text-cyan-400 uppercase">
              INTERACTIVE DEMO
            </div>
            <h2 className="text-3xl font-extrabold text-white">
              Test the Hopper Diagnosis Engine Live
            </h2>
            <p className="text-sm text-slate-400 max-w-xl mx-auto">
              Select a preset failure scenario below or paste your own raw CI logs to watch Hopper slice, scrub, fingerprint, and diagnose in real time.
            </p>
          </div>

          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
            {Object.entries(PRESETS).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => handleSelectPreset(key)}
                className={`px-4 py-2 rounded-xl text-xs font-medium border transition-all cursor-pointer ${
                  activePresetKey === key
                    ? 'bg-cyan-950/80 text-cyan-300 border-cyan-500/60 shadow-lg shadow-cyan-500/10'
                    : 'bg-[#0e1628]/60 text-slate-400 border-white/5 hover:text-white hover:border-white/20'
                }`}
              >
                <div className="font-bold">{preset.title}</div>
                <div className="text-[10px] text-slate-400 font-mono">{preset.category}</div>
              </button>
            ))}
          </div>

          {/* Sandbox Two-Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Left: Input Log */}
            <div className="bg-[#0a0f1d] border border-white/10 rounded-2xl p-5 shadow-lg flex flex-col h-full">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <span className="font-bold text-xs text-white flex items-center gap-1.5 font-mono">
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                  RAW CI FAILURE LOG INPUT
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {demoLog.split('\n').length} lines
                </span>
              </div>

              <textarea
                value={demoLog}
                onChange={(e) => setDemoLog(e.target.value)}
                rows={12}
                className="w-full mt-3 p-3 bg-[#060913] border border-white/5 rounded-xl font-mono text-[11px] text-slate-300 focus:outline-none focus:border-cyan-500/50 resize-y"
                placeholder="Paste raw CI log here..."
              />

              <div className="mt-4 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-mono">
                  Secrets automatically masked upon ingestion
                </span>
                <button
                  onClick={() => runDemoAnalysis(demoLog)}
                  disabled={isAnalyzing}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-md shadow-cyan-500/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Play className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
                  <span>{isAnalyzing ? 'Diagnosing...' : 'Run Hopper Engine'}</span>
                </button>
              </div>
            </div>

            {/* Right: Engine Analysis Output */}
            <div className="bg-[#0a0f1d] border border-cyan-500/30 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <span className="font-bold text-xs text-cyan-300 flex items-center gap-1.5 font-mono">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    HOPPER SYNTHESIZED DIAGNOSIS
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/40">
                    Confidence: 98%
                  </span>
                </div>

                {demoResult && (
                  <div className="mt-4 space-y-4 text-xs">
                    {/* Fingerprint & Flakiness Header */}
                    <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-[#060913] border border-white/5 font-mono text-[11px]">
                      <div>
                        <div className="text-slate-500">SIGNATURE HASH:</div>
                        <div className="text-cyan-400 truncate font-bold">{demoResult.signature}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">FLAKINESS SCORE:</div>
                        <div className={`font-bold ${demoResult.flakiness > 50 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {demoResult.flakiness}% {demoResult.flakiness > 50 ? '(Flaky)' : '(Deterministic)'}
                        </div>
                      </div>
                    </div>

                    {/* Root Cause */}
                    <div>
                      <div className="font-bold text-slate-300 font-mono text-[11px]">ROOT CAUSE EXPLANATION:</div>
                      <p className="mt-1 text-slate-200 leading-relaxed bg-[#060913] p-3 rounded-xl border border-white/5">
                        {demoResult.rootCause}
                      </p>
                    </div>

                    {/* Sliced Snippet */}
                    <div>
                      <div className="font-bold text-slate-300 font-mono text-[11px]">SCRUBBED SIGNAL SLICE:</div>
                      <pre className="mt-1 p-3 rounded-xl bg-[#060913] border border-white/5 font-mono text-[11px] text-slate-300 overflow-x-auto leading-relaxed">
                        {demoResult.cleanedLines.join('\n')}
                      </pre>
                    </div>

                    {/* Recommended Command */}
                    <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-800/50">
                      <div className="flex items-center justify-between text-[11px] font-mono text-cyan-300 font-bold mb-1">
                        <span>REPRODUCE LOCALLY:</span>
                        <button
                          onClick={() => copyToClipboard(demoResult.localCmd)}
                          className="hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </button>
                      </div>
                      <code className="text-slate-200 font-mono text-[11px] block overflow-x-auto">
                        {demoResult.localCmd}
                      </code>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 mt-4 border-t border-white/5 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">Want full 30-day cross-run matrices?</span>
                <button
                  onClick={() => setTab('overview')}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <span>Open Full Dashboard</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 5. HOW IT WORKS / ARCHITECTURAL PIPELINE */}
      {/* ==================================================================== */}
      <section id="how-it-works" className="py-20 max-w-6xl mx-auto px-6">
        <div className="text-center space-y-3 mb-14">
          <div className="text-xs font-mono font-bold tracking-wider text-cyan-400 uppercase">
            UNDER THE HOOD
          </div>
          <h2 className="text-3xl font-extrabold text-white">
            The 4-Stage Hopper Diagnosis Engine
          </h2>
          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            From raw GitHub Action webhook ingress to sticky PR commentary in under 15 seconds.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
          {/* Step 1 */}
          <div className="bg-[#0b101c] border border-white/10 rounded-2xl p-6 relative flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-800/60 flex items-center justify-center font-mono font-bold text-cyan-400 text-sm mb-4">
                01
              </div>
              <h3 className="font-bold text-white text-base">Webhook Ingress</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Verifies GitHub <code className="text-cyan-300">X-Hub-Signature-256</code> with constant-time HMAC in &lt;10ms. Checks Redis tenant rate limits and enqueues on BullMQ.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-white/5 text-[11px] font-mono text-cyan-400">
              Sub-50ms HTTP Ingress
            </div>
          </div>

          {/* Step 2 */}
          <div className="bg-[#0b101c] border border-white/10 rounded-2xl p-6 relative flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-blue-950/80 border border-blue-800/60 flex items-center justify-center font-mono font-bold text-blue-400 text-sm mb-4">
                02
              </div>
              <h3 className="font-bold text-white text-base">Stream Slicer & Scrubber</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Streams log chunks up to a 300KB budget. Strips ANSI colors, timestamps, and runner noise. Scrubs AWS keys, JWTs, and connection strings.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-white/5 text-[11px] font-mono text-blue-400">
              Zero Secret Leaks
            </div>
          </div>

          {/* Step 3 */}
          <div className="bg-[#0b101c] border border-white/10 rounded-2xl p-6 relative flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-indigo-950/80 border border-indigo-800/60 flex items-center justify-center font-mono font-bold text-indigo-400 text-sm mb-4">
                03
              </div>
              <h3 className="font-bold text-white text-base">Deterministic Fingerprinting</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Masks volatile memory addresses, line numbers, and timestamps to produce a permanent SHA-256 signature indexed in PostgreSQL 16 + pgvector.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-white/5 text-[11px] font-mono text-indigo-400">
              HNSW Semantic Search
            </div>
          </div>

          {/* Step 4 */}
          <div className="bg-[#0b101c] border border-white/10 rounded-2xl p-6 relative flex flex-col justify-between">
            <div>
              <div className="w-10 h-10 rounded-xl bg-emerald-950/80 border border-emerald-800/60 flex items-center justify-center font-mono font-bold text-emerald-400 text-sm mb-4">
                04
              </div>
              <h3 className="font-bold text-white text-base">Bayesian Moat & PR Report</h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Calculates flakiness score across retries and branches. Posts or updates a single sticky comment on the PR without spamming inbox notifications.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-white/5 text-[11px] font-mono text-emerald-400">
              Single Sticky Comment
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 6. THE FLAKINESS MOAT SHOWCASE */}
      {/* ==================================================================== */}
      <section id="flakiness-moat" className="py-20 bg-[#060913] border-y border-white/5">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div className="space-y-5">
              <div className="text-xs font-mono font-bold tracking-wider text-cyan-400 uppercase">
                THE HISTORICAL MOAT
              </div>
              <h2 className="text-3xl font-extrabold text-white leading-tight">
                Why Single CI Logs Lie — But Cross-Run History Never Does
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                A single failed CI log cannot tell you whether a failure is a real regression introduced by your PR or an intermittent flake caused by an external API timeout.
              </p>
              <p className="text-sm text-slate-400 leading-relaxed">
                Hopper tracks each failure’s unique SHA-256 signature across all branches, pull requests, and retry attempts. When a build fails and then passes on a re-run with the exact same commit SHA, Hopper immediately scores it as flaky.
              </p>

              <div className="space-y-3 pt-2">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-md bg-cyan-950 text-cyan-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs text-slate-300">
                    <strong className="text-white">Same-SHA Retry Passes:</strong> If a test passes on retry without code changes, flakiness score jumps to 90%+.
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-md bg-cyan-950 text-cyan-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs text-slate-300">
                    <strong className="text-white">Cross-PR Contagion:</strong> Detect tests failing simultaneously across unrelated feature branches.
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-md bg-cyan-950 text-cyan-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs text-slate-300">
                    <strong className="text-white">Flaky Leaderboard:</strong> Automatically rank and expose the top 10 flakiest test files across your entire engineering team.
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setTab('signatures')}
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <span>Explore Signature Inspector View</span>
                  <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
                </button>
              </div>
            </div>

            {/* Visual Flaky Leaderboard Card */}
            <div className="bg-[#0b101c] border border-white/10 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white font-mono">FLAKY TEST LEADERBOARD</span>
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800/40">
                    Ranked by Frequency
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">Last 30 Days</span>
              </div>

              <div className="mt-4 space-y-3">
                {/* Item 1 */}
                <div className="p-3.5 rounded-xl bg-[#070b14] border border-white/5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-amber-400">#1 tests/checkout.spec.ts</span>
                    <span className="text-amber-400 font-bold bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/50">
                      92.5% Flaky
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate font-mono">
                    › Checkout Flow › 3D Secure verification modal timeout
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1">
                    <span>14 failures (30d)</span>
                    <span className="text-emerald-400 font-semibold">4 same-SHA retry passes</span>
                  </div>
                </div>

                {/* Item 2 */}
                <div className="p-3.5 rounded-xl bg-[#070b14] border border-white/5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-amber-400">#2 src/auth/jwt-verifier.spec.ts</span>
                    <span className="text-amber-400 font-bold bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/50">
                      78.0% Flaky
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate font-mono">
                    › Token Refresh › Intermittent clock skew assertion
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1">
                    <span>9 failures (30d)</span>
                    <span className="text-emerald-400 font-semibold">2 same-SHA retry passes</span>
                  </div>
                </div>

                {/* Item 3 */}
                <div className="p-3.5 rounded-xl bg-[#070b14] border border-white/5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-slate-300">#3 tests/api/stripe-webhook.spec.ts</span>
                    <span className="text-cyan-400 font-bold bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/50">
                      64.2% Flaky
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate font-mono">
                    › Webhook Delivery › Idempotency lock acquisition delay
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1">
                    <span>6 failures (30d)</span>
                    <span className="text-emerald-400 font-semibold">1 same-SHA retry pass</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 7. UNIFIED SDLC LIFECYCLE CLI */}
      {/* ==================================================================== */}
      <section id="cli" className="py-20 max-w-6xl mx-auto px-6">
        <div className="text-center space-y-3 mb-12">
          <div className="text-xs font-mono font-bold tracking-wider text-cyan-400 uppercase">
            DEVELOPER TOOLING & LOCAL CLI
          </div>
          <h2 className="text-3xl font-extrabold text-white">
            Built for Developers Who Live in the Terminal
          </h2>
          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            Hopper isn't just a bot. It's a complete SDLC lifecycle engine with first-class CLI commands for preflight audits, local simulations, and 8-stage lifecycle verification.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-5 rounded-2xl bg-[#0b101c] border border-white/10 font-mono text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 text-cyan-400 font-bold">
              <span>$ hopper doctor</span>
              <span className="text-slate-500 font-normal">Preflight Diagnostic</span>
            </div>
            <pre className="mt-3 text-slate-300 text-[11px] leading-relaxed">
{`🔍 Hopper System Doctor:
  - Node.js Version: v24.22.1
  - Platform:        linux (x64)
  - .env Config:     ✔ Found
  - SQL Migration:   ✔ Found (5 DDL files verified)
Doctor status: Ready for development & production building.`}</pre>
          </div>

          <div className="p-5 rounded-2xl bg-[#0b101c] border border-white/10 font-mono text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 text-cyan-400 font-bold">
              <span>$ npm run local</span>
              <span className="text-slate-500 font-normal">Single-Command Orchestrator</span>
            </div>
            <pre className="mt-3 text-slate-300 text-[11px] leading-relaxed">
{`[1/9] Checking prerequisites & lockfile... [OK]
[2/9] Inspecting process conflicts......... [OK]
[3/9] PostgreSQL (5432) & Redis (6379).... [OK]
[4/9] Hopper Backend API (3000)........... [OK]
[5/9] Durable queue worker (postgres)...... [OK]
[6/9] Frontend SPA (5173)................. [OK]
[7/9] PostgreSQL + pgvector................. [OK]
Webhook: http://localhost:3000/api/webhooks/github`}</pre>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 8. TRANSPARENT PRICING GRID */}
      {/* ==================================================================== */}
      <section id="pricing" className="py-20 bg-[#060913] border-y border-white/5">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center space-y-3 mb-14">
            <div className="text-xs font-mono font-bold tracking-wider text-cyan-400 uppercase">
              PLANS & PRICING
            </div>
            <h2 className="text-3xl font-extrabold text-white">
              Simple, Predictable CI Intelligence
            </h2>
            <p className="text-sm text-slate-400 max-w-xl mx-auto">
              Choose the right plan for your team. Start free on open-source repositories and upgrade as your CI pipeline scales.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Free Developer */}
            <div className="bg-[#0b101c] border border-white/10 rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-white text-base">Free Developer</h3>
                <p className="text-xs text-slate-400 mt-1 min-h-[32px]">
                  For open-source builders and solo developers getting started.
                </p>
                <div className="text-3xl font-extrabold text-white font-mono mt-4">
                  $0 <span className="text-xs font-normal text-slate-400">/ month</span>
                </div>

                <ul className="mt-6 space-y-2.5 text-xs text-slate-300 font-mono">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>30 diagnosed runs / mo</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>24-hour failure history</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Sticky PR Comments</span>
                  </li>
                  <li className="flex items-center gap-2 text-slate-600 line-through">
                    <span>✕</span> 30-day cross-run matrix
                  </li>
                  <li className="flex items-center gap-2 text-slate-600 line-through">
                    <span>✕</span> Slack & Discord triage alerts
                  </li>
                </ul>
              </div>

              <button
                onClick={() => {
                  setPlanTier('free');
                  setTab('overview');
                }}
                className="w-full mt-6 py-2.5 rounded-xl text-xs font-mono font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/5 transition-colors cursor-pointer"
              >
                Get Started Free
              </button>
            </div>

            {/* Pro Dev (Featured) */}
            <div className="bg-gradient-to-b from-[#131b2f] to-[#0b101c] border-2 border-cyan-500 rounded-2xl p-6 flex flex-col justify-between shadow-2xl shadow-cyan-500/15 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 text-[10px] font-mono font-bold text-white uppercase shadow-md">
                Most Popular
              </div>

              <div>
                <div className="flex items-center gap-1.5 font-bold text-white text-base">
                  <span>Solo / Pro Dev</span>
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                </div>
                <p className="text-xs text-slate-400 mt-1 min-h-[32px]">
                  For engineers shipping production pull requests daily.
                </p>
                <div className="text-3xl font-extrabold text-white font-mono mt-4">
                  $9 <span className="text-xs font-normal text-slate-400">/ month</span>
                </div>

                <ul className="mt-6 space-y-2.5 text-xs text-slate-300 font-mono">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="text-white font-semibold">250 diagnosed runs / mo</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>30-day historical timeline</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Unlimited Flaky Leaderboard</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span>Code diff correlation</span>
                  </li>
                  <li className="flex items-center gap-2 text-slate-600 line-through">
                    <span>✕</span> Slack & Discord triage alerts
                  </li>
                </ul>
              </div>

              <button
                onClick={() => {
                  setPlanTier('pro_dev');
                  setTab('billing');
                }}
                className="w-full mt-6 py-2.5 rounded-xl text-xs font-mono font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
              >
                Upgrade to Pro ($9/mo)
              </button>
            </div>

            {/* Small Team */}
            <div className="bg-[#0b101c] border border-white/10 rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-white text-base">Small Team</h3>
                <p className="text-xs text-slate-400 mt-1 min-h-[32px]">
                  For engineering teams scaling fast with high-frequency CI.
                </p>
                <div className="text-3xl font-extrabold text-white font-mono mt-4">
                  $29 <span className="text-xs font-normal text-slate-400">/ month</span>
                </div>

                <ul className="mt-6 space-y-2.5 text-xs text-slate-300 font-mono">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-white font-semibold">1,000 diagnosed runs / mo</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Real-time Slack & Discord alerts</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Priority BullMQ worker queue</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Multi-repo organization scoping</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Unlimited team members</span>
                  </li>
                </ul>
              </div>

              <button
                onClick={() => {
                  setPlanTier('team');
                  setTab('billing');
                }}
                className="w-full mt-6 py-2.5 rounded-xl text-xs font-mono font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/5 transition-colors cursor-pointer"
              >
                Upgrade to Team ($29/mo)
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 9. SECURITY & PRIVACY */}
      {/* ==================================================================== */}
      <section className="py-20 max-w-5xl mx-auto px-6">
        <div className="text-center space-y-3 mb-12">
          <div className="text-xs font-mono font-bold tracking-wider text-cyan-400 uppercase">
            SECURITY & COMPLIANCE
          </div>
          <h2 className="text-3xl font-extrabold text-white">
            Built for Enterprise-Grade Security
          </h2>
          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            Engineered with strict zero-trust boundaries to ensure your intellectual property and secrets remain safe.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-[#0b101c] border border-white/10 space-y-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-950 text-cyan-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-sm">Zero Code Storage</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Hopper never clones, reads, or stores your private repository files. Only the failed step’s sliced error lines and commit diff filenames are processed.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#0b101c] border border-white/10 space-y-3">
            <div className="w-9 h-9 rounded-xl bg-blue-950 text-blue-400 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-sm">Automatic Secret Redaction</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              High-entropy tokens, AWS keys, Bearer tokens, PEM certificates, and database URLs are sanitized before logs touch storage or external LLMs.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#0b101c] border border-white/10 space-y-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-950 text-emerald-400 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-white text-sm">Multi-Tenant Isolation</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Strict organization partitioning in PostgreSQL and Redis ensures that no team ever has access to another tenant's signatures or metrics.
            </p>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 10. FREQUENTLY ASKED QUESTIONS */}
      {/* ==================================================================== */}
      <section id="faq" className="py-20 bg-[#060913] border-t border-white/5">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center space-y-3 mb-12">
            <div className="text-xs font-mono font-bold tracking-wider text-cyan-400 uppercase">
              HAVE QUESTIONS?
            </div>
            <h2 className="text-3xl font-extrabold text-white">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-white/10 bg-[#0b101c] overflow-hidden transition-colors"
                >
                  <button
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full px-5 py-4 text-left flex items-center justify-between text-sm font-semibold text-white hover:text-cyan-300 transition-colors cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-cyan-400 shrink-0 ml-2" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 text-xs text-slate-400 leading-relaxed border-t border-white/5 pt-3">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* 11. FINAL CTA & FOOTER */}
      {/* ==================================================================== */}
      <section className="py-20 border-t border-white/10 text-center relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-6 space-y-6 relative z-10">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
            Stop Burning Sprint Cycles on Flaky CI Failures.
          </h2>
          <p className="text-sm text-slate-400 max-w-lg mx-auto">
            Install Hopper in 60 seconds. Zero YAML configuration. Your developers will thank you on their very next pull request.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <button
              onClick={() => setTab('overview')}
              className="px-6 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-xl shadow-cyan-500/25 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Github className="w-4 h-4" />
              <span>Install GitHub App (Free)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTab('overview')}
              className="px-6 py-3.5 rounded-xl font-semibold text-sm bg-slate-900 hover:bg-slate-800 text-slate-200 border border-white/10 transition-colors cursor-pointer"
            >
              Launch Web Console ↗
            </button>
          </div>
        </div>
      </section>

      <footer className="py-8 border-t border-white/5 text-center text-xs text-slate-500 font-mono space-y-2">
        <div>
          Hopper CI/CD Failure Diagnosis Engine &bull; Named after Rear Admiral Grace Hopper &bull; Apache-2.0
        </div>
        <div className="italic text-slate-400">
          "A ship in port is safe, but that is not what ships are built for."
        </div>
      </footer>
    </div>
  );
};
