import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../../lib/routes';
import { Badge } from '../../../components/ui/primitives';
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Check,
  Terminal,
  Layers,
} from 'lucide-react';

interface StagePayload {
  id: string;
  stepNumber: string;
  title: string;
  badge: string;
  subtitle: string;
  summary: string;
  codeSnippet: string;
  metadata: Record<string, string>;
}

const HERO_STAGES: StagePayload[] = [
  {
    id: 'ingress',
    stepNumber: '01',
    title: 'Cryptographic Webhook Ingress',
    badge: '< 50ms verified',
    subtitle: 'GitHub App workflow_job.completed',
    summary: 'Payload signature validated with constant-time HMAC-SHA256. Webhook delivery ID claimed atomically in PostgreSQL to prevent replay attacks.',
    codeSnippet: `// POST /api/webhooks/github
Headers:
  X-Hub-Signature-256: sha256=9b7c841e2f0a1c890...
  X-GitHub-Delivery:   8d91c2fa-0a11-4f8e-9901-b2190
  X-GitHub-Event:      workflow_job

Payload:
{
  "action": "completed",
  "workflow_job": {
    "id": 19481029481,
    "run_id": 8492019482,
    "conclusion": "failure",
    "name": "unit-tests / auth-verifier"
  }
}`,
    metadata: {
      Latency: '18ms',
      Verification: 'crypto.timingSafeEqual',
      Dedup: 'hopper_webhook_deliveries',
    },
  },
  {
    id: 'outbox',
    stepNumber: '02',
    title: 'PostgreSQL Durable Outbox',
    badge: 'At-Least-Once Delivery',
    subtitle: 'hopper_job_queue · SKIP LOCKED',
    summary: 'The event is durably committed to the database before HTTP 202 is acknowledged. Workers claim jobs safely using PostgreSQL SELECT FOR UPDATE SKIP LOCKED.',
    codeSnippet: `-- Atomic worker claim without lock contention
SELECT * FROM hopper_claim_next_job(
  p_queue_name => 'ci-events',
  p_worker_id  => 'wrk_bom1_9281a',
  p_lock_duration_seconds => 120
);

Result:
  id: "e4a10f88-4902-4d51-b8ef-912da091c781"
  status: "processing"
  attempts: 1 / 5
  idempotency_key: "wj_19481029481"`,
    metadata: {
      Durability: 'Transactional SQL Outbox',
      Concurrency: 'SKIP LOCKED',
      DLQ: 'hopper_job_dead_letters',
    },
  },
  {
    id: 'slicer',
    stepNumber: '03',
    title: 'Log Slicing & Secret Scrubbing',
    badge: '300 KB Tail Window',
    subtitle: 'ANSI Stripped · Secrets Masked',
    summary: 'Streams the failed job log directly, avoiding multi-hundred megabyte archive downloads. Automatically redacts AWS keys, tokens, and database URIs.',
    codeSnippet: `// Bounded extraction around failing exit code
FAIL src/auth/jwt-verifier.spec.ts
● JWT verifier › rejects an expired token
  AssertionError: expected 'active' to deeply equal 'expired'
    at verifyTokenSession (src/auth/jwt-verifier.ts:42:15)

// Secret Scrubber in action:
[ORIGINAL]: AWS_SECRET=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
[SCRUBBED]: AWS_SECRET=[REDACTED_AWS_SECRET]
Process completed with exit code 1.`,
    metadata: {
      TailCap: '300 KB Buffer',
      Scrubber: 'Regex Deterministic Pass',
      InjectionBoundary: '<UNTRUSTED_CI_LOG>',
    },
  },
  {
    id: 'moat',
    stepNumber: '04',
    title: 'SHA-256 Fingerprint & Flakiness',
    badge: 'Cloud Moat',
    subtitle: 'Token Masking · Bayesian Score',
    summary: 'Normalizes volatile UUIDs, line numbers, and timestamps to collapse identical failures into a single canonical signature hash.',
    codeSnippet: `Normalized Template:
"job:unit-tests|step:run tests|test:auth/jwt-verifier|trace:AssertionError:[VAL]!=[VAL]"

Canonical Signature:
  hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  flakiness_score: 84.5% (Bayesian posterior)
  same_sha_retries: 4 passes on 5 retries
  unique_prs_affected: 7 independent branches`,
    metadata: {
      Hasher: 'SHA-256',
      Vectors: 'pgvector HNSW (1536-dim)',
      Flakiness: 'Bayesian Heuristics',
    },
  },
  {
    id: 'reporter',
    stepNumber: '05',
    title: 'In-Situ Sticky PR Comment',
    badge: 'Sub-15s Delivery',
    subtitle: 'Zero PR Spam · Unified Diff',
    summary: 'Updates a single sticky comment on the pull request with root-cause diagnosis, verified failing line range, and actionable code diff.',
    codeSnippet: `<!-- ci-doctor-sticky-comment -->
### ⚡ Hopper CI Failure Diagnosis

**Root Cause:** The test fixture sets \`expires_at\` before activating fake timers, causing the JWT verifier to evaluate an already-expired token.

\`\`\`diff
- const token = generateTestToken({ ttl: 3600 });
- vi.useFakeTimers();
+ vi.useFakeTimers();
+ const token = generateTestToken({ ttl: 3600 });
\`\`\`
*Confidence: 94% · Failure Category: test_assertion*`,
    metadata: {
      Format: 'Single Sticky PR Comment',
      Delivery: 'Octokit REST PATCH',
      TierGating: 'Pro/Team Moat Teaser',
    },
  },
];

export const HeroSection: React.FC = () => {
  const [activeStageId, setActiveStageId] = useState<string>('ingress');
  const [copied, setCopied] = useState(false);

  const activeStage = HERO_STAGES.find((s) => s.id === activeStageId) || HERO_STAGES[0];

  const handleCopy = () => {
    navigator.clipboard.writeText(activeStage.codeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="relative overflow-hidden pt-12 pb-16 md:pt-20 md:pb-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Hero Top Copy */}
        <div className="mx-auto max-w-4xl text-center space-y-5">
          {/* Release Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-rose-500/30 bg-rose-950/20 px-3.5 py-1 text-xs font-medium text-rose-300 backdrop-blur-sm shadow-sm">
            <span className="flex h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
            <span>Hopper 2.0 — CI/CD Failure Diagnosis & Cloud Moat</span>
          </div>

          {/* Primary Headline */}
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl lg:leading-[1.1]">
            Understand every failure.{' '}
            <span className="bg-gradient-to-r from-rose-400 via-rose-500 to-rose-300 bg-clip-text text-transparent">
              Move development forward.
            </span>
          </h1>

          {/* Supporting Copy */}
          <p className="mx-auto max-w-2xl text-base text-ink-secondary sm:text-lg leading-relaxed">
            Hopper connects to your continuous integration pipeline to slice raw terminal logs, scrub leaked credentials, fingerprint recurring errors into a persistent cloud moat, and deliver structured root-cause diagnoses directly to pull requests.
          </p>

          {/* Primary CTA Cluster */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3">
            <Link
              to={ROUTES.login}
              className="group relative flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-lg bg-white px-6 py-3.5 text-sm font-semibold text-neutral-950 shadow-lg shadow-white/5 transition-all duration-200 hover:bg-neutral-100 hover:shadow-rose-500/10 focus-visible:ring-2 focus-visible:ring-rose-500"
            >
              <span>Get Started with GitHub</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 text-neutral-950" />
            </Link>

            <a
              href="#architecture"
              className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-hairline/80 bg-raised/70 px-5 py-3.5 text-sm font-medium text-white transition-colors hover:bg-raised hover:border-hairline focus-visible:ring-2 focus-visible:ring-rose-500"
            >
              <Layers className="h-4 w-4 text-rose-400" />
              <span>Explore Live Architecture</span>
            </a>
          </div>

          {/* Minimal Sandbox Reference */}
          <p className="text-xs text-ink-muted">
            No YAML changes required. Or test logs in the{' '}
            <Link to={ROUTES.investigations} className="text-rose-400 hover:text-rose-300 underline underline-offset-2">
              interactive investigation sandbox
            </Link>
            .
          </p>
        </div>

        {/* Hero Interactive Pipeline Visualization */}
        <div className="mt-14 lg:mt-18">
          <div className="overflow-hidden rounded-2xl border border-hairline/80 bg-raised/90 shadow-2xl backdrop-blur-xl">
            {/* Pipeline Stage Bar */}
            <div className="border-b border-hairline/70 bg-inset/60 px-4 py-3 sm:px-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse" />
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-white">
                    Verified Processing Pipeline
                  </span>
                  <span className="text-ink-muted text-xs hidden sm:inline">· Click a stage to inspect real engine state</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-ink-secondary bg-canvas px-2.5 py-1 rounded border border-hairline">
                    End-to-End Latency: &lt; 15s
                  </span>
                </div>
              </div>

              {/* Progress Steps Tabs */}
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                {HERO_STAGES.map((stage) => {
                  const isActive = stage.id === activeStageId;
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => setActiveStageId(stage.id)}
                      className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-all shrink-0 ${
                        isActive
                          ? 'bg-rose-500/15 border border-rose-500/40 text-white'
                          : 'bg-canvas/50 border border-hairline/40 text-ink-secondary hover:text-white hover:bg-canvas'
                      }`}
                      aria-selected={isActive}
                    >
                      <span className={`font-mono text-[10px] font-bold ${isActive ? 'text-rose-400' : 'text-ink-muted'}`}>
                        {stage.stepNumber}
                      </span>
                      <span className="font-medium whitespace-nowrap">{stage.title}</span>
                      {isActive && <span className="h-1.5 w-1.5 rounded-full bg-rose-400 ml-1" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Split Inspection View: Left Explanation, Right Terminal Payload */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-hairline/60">
              {/* Left Context Panel */}
              <div className="lg:col-span-5 p-5 sm:p-7 flex flex-col justify-between space-y-6 bg-canvas/30">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-rose-400">
                      STAGE {activeStage.stepNumber} OF 05
                    </span>
                    <Badge tone="danger" mono className="text-[10px]">
                      {activeStage.badge}
                    </Badge>
                  </div>

                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                      {activeStage.title}
                    </h3>
                    <p className="font-mono text-xs text-rose-300 mt-0.5">
                      {activeStage.subtitle}
                    </p>
                  </div>

                  <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed">
                    {activeStage.summary}
                  </p>
                </div>

                {/* Subsystem Metadata Table */}
                <div className="rounded-lg border border-hairline/60 bg-inset/80 p-3.5 space-y-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-ink-muted font-medium block">
                    Execution Telemetry & Safety Invariants
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    {Object.entries(activeStage.metadata).map(([key, val]) => (
                      <div key={key} className="space-y-0.5">
                        <span className="text-[10px] text-ink-muted block font-mono">{key}</span>
                        <span className="text-xs font-mono font-medium text-white truncate block" title={val}>
                          {val}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Technical Monospace Output */}
              <div className="lg:col-span-7 bg-canvas/70 p-5 sm:p-7 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-hairline/60 mb-3">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-4 w-4 text-ink-muted" />
                      <span className="font-mono text-xs text-ink-secondary">
                        hopper-engine://stage/{activeStage.id}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleCopy}
                      className="inline-flex items-center gap-1.5 rounded bg-raised/80 px-2 py-1 text-[11px] font-mono text-ink-secondary hover:text-white border border-hairline transition-colors"
                      title="Copy code snippet"
                    >
                      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  <pre className="font-mono text-xs text-slate-200 overflow-x-auto leading-relaxed p-2 bg-inset/40 rounded-lg max-h-72 select-text">
                    <code>{activeStage.codeSnippet}</code>
                  </pre>
                </div>

                <div className="mt-4 pt-3 border-t border-hairline/50 flex items-center justify-between text-[11px] text-ink-muted">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Real-world verified contract</span>
                  </span>
                  <span className="font-mono text-[10px]">Deterministic Pipeline</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
