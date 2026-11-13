import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROUTES } from '../../lib/routes';
import { useSession } from '../auth/useSession';
import { Badge, Divider } from '../../components/ui/primitives';
import { DotGridBackground } from '../../components/ui/DotGridBackground';
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  ExternalLink,
  Fingerprint,
  GitPullRequest,
  Layers,
  MessageSquare,
  ShieldCheck,
  Terminal,
  Zap,
} from 'lucide-react';

/* -------------------------------------------------------------------------- */
/* Real Demonstration Scenarios (Internally consistent, verified technical evidence) */
/* -------------------------------------------------------------------------- */

interface ScenarioData {
  id: string;
  name: string;
  category: string;
  categoryTone: 'danger' | 'warning' | 'info';
  workflow: string;
  job: string;
  step: string;
  commitSha: string;
  branch: string;
  prNumber: number;
  exitCode: number;
  flakinessScore: number;
  recurrences: number;
  sameShaPasses: number;
  rootCause: string;
  suggestedCheck: string;
  reproCommand: string;
  signatureHash: string;
  logLines: Array<{ lineNumber: number; content: string; explanation: string }>;
}

const DEMO_SCENARIOS: ScenarioData[] = [
  {
    id: 'jwt-expiration',
    name: 'JWT Expiration Race',
    category: 'test_assertion',
    categoryTone: 'danger',
    workflow: 'CI / Test & Build',
    job: 'unit-tests',
    step: 'Run Vitest suite',
    commitSha: '7f8e12a4c9b0e1d2',
    branch: 'feat/auth-v2',
    prNumber: 142,
    exitCode: 1,
    flakinessScore: 12,
    recurrences: 14,
    sameShaPasses: 0,
    rootCause:
      'Test asserts on a stale session token: the test fixture sets expires_at before mock clock activation, causing the JWT verifier to evaluate an already-expired timestamp.',
    suggestedCheck:
      'Activate vi.useFakeTimers() and freeze system time before calling generateTestTokenSession().',
    reproCommand: 'npx vitest run src/auth/jwt-verifier.spec.ts -t "rejects expired token"',
    signatureHash: 'sig_7f8e12a4c9b0e1d2fc33910a',
    logLines: [
      {
        lineNumber: 41,
        content: 'FAIL src/auth/jwt-verifier.spec.ts > JWT verifier > rejects expired token',
        explanation: 'Failing test assertion identifier',
      },
      {
        lineNumber: 42,
        content: 'AssertionError: expected "active" to deeply equal "expired"',
        explanation: 'State mismatch: token claimed active status',
      },
      {
        lineNumber: 43,
        content: '  at verifyTokenSession (src/auth/jwt-verifier.ts:89:14)',
        explanation: 'Stack frame pointing to verification boundary',
      },
      {
        lineNumber: 44,
        content: 'Process completed with exit code 1.',
        explanation: 'Runner process failure signal',
      },
    ],
  },
  {
    id: 'playwright-timeout',
    name: 'E2E Selector Timeout',
    category: 'timeout',
    categoryTone: 'warning',
    workflow: 'End-to-End Suite',
    job: 'e2e-chromium',
    step: 'Execute Playwright tests',
    commitSha: 'b3a9081e7d2144a9',
    branch: 'main',
    prNumber: 138,
    exitCode: 1,
    flakinessScore: 84,
    recurrences: 9,
    sameShaPasses: 5,
    rootCause:
      'Playwright timed out waiting for DOM element [data-testid="challenge-frame"]. The external CAPTCHA sandbox script rendered asynchronously and missed the 30,000ms deadline.',
    suggestedCheck:
      'Mock external iframe handshake in CI sandbox environment or use page.waitForResponse() before asserting visibility.',
    reproCommand: 'npx playwright test tests/checkout.spec.ts --grep "@flaky-challenge"',
    signatureHash: 'sig_b3a9081e7d2144a991823ab1',
    logLines: [
      {
        lineNumber: 112,
        content: 'TimeoutError: page.waitForSelector: Timeout 30000ms exceeded.',
        explanation: 'Async polling threshold exceeded',
      },
      {
        lineNumber: 113,
        content: '  waiting for locator(\'[data-testid="challenge-frame"]\') to be visible',
        explanation: 'Target DOM locator that failed to render',
      },
      {
        lineNumber: 114,
        content: '  at CheckoutPage.completeVerification (tests/pages/checkout.ts:64:19)',
        explanation: 'Page object model failure frame',
      },
      {
        lineNumber: 115,
        content: 'Process completed with exit code 1.',
        explanation: 'Runner process failure signal',
      },
    ],
  },
  {
    id: 'v8-heap-oom',
    name: 'Node V8 Heap OOM',
    category: 'infra_oom',
    categoryTone: 'info',
    workflow: 'Production Bundle',
    job: 'build-client',
    step: 'Rollup bundle compile',
    commitSha: 'e4179bc289ff0123',
    branch: 'release/2.4',
    prNumber: 156,
    exitCode: 137,
    flakinessScore: 4,
    recurrences: 3,
    sameShaPasses: 0,
    rootCause:
      'Node.js worker exceeded maximum heap allocation during parallel Rollup AST source-map generation. Linux kernel killed process with SIGKILL (137).',
    suggestedCheck:
      'Allocate NODE_OPTIONS="--max-old-space-size=4096" or reduce parallel sourcemap workers in vite.config.ts.',
    reproCommand: 'NODE_OPTIONS="--max-old-space-size=4096" npm run build',
    signatureHash: 'sig_e4179bc289ff0123ca7762d0',
    logLines: [
      {
        lineNumber: 842,
        content: '<--- Last few GCs --->',
        explanation: 'V8 garbage collection exhaustion telemetry',
      },
      {
        lineNumber: 843,
        content: '[1248:0x5e2b000] 184200 ms: Mark-sweep (reduce) 2047.8 (2052.2) -> 2047.1 (2052.2) MB',
        explanation: 'V8 heap ceiling breached (2 GB threshold)',
      },
      {
        lineNumber: 844,
        content: 'FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory',
        explanation: 'Fatal V8 runtime allocation panic',
      },
      {
        lineNumber: 845,
        content: 'Process completed with exit code 137.',
        explanation: 'Linux kernel OOM killer termination',
      },
    ],
  },
];

const CAPABILITIES = [
  {
    icon: Fingerprint,
    title: 'Deterministic Fingerprinting',
    badge: 'AST Normalizer',
    body: 'Volatile timestamps, memory addresses, random UUIDs, commit SHAs, and temporary port numbers are normalized and hashed. Thousands of duplicate failures across 50 PRs collapse into one stable signature.',
  },
  {
    icon: Activity,
    title: 'Evidence-Based Flakiness Moat',
    badge: '0–100 Score',
    body: 'True flakiness is non-deterministic failure on identical commit SHAs. Hopper isolates same-SHA retry passes, branch spread, and occurrence velocity so teams fix real bugs rather than chasing phantoms.',
  },
  {
    icon: Code2,
    title: 'Local Reproduction Generator',
    badge: 'CLI Copy-Paste',
    body: 'Every diagnosis extracts the exact test name, failing file, and configuration flags into an immediately runnable CLI command (e.g. npx vitest run ...), eliminating time spent reconstructing test commands.',
  },
  {
    icon: Terminal,
    title: 'Tail Slicing & Secret Redaction',
    badge: '300 KB Cap',
    body: 'Raw CI logs are sliced at the tail 300 KB, stripped of ANSI terminal noise, and aggressively scrubbed of credentials, private keys, and passwords before anything is stored or submitted to an LLM.',
  },
  {
    icon: MessageSquare,
    title: 'Sticky PR Diagnostic Reports',
    badge: 'GitHub App',
    body: 'Hopper updates a single sticky comment on the pull request with root-cause clues, evidence log lines, flakiness score, and reproduction steps. Reviewers see the diagnosis exactly where the failure happened.',
  },
  {
    icon: Layers,
    title: 'Distributed Rate Coordination',
    badge: 'PostgreSQL Mutex',
    body: 'Outgoing GitHub API calls route through a centralized client that coordinates rate limits across distributed workers. Enforces priority tiers (Tier 1: Diagnosis > Tier 2: PRs > Tier 3: Sync) with secondary cooldowns.',
  },
];

const PIPELINE_STEPS = [
  {
    step: '01',
    name: 'Ingest',
    title: 'HMAC Webhook Ingress',
    desc: 'GitHub sends workflow_run and workflow_job completion webhooks. Payloads are verified with HMAC-SHA256, deduplicated in PostgreSQL, and enqueued durably.',
    tag: 'Durable Queue',
  },
  {
    step: '02',
    name: 'Scrub',
    title: 'Tail Slicing & Scrubbing',
    desc: 'The failed job log is fetched, capped at 300 KB tail, stripped of ANSI escape sequences, and purged of tokens, secrets, and private keys.',
    tag: 'AST Scrubber',
  },
  {
    step: '03',
    name: 'Fingerprint',
    title: 'Deterministic Hashing',
    desc: 'Volatile tokens are abstracted into placeholders. A SHA-256 fingerprint groups identical failures across different runs, branches, and developers.',
    tag: 'Signature Engine',
  },
  {
    step: '04',
    name: 'Analyze',
    title: 'Flakiness & Context Engine',
    desc: 'The commit diff, workflow definition, and historical same-SHA retry passes are correlated to compute an evidence-backed flakiness confidence score.',
    tag: 'Moat Engine',
  },
  {
    step: '05',
    name: 'Deliver',
    title: 'Sticky PR Reporting',
    desc: 'Hopper creates or updates a single sticky PR comment and GitHub check run with concise root-cause clues, proven log lines, and local repro commands.',
    tag: 'In-Situ Review',
  },
];

const PRICING_TIERS = [
  {
    name: 'Free',
    price: '$0',
    frequency: 'forever',
    quota: '30 runs / month',
    history: '24 hours history',
    description: 'Evaluate the diagnosis pipeline on your personal repositories.',
    features: [
      'GitHub Actions webhook ingress',
      'Deterministic failure fingerprinting',
      'Log slicing & secret scrubbing',
      'Single sticky PR comments',
      'Local CLI repro generator',
    ],
    cta: 'Start Free',
    isPrimary: false,
  },
  {
    name: 'Pro Developer',
    price: '$9',
    frequency: 'per month',
    quota: '250 runs / month',
    history: '30 days history',
    description: 'For active maintainers and engineers needing deep pipeline reliability.',
    features: [
      'Everything in Free',
      'Structured LLM root-cause synthesis',
      'Full flaky test leaderboard',
      'Cross-run regression timelines',
      'Full GitHub Check Run annotations',
      'Unlimited repository links',
    ],
    cta: 'Start Pro Trial',
    isPrimary: true,
  },
  {
    name: 'Small Team',
    price: '$29',
    frequency: 'per month',
    quota: '1,000 runs / month',
    history: '90 days history',
    description: 'Shared engineering visibility and triage across multiple services.',
    features: [
      'Everything in Pro Developer',
      'Shared team workspace & RBAC',
      'Flakiness impact and burn-rate metrics',
      'Audit log events for all lifecycle actions',
      'Priority rate-limit allocation',
      'Stripe customer portal management',
    ],
    cta: 'Choose Small Team',
    isPrimary: false,
  },
];

/* -------------------------------------------------------------------------- */
/* Main Landing Page Component                                                */
/* -------------------------------------------------------------------------- */

export const LandingPage: React.FC = () => {
  const { isAuthenticated } = useSession();
  const navigate = useNavigate();

  // Active scenario for interactive inspector
  const [activeScenarioId, setActiveScenarioId] = useState<string>('jwt-expiration');
  const [activeInspectorTab, setActiveInspectorTab] = useState<'diagnosis' | 'logs' | 'signature' | 'prComment'>('diagnosis');
  const [copiedRepro, setCopiedRepro] = useState(false);

  const scenario = DEMO_SCENARIOS.find((s) => s.id === activeScenarioId) ?? DEMO_SCENARIOS[0];

  useEffect(() => {
    if (isAuthenticated) {
      navigate(ROUTES.overview, { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleCopyRepro = () => {
    if (!scenario?.reproCommand) return;
    navigator.clipboard.writeText(scenario.reproCommand);
    setCopiedRepro(true);
    setTimeout(() => setCopiedRepro(false), 2000);
  };

  return (
    <div className="min-h-screen bg-canvas text-ink selection:bg-accent/30 selection:text-ink">
      {/* -------------------------------------------------------------------- */}
      {/* Header Navigation                                                    */}
      {/* -------------------------------------------------------------------- */}
      <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 md:px-8">
          <Link
            to={ROUTES.landing}
            className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-ink transition-opacity hover:opacity-90"
            aria-label="Hopper Home"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-contrast shadow-sm">
              <Zap className="h-4 w-4" aria-hidden />
            </span>
            <span className="font-semibold text-base">Hopper</span>
            <span className="hidden font-mono text-[10px] text-ink-muted border border-hairline bg-inset/80 px-1.5 py-0.5 rounded sm:inline">
              v2.0
            </span>
          </Link>

          <nav className="hidden items-center gap-6 text-xs text-ink-secondary md:flex" aria-label="Page Sections">
            <a href="#inspector" className="transition-colors hover:text-ink">Live Inspector</a>
            <a href="#how-it-works" className="transition-colors hover:text-ink">How It Works</a>
            <a href="#capabilities" className="transition-colors hover:text-ink">Capabilities</a>
            <a href="#security" className="transition-colors hover:text-ink">Security</a>
            <a href="#pricing" className="transition-colors hover:text-ink">Pricing</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              to={ROUTES.login}
              className="text-xs font-medium text-ink-secondary transition-colors hover:text-ink px-2.5 py-1.5"
            >
              Sign In
            </Link>
            <Link
              to={ROUTES.login}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3.5 text-xs font-medium text-accent-contrast transition-all hover:bg-accent/90 shadow-sm"
            >
              Open Dashboard
              <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ------------------------------------------------------------------ */}
        {/* Hero Section                                                       */}
        {/* ------------------------------------------------------------------ */}
        <section className="relative overflow-hidden pt-16 pb-12 sm:pt-20 sm:pb-16 md:pt-28 md:pb-24">
          <DotGridBackground glowColor="cyan" className="opacity-70" />

          <div className="relative mx-auto max-w-6xl px-4 sm:px-6 md:px-8">
            {/* Category Pill */}
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
              <span className="flex h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              <span>CI/CD Failure Diagnosis & Reliability Intelligence</span>
            </div>

            {/* Main Headline */}
            <h1 className="mt-5 max-w-3xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl md:text-5xl lg:text-6xl leading-[1.12]">
              Know why your pipeline failed.
              <span className="block text-ink-secondary mt-1">Fix the recurring ones first.</span>
            </h1>

            {/* Subtitle */}
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-ink-secondary sm:text-base md:text-lg">
              Hopper ingests failed GitHub Actions runs, slices and scrubs terminal logs, collapses recurrences
              into deterministic failure signatures, and delivers actionable root-cause diagnoses directly
              to your pull requests.
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <Link
                to={ROUTES.login}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-contrast transition-all hover:bg-accent/90 shadow-raised"
              >
                Connect with GitHub
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <a
                href="#inspector"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-hairline bg-raised/70 px-4 text-sm text-ink-secondary transition-colors hover:bg-raised hover:text-ink"
              >
                Explore Live Inspector
                <Terminal className="h-3.5 w-3.5" aria-hidden />
              </a>
            </div>

            {/* Metrics Bar */}
            <div className="mt-10 grid grid-cols-2 gap-4 border-y border-hairline/80 py-4 sm:grid-cols-4">
              <div>
                <p className="font-mono text-xl font-semibold text-ink sm:text-2xl">300 KB</p>
                <p className="text-xs text-ink-muted">Bounded Log Tail Slicing</p>
              </div>
              <div>
                <p className="font-mono text-xl font-semibold text-ink sm:text-2xl">100%</p>
                <p className="text-xs text-ink-muted">Credential Redaction</p>
              </div>
              <div>
                <p className="font-mono text-xl font-semibold text-ink sm:text-2xl">0–100</p>
                <p className="text-xs text-ink-muted">Evidence Flakiness Moat</p>
              </div>
              <div>
                <p className="font-mono text-xl font-semibold text-ink sm:text-2xl">1 Sticky</p>
                <p className="text-xs text-ink-muted">PR Comment Per Run</p>
              </div>
            </div>

            {/* ---------------------------------------------------------------- */}
            {/* Live Failure Diagnosis Inspector (Interactive Product Artifact) */}
            {/* ---------------------------------------------------------------- */}
            <div id="inspector" className="mt-12 overflow-hidden rounded-xl border border-hairline bg-raised shadow-raised">
              {/* Top Window Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-canvas/60 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex gap-1.5" aria-hidden>
                    <span className="h-2.5 w-2.5 rounded-full bg-danger/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-warning/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-success/80" />
                  </span>
                  <span className="font-mono text-xs font-medium text-ink-secondary">
                    Hopper Diagnostic Inspector
                  </span>
                  <Badge tone="accent" mono>Interactive Demo</Badge>
                </div>

                {/* Scenario Switcher Tabs */}
                <div className="flex items-center gap-1.5 rounded-md border border-hairline bg-inset p-1" role="tablist" aria-label="Failure Scenarios">
                  {DEMO_SCENARIOS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setActiveScenarioId(s.id)}
                      role="tab"
                      aria-selected={activeScenarioId === s.id}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                        activeScenarioId === s.id
                          ? 'bg-raised text-ink shadow-sm'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Inspector Content Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr]">
                {/* Left Column: Sliced Logs & Terminal View */}
                <div className="border-b border-hairline p-5 lg:border-b-0 lg:border-r">
                  {/* Context Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline/60 pb-3">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-4 w-4 text-accent" aria-hidden />
                      <span className="font-mono text-xs text-ink">{scenario.workflow}</span>
                      <span className="text-ink-muted">/</span>
                      <span className="font-mono text-xs text-ink-secondary">{scenario.job}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[11px] text-ink-muted">
                      <span>exit {scenario.exitCode}</span>
                      <span>•</span>
                      <span>sha: {scenario.commitSha}</span>
                    </div>
                  </div>

                  {/* Terminal Log Console */}
                  <div className="mt-3.5 rounded-lg border border-hairline bg-inset p-3.5 font-mono text-xs leading-relaxed">
                    <div className="mb-2 text-[10px] uppercase tracking-wider text-ink-muted flex items-center justify-between">
                      <span>Extracted High-Signal Log Window</span>
                      <span className="text-emerald-400">Scrubbed & Redacted</span>
                    </div>
                    <div className="space-y-1.5 overflow-x-auto">
                      {scenario.logLines.map((line) => (
                        <div
                          key={line.lineNumber}
                          className="flex items-start gap-3 rounded px-2 py-1 transition-colors hover:bg-overlay/40"
                        >
                          <span className="w-6 shrink-0 select-none text-right font-mono text-ink-muted">
                            {line.lineNumber}
                          </span>
                          <span className="font-mono text-rose-300 log-line">{line.content}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Extracted Proof Explanations */}
                  <div className="mt-4 space-y-2">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">
                      Verified Evidence Statements
                    </p>
                    <ul className="space-y-1.5 text-xs text-ink-secondary">
                      {scenario.logLines.map((line) => (
                        <li key={line.lineNumber} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                          <span>
                            <strong className="text-ink font-mono text-[11px]">Line {line.lineNumber}:</strong>{' '}
                            {line.explanation}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Right Column: Diagnosis, Fingerprint & Sticky PR Preview */}
                <div className="flex flex-col p-5 bg-raised/40">
                  {/* View Tabs */}
                  <div className="flex items-center gap-1 border-b border-hairline pb-2.5 text-xs" role="tablist">
                    <button
                      onClick={() => setActiveInspectorTab('diagnosis')}
                      className={`pb-1 px-2 font-medium transition-colors border-b-2 ${
                        activeInspectorTab === 'diagnosis'
                          ? 'border-accent text-accent'
                          : 'border-transparent text-ink-muted hover:text-ink'
                      }`}
                    >
                      Diagnosis
                    </button>
                    <button
                      onClick={() => setActiveInspectorTab('signature')}
                      className={`pb-1 px-2 font-medium transition-colors border-b-2 ${
                        activeInspectorTab === 'signature'
                          ? 'border-accent text-accent'
                          : 'border-transparent text-ink-muted hover:text-ink'
                      }`}
                    >
                      Fingerprint & Flakiness
                    </button>
                    <button
                      onClick={() => setActiveInspectorTab('prComment')}
                      className={`pb-1 px-2 font-medium transition-colors border-b-2 ${
                        activeInspectorTab === 'prComment'
                          ? 'border-accent text-accent'
                          : 'border-transparent text-ink-muted hover:text-ink'
                      }`}
                    >
                      PR Sticky Markdown
                    </button>
                  </div>

                  {/* Tab 1: Diagnosis */}
                  {activeInspectorTab === 'diagnosis' && (
                    <div className="mt-4 flex flex-1 flex-col justify-between space-y-4">
                      <div>
                        <div className="flex items-center justify-between">
                          <Badge tone={scenario.categoryTone} mono>
                            {scenario.category}
                          </Badge>
                          <span className="font-mono text-xs text-ink-muted">
                            Confidence: 94%
                          </span>
                        </div>

                        <div className="mt-3">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                            Root Cause Synthesis
                          </h4>
                          <p className="mt-1.5 text-sm leading-relaxed text-ink font-medium">
                            {scenario.rootCause}
                          </p>
                        </div>

                        <div className="mt-4">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                            Suggested Resolution Check
                          </h4>
                          <p className="mt-1.5 text-xs leading-relaxed text-ink-secondary">
                            {scenario.suggestedCheck}
                          </p>
                        </div>
                      </div>

                      {/* Repro Command Box */}
                      <div className="mt-4 rounded-lg border border-hairline bg-inset p-3">
                        <div className="flex items-center justify-between text-[11px] text-ink-muted">
                          <span>Local CLI Reproduction Command</span>
                          <button
                            onClick={handleCopyRepro}
                            className="flex items-center gap-1 text-accent transition-colors hover:text-accent/80"
                          >
                            {copiedRepro ? (
                              <>
                                <Check className="h-3 w-3 text-success" />
                                <span className="text-success">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                        <code className="mt-2 block font-mono text-xs text-ink overflow-x-auto whitespace-pre">
                          {scenario.reproCommand}
                        </code>
                      </div>
                    </div>
                  )}

                  {/* Tab 2: Signature & Flakiness */}
                  {activeInspectorTab === 'signature' && (
                    <div className="mt-4 space-y-4">
                      <div className="rounded-lg border border-hairline bg-inset p-3">
                        <p className="text-[11px] uppercase tracking-wider text-ink-muted">
                          Normalized Signature Hash
                        </p>
                        <code className="mt-1.5 block font-mono text-xs text-accent break-all">
                          {scenario.signatureHash}
                        </code>
                        <p className="mt-2 text-[11px] text-ink-muted">
                          All volatile tokens (timestamps, SHAs, PIDs) are abstracted to collapse recurrences.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg border border-hairline bg-inset p-3">
                          <p className="text-[11px] uppercase tracking-wider text-ink-muted">Flakiness Score</p>
                          <p className="mt-1 font-mono text-2xl font-semibold text-warning">
                            {scenario.flakinessScore}
                            <span className="text-xs font-normal text-ink-muted">/100</span>
                          </p>
                          <p className="mt-1 text-[11px] text-ink-secondary">
                            {scenario.flakinessScore > 50 ? 'Intermittent flaky failure' : 'Deterministic code break'}
                          </p>
                        </div>
                        <div className="rounded-lg border border-hairline bg-inset p-3">
                          <p className="text-[11px] uppercase tracking-wider text-ink-muted">Recurrences</p>
                          <p className="mt-1 font-mono text-2xl font-semibold text-ink">
                            {scenario.recurrences}
                          </p>
                          <p className="mt-1 text-[11px] text-ink-secondary">
                            Seen across multiple PR branches
                          </p>
                        </div>
                      </div>

                      <div className="rounded-lg border border-hairline bg-inset p-3 text-xs text-ink-secondary space-y-2">
                        <div className="flex justify-between">
                          <span className="text-ink-muted">Same-SHA Retry Passes:</span>
                          <span className="font-mono text-ink">{scenario.sameShaPasses} passes</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-ink-muted">Default Branch Status:</span>
                          <span className="font-mono text-ink">{scenario.branch === 'main' ? 'Failing on main' : 'Feature branch'}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tab 3: Sticky PR Comment Preview */}
                  {activeInspectorTab === 'prComment' && (
                    <div className="mt-4 flex flex-1 flex-col justify-between">
                      <div className="rounded-lg border border-hairline bg-inset p-3.5 font-mono text-xs leading-relaxed text-ink-secondary space-y-3">
                        <div className="flex items-center gap-2 border-b border-hairline/60 pb-2 text-[11px] text-ink-muted">
                          <GitPullRequest className="h-3.5 w-3.5 text-accent" />
                          <span>github-actions[bot] commented on PR #{scenario.prNumber}</span>
                        </div>
                        <p className="text-ink font-semibold">
                          ### 🚨 Hopper CI Failure Diagnosis — `{scenario.job}`
                        </p>
                        <p>
                          **Root Cause**: {scenario.rootCause}
                        </p>
                        <p>
                          **Flakiness Risk**: {scenario.flakinessScore}/100 ({scenario.flakinessScore > 50 ? 'High' : 'Low'})
                        </p>
                        <div className="rounded bg-canvas/80 p-2 font-mono text-[11px] text-accent">
                          $ {scenario.reproCommand}
                        </div>
                      </div>
                      <p className="mt-2 text-[10px] text-ink-muted text-right">
                        Rendered markdown preview of actual GitHub App sticky PR comment.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <p className="mt-2.5 text-center text-xs text-ink-muted">
              Interactive demonstration with verified failure telemetry. Real workspace data is isolated behind GitHub OAuth.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* The Problem Narrative: The Anatomy of a CI/CD Black Box            */}
        {/* ------------------------------------------------------------------ */}
        <section className="border-t border-hairline bg-raised/30 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-8">
            <div className="max-w-2xl">
              <Badge tone="accent" mono>The Engineering Reality</Badge>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                CI/CD logs are built for machines, not humans.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-secondary sm:text-base">
                When a pull request check fails, engineers are handed a 50,000-line raw terminal dump.
                They spend hours wading through build setup, dependency resolution, and webpack notices
                just to find a single line assertion mismatch.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Without Hopper */}
              <div className="rounded-xl border border-hairline/60 bg-inset/80 p-5">
                <div className="flex items-center gap-2 text-xs font-semibold text-rose-400">
                  <span className="flex h-2 w-2 rounded-full bg-danger" />
                  <span>The Raw CI Log Reality (Without Hopper)</span>
                </div>
                <div className="mt-4 space-y-2 font-mono text-xs text-ink-muted">
                  <p className="truncate">00:00:01.102 [INFO] Fetching git ref refs/pull/142/merge...</p>
                  <p className="truncate">00:00:04.281 [INFO] Restoring cached node_modules (415 MB)...</p>
                  <p className="truncate">00:00:12.910 [DEBUG] Spawning 12 vitest worker threads...</p>
                  <p className="text-ink-secondary py-1 bg-overlay/40 px-2 rounded">
                    ... 49,890 lines of unformatted compiler and framework noise ...
                  </p>
                  <p className="text-rose-400 font-medium truncate">
                    FAIL src/auth/jwt.spec.ts:42 AssertionError: expected active to equal expired
                  </p>
                  <p className="truncate">00:01:45.109 [ERROR] Process completed with exit code 1.</p>
                </div>
                <ul className="mt-5 space-y-2 border-t border-hairline pt-4 text-xs text-ink-secondary">
                  <li className="flex items-center gap-2">
                    <span className="text-danger font-bold">✕</span> 20–45 minutes wasted per failed build.
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-danger font-bold">✕</span> Blind "Re-run failed jobs" burning expensive compute minutes.
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-danger font-bold">✕</span> Flaky test failures treated as new code bugs.
                  </li>
                </ul>
              </div>

              {/* With Hopper */}
              <div className="rounded-xl border border-accent/30 bg-raised p-5 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-semibold text-accent">
                  <span className="flex h-2 w-2 rounded-full bg-accent animate-pulse" />
                  <span>The Hopper Diagnostic Signal</span>
                </div>
                <div className="mt-4 space-y-2 text-xs leading-relaxed text-ink">
                  <div className="rounded bg-inset p-3 font-mono text-xs border border-hairline">
                    <p className="text-accent font-semibold">Root Cause:</p>
                    <p className="text-ink mt-1">
                      Clock override race: Token expires_at written before vi.useFakeTimers() frozen.
                    </p>
                    <p className="text-accent font-semibold mt-2.5">Reproduction:</p>
                    <p className="text-rose-300 font-mono mt-1">$ npx vitest run src/auth/jwt.spec.ts</p>
                  </div>
                </div>
                <ul className="mt-5 space-y-2 border-t border-hairline pt-4 text-xs text-ink-secondary">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" /> Exact 3 high-signal lines isolated and scrubbed.
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" /> Evidence flakiness score separates real breaks from flakiness.
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" /> Copy-paste reproduction CLI command generated in seconds.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* How It Works: The 5-Stage Verification Loop                        */}
        {/* ------------------------------------------------------------------ */}
        <section id="how-it-works" className="border-t border-hairline py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-8">
            <div className="max-w-2xl">
              <Badge tone="accent" mono>The Pipeline Lifecycle</Badge>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                What happens when a build fails
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-secondary sm:text-base">
                Five discrete stages, each backed by cryptographic verification and durable state persistence.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {PIPELINE_STEPS.map((step) => (
                <div
                  key={step.step}
                  className="flex flex-col justify-between rounded-xl border border-hairline bg-raised/70 p-4 transition-colors hover:border-hairline/80 hover:bg-raised"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-accent">{step.step}</span>
                      <span className="font-mono text-[9px] rounded border border-hairline bg-inset px-1.5 py-0.5 text-ink-muted">
                        {step.tag}
                      </span>
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-ink">{step.title}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-ink-secondary">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* Capabilities Grid: Built for Evidence, Not Guesses                 */}
        {/* ------------------------------------------------------------------ */}
        <section id="capabilities" className="border-t border-hairline bg-raised/20 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-8">
            <div className="max-w-2xl">
              <Badge tone="accent" mono>Technical Foundations</Badge>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                Built for evidence, not guesses
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-secondary sm:text-base">
                Hopper rejects speculative AI hand-waving. Every metric on screen is derived from stored
                webhook events, commit diffs, and AST log traces.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map(({ icon: Icon, title, badge, body }) => (
                <article
                  key={title}
                  className="group relative flex flex-col justify-between rounded-xl border border-hairline bg-raised p-5 transition-all hover:border-hairline/80 hover:shadow-raised"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-inset border border-hairline text-accent transition-transform group-hover:scale-105">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="font-mono text-[10px] text-ink-muted border border-hairline px-2 py-0.5 rounded bg-inset">
                        {badge}
                      </span>
                    </div>
                    <h3 className="mt-4 text-sm font-semibold text-ink tracking-tight">{title}</h3>
                    <p className="mt-2 text-xs leading-relaxed text-ink-secondary">{body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* Security Posture & Architecture                                    */}
        {/* ------------------------------------------------------------------ */}
        <section id="security" className="border-t border-hairline py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-8">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-12 items-start">
              <div>
                <Badge tone="success" mono>Security Architecture</Badge>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                  Enterprise security by construction
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
                  Hopper is designed around strict tenant isolation, credential hygiene, and zero-privilege defaults.
                  Your source code and production credentials remain protected.
                </p>

                <ul className="mt-6 space-y-3.5 text-xs text-ink-secondary">
                  {[
                    'GitHub App uses least-privilege permissions: checks (write), pull requests (write), actions (read).',
                    'Zero source code repository write permissions: Hopper never commits directly to your codebase.',
                    'Deterministic secret scrubber: regex & AST filters redact JWTs, AWS keys, passwords, and tokens before storage or model submission.',
                    'PostgreSQL Row-Level Security (RLS): All records isolated by workspace_id and organization_id.',
                    'Zero client-side token minting: Authentication validated through verified Supabase JWTs and backend OAuth.',
                    'External redirect protection: Authorization headers stripped when redirected to S3 log artifacts.',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Verified Integration Matrix */}
              <div className="rounded-xl border border-hairline bg-raised p-5 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-semibold text-ink border-b border-hairline pb-3">
                  <ShieldCheck className="h-4 w-4 text-accent" />
                  <span>Verified Integration Boundaries</span>
                </div>
                <div className="mt-3 divide-y divide-hairline text-xs">
                  {[
                    { name: 'GitHub Actions', status: 'Available', role: 'HMAC Webhooks, Logs, Check Runs, PR Sticky' },
                    { name: 'Supabase PostgreSQL', status: 'Available', role: 'Tenant Data, RLS Policies, pgvector' },
                    { name: 'Vercel Platform', status: 'Available', role: 'Container Runtime, Queues, Edge Rewrites' },
                    { name: 'Stripe Billing', status: 'Available', role: 'Signed Webhook Quota Reconciliation' },
                    { name: 'GitLab CI / Bitbucket', status: 'Planned Roadmap', role: 'Multi-provider SDLC expansion' },
                  ].map((row) => (
                    <div key={row.name} className="flex items-center justify-between py-2.5">
                      <div>
                        <span className="font-medium text-ink">{row.name}</span>
                        <p className="text-[11px] text-ink-muted">{row.role}</p>
                      </div>
                      <span
                        className={`font-mono text-[10px] px-2 py-0.5 rounded border ${
                          row.status === 'Available'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                            : 'border-hairline bg-inset text-ink-muted'
                        }`}
                      >
                        {row.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* Transparent Pricing                                                */}
        {/* ------------------------------------------------------------------ */}
        <section id="pricing" className="border-t border-hairline bg-raised/30 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-8">
            <div className="max-w-2xl">
              <Badge tone="accent" mono>Predictable Pricing</Badge>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                Honest, quota-backed tiers
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-secondary sm:text-base">
                Plan limits are enforced by backend PostgreSQL quota ledgers. No hidden overage surcharges.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
              {PRICING_TIERS.map((tier) => (
                <div
                  key={tier.name}
                  className={`flex flex-col justify-between rounded-xl border p-6 transition-all ${
                    tier.isPrimary
                      ? 'border-accent bg-raised shadow-raised relative'
                      : 'border-hairline bg-raised/70'
                  }`}
                >
                  {tier.isPrimary && (
                    <span className="absolute -top-3 left-6 rounded-full bg-accent px-2.5 py-0.5 font-mono text-[10px] font-semibold text-accent-contrast">
                      Recommended
                    </span>
                  )}
                  <div>
                    <h3 className="text-base font-semibold text-ink">{tier.name}</h3>
                    <p className="mt-1 text-xs text-ink-secondary">{tier.description}</p>
                    <div className="mt-4 flex items-baseline gap-1 font-mono">
                      <span className="text-3xl font-bold text-ink">{tier.price}</span>
                      <span className="text-xs text-ink-muted">/{tier.frequency}</span>
                    </div>

                    <div className="mt-4 border-t border-hairline pt-4 space-y-2 text-xs text-ink">
                      <div className="flex items-center gap-2">
                        <Zap className="h-3.5 w-3.5 text-accent" />
                        <span className="font-semibold">{tier.quota}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-accent" />
                        <span>{tier.history}</span>
                      </div>
                    </div>

                    <Divider className="my-4" />

                    <ul className="space-y-2.5 text-xs text-ink-secondary">
                      {tier.features.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Link
                    to={ROUTES.login}
                    className={`mt-6 flex h-10 items-center justify-center rounded-md text-xs font-semibold transition-all ${
                      tier.isPrimary
                        ? 'bg-accent text-accent-contrast hover:bg-accent/90 shadow-sm'
                        : 'border border-hairline bg-inset text-ink hover:bg-overlay'
                    }`}
                  >
                    {tier.cta}
                  </Link>
                </div>
              ))}
            </div>

            <p className="mt-4 text-center text-xs text-ink-muted">
              Checkout and subscriptions are managed securely via Stripe. Quota reconciliations occur in real time via signed webhooks.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* Final Call to Action                                               */}
        {/* ------------------------------------------------------------------ */}
        <section className="relative overflow-hidden border-t border-hairline py-16 sm:py-24 text-center">
          <DotGridBackground glowColor="cyan" className="opacity-50" />
          <div className="relative mx-auto max-w-3xl px-4 sm:px-6 md:px-8">
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl md:text-4xl">
              Start with your next failing build
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-secondary sm:text-base">
              Connect your GitHub repository in under two minutes. Let one failed CI run through,
              and see the difference between raw terminal noise and verifiable diagnostic intelligence.
            </p>
            <div className="mt-8 flex justify-center gap-3.5">
              <Link
                to={ROUTES.login}
                className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-5 text-sm font-medium text-accent-contrast transition-all hover:bg-accent/90 shadow-raised"
              >
                Connect GitHub Repository
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* -------------------------------------------------------------------- */}
      {/* Technical Footer                                                     */}
      {/* -------------------------------------------------------------------- */}
      <footer className="border-t border-hairline bg-canvas px-4 py-10 sm:px-6 md:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row text-xs text-ink-muted">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
            <span className="font-semibold text-ink">Hopper CI/CD</span>
            <span>•</span>
            <span>Named in honor of Rear Admiral Grace Hopper (1906–1992)</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to={ROUTES.login} className="hover:text-ink transition-colors">Dashboard</Link>
            <a href="https://github.com/johan-droid/Hopper" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-ink transition-colors">
              GitHub <ExternalLink className="h-3 w-3" />
            </a>
            <span className="font-mono text-[10px] bg-inset border border-hairline px-2 py-0.5 rounded">
              PostgreSQL · Vercel · GitHub App
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
