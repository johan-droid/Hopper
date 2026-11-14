import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../../../lib/routes';
import { Badge } from '../../../components/ui/primitives';
import {
  Search,
  Terminal,
  MessageSquare,
  Check,
  Copy,
  ExternalLink,
  GitPullRequest,
  Fingerprint,
  Zap,
  Lock,
} from 'lucide-react';

interface PreviewSample {
  id: string;
  name: string;
  category: string;
  flakiness: number;
  occurrences: number;
  rootCause: string;
  diff: string;
  reproCommand: string;
  signatureHash: string;
  logLines: string[];
}

const PREVIEW_SAMPLES: PreviewSample[] = [
  {
    id: 'assertion',
    name: 'Jest JWT Expiration Race',
    category: 'test_assertion',
    flakiness: 12.0,
    occurrences: 14,
    rootCause: 'The test fixture sets expires_at before activating fake timers, causing the JWT verifier to evaluate an already-expired timestamp.',
    diff: `--- a/src/auth/jwt-verifier.spec.ts
+++ b/src/auth/jwt-verifier.spec.ts
@@ -39,4 +39,4 @@
- const token = generateTestToken({ ttl: 3600 });
- vi.useFakeTimers();
+ vi.useFakeTimers();
+ const token = generateTestToken({ ttl: 3600 });`,
    reproCommand: 'npx vitest run src/auth/jwt-verifier.spec.ts -t "rejects expired token"',
    signatureHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    logLines: [
      'FAIL src/auth/jwt-verifier.spec.ts > JWT verifier > rejects expired token',
      "AssertionError: expected 'active' to deeply equal 'expired'",
      '  at verifyTokenSession (src/auth/jwt-verifier.ts:89:14)',
      'Process completed with exit code 1.',
    ],
  },
  {
    id: 'timeout',
    name: 'Playwright Selector Timeout',
    category: 'timeout',
    flakiness: 84.5,
    occurrences: 38,
    rootCause: 'The challenge iframe takes 1.2s to hydrate under CI CPU throttling. The selector query timeout is set to 500ms, creating non-deterministic failures on shared runners.',
    diff: `--- a/tests/checkout.spec.ts
+++ b/tests/checkout.spec.ts
@@ -50,3 +50,3 @@
- await page.waitForSelector("[data-testid='challenge-frame']", { timeout: 500 });
+ await page.waitForSelector("[data-testid='challenge-frame']", { state: 'attached', timeout: 5000 });`,
    reproCommand: 'npx playwright test tests/checkout.spec.ts -g "iframe challenge"',
    signatureHash: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
    logLines: [
      'Error: Timeout of 30000ms exceeded waiting for selector "[data-testid=\'challenge-frame\']"',
      '  at tests/checkout.spec.ts:52:19',
      'Process completed with exit code 1.',
    ],
  },
  {
    id: 'oom',
    name: 'Node.js Heap Allocation Crash',
    category: 'infra_oom',
    flakiness: 62.0,
    occurrences: 9,
    rootCause: 'Webpack / Vite asset bundling exceeds Node default 2GB heap ceiling during parallel sourcemap generation on GitHub Linux runners.',
    diff: `--- a/package.json
+++ b/package.json
@@ -12,3 +12,3 @@
- "build": "vite build",
+ "build": "NODE_OPTIONS='--max-old-space-size=4096' vite build",`,
    reproCommand: 'NODE_OPTIONS="--max-old-space-size=2048" npm run build',
    signatureHash: '1f2e3d4c5b6a7988970819283746554637281901a2b3c4d5e6f7a8b9c0d1e2f3',
    logLines: [
      '<--- Last few GCs --->',
      '[1844:0x5e8c000] 42150 ms: Mark-sweep 2042.4 (2080.1) -> 2038.1 MB, allocation failure',
      'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
      'Process completed with exit code 137.',
    ],
  },
];

export const ProductPreviewSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'sandbox' | 'moat' | 'pr'>('sandbox');
  const [selectedSampleId, setSelectedSampleId] = useState<string>('assertion');
  const [copied, setCopied] = useState(false);

  const sample = PREVIEW_SAMPLES.find((s) => s.id === selectedSampleId) || PREVIEW_SAMPLES[0];

  const handleCopyRepro = () => {
    navigator.clipboard.writeText(sample.reproCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="preview" className="relative border-t border-hairline/70 bg-raised/20 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-inset px-3 py-1 text-xs font-mono text-rose-400">
            <span>REAL INTERFACES</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Developer Experience Built for Speed
          </h2>
          <p className="text-sm sm:text-base text-ink-secondary leading-relaxed">
            Inspect real diagnostic reports, flakiness leaderboards, and GitHub Pull Request comments generated directly by Hopper's engine.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="mt-10 flex justify-center">
          <div className="inline-flex rounded-xl border border-hairline bg-raised p-1 shadow-md">
            <button
              type="button"
              onClick={() => setActiveTab('sandbox')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
                activeTab === 'sandbox'
                  ? 'bg-rose-500/20 text-white border border-rose-500/30'
                  : 'text-ink-secondary hover:text-white'
              }`}
            >
              <Search className="h-3.5 w-3.5 text-rose-400" />
              <span>Investigation Sandbox</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('moat')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
                activeTab === 'moat'
                  ? 'bg-rose-500/20 text-white border border-rose-500/30'
                  : 'text-ink-secondary hover:text-white'
              }`}
            >
              <Fingerprint className="h-3.5 w-3.5 text-rose-400" />
              <span>Failure Signature Moat</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pr')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
                activeTab === 'pr'
                  ? 'bg-rose-500/20 text-white border border-rose-500/30'
                  : 'text-ink-secondary hover:text-white'
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5 text-rose-400" />
              <span>Sticky PR Comment</span>
            </button>
          </div>
        </div>

        {/* Dynamic Tab Body */}
        <div className="mt-8">
          {activeTab === 'sandbox' && (
            <div className="rounded-2xl border border-hairline bg-canvas/90 p-6 sm:p-8 shadow-2xl backdrop-blur-md space-y-6">
              {/* Sample Selector Pills */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-hairline/60">
                <span className="text-xs font-mono uppercase tracking-wider text-ink-muted">
                  Choose a CI failure scenario:
                </span>
                <div className="flex flex-wrap gap-2">
                  {PREVIEW_SAMPLES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedSampleId(s.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all ${
                        selectedSampleId === s.id
                          ? 'bg-white text-neutral-950 font-semibold shadow-sm'
                          : 'bg-raised border border-hairline text-ink-secondary hover:text-white'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sandbox Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left: Sliced Log Snippet */}
                <div className="lg:col-span-5 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-ink-secondary flex items-center gap-1.5">
                      <Terminal className="h-3.5 w-3.5 text-rose-400" />
                      <span>Sanitized Log Extraction</span>
                    </span>
                    <Badge tone="neutral" mono className="text-[10px]">
                      {sample.category}
                    </Badge>
                  </div>

                  <div className="rounded-xl border border-hairline bg-black/80 p-4 font-mono text-xs text-slate-300 space-y-1.5 select-text">
                    {sample.logLines.map((line, i) => (
                      <div key={i} className={line.startsWith('FAIL') || line.startsWith('Error') || line.startsWith('FATAL') ? 'text-rose-400 font-semibold' : 'text-slate-400'}>
                        {line}
                      </div>
                    ))}
                  </div>

                  {/* Local Repro Command Bar */}
                  <div className="rounded-lg border border-hairline bg-inset/80 p-3 space-y-1">
                    <span className="text-[10px] font-mono uppercase text-ink-muted block">
                      Local Offline Reproduction Command
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-xs font-mono text-white truncate">{sample.reproCommand}</code>
                      <button
                        type="button"
                        onClick={handleCopyRepro}
                        className="rounded p-1 bg-raised text-ink-secondary hover:text-white transition-colors"
                        title="Copy command"
                      >
                        {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right: Structured AI Diagnosis & Diff */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-ink-secondary flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Hopper Diagnosis & Verified Fix</span>
                    </span>
                    <span className="font-mono text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      Flakiness: {sample.flakiness}%
                    </span>
                  </div>

                  {/* Root cause box */}
                  <div className="rounded-xl border border-hairline/80 bg-raised/70 p-4 space-y-2">
                    <span className="text-[11px] font-semibold text-white tracking-tight uppercase block font-mono">
                      Root Cause Analysis
                    </span>
                    <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed">
                      {sample.rootCause}
                    </p>
                  </div>

                  {/* Code Diff Box */}
                  <div className="rounded-xl border border-hairline/80 bg-black/70 overflow-hidden">
                    <div className="px-4 py-2 bg-inset/80 border-b border-hairline text-xs font-mono text-ink-muted flex items-center justify-between">
                      <span>Suggested Fix Diff (Unified Format)</span>
                      <span className="text-emerald-400">Validated with Zod</span>
                    </div>
                    <pre className="p-4 font-mono text-xs overflow-x-auto leading-relaxed select-text">
                      {sample.diff.split('\n').map((l, i) => (
                        <div
                          key={i}
                          className={
                            l.startsWith('+') && !l.startsWith('+++')
                              ? 'text-emerald-400 bg-emerald-950/20'
                              : l.startsWith('-') && !l.startsWith('---')
                              ? 'text-rose-400 bg-rose-950/20'
                              : 'text-slate-400'
                          }
                        >
                          {l}
                        </div>
                      ))}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'moat' && (
            <div className="rounded-2xl border border-hairline bg-canvas/90 p-6 sm:p-8 shadow-2xl backdrop-blur-md space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-hairline">
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    Failure Signature Moat & Flakiness Leaderboard
                  </h3>
                  <p className="text-xs text-ink-secondary">
                    Deduplicates repeated errors into canonical SHA-256 signatures across repositories.
                  </p>
                </div>
                <Link
                  to={ROUTES.overview}
                  className="text-xs font-mono text-rose-400 hover:text-rose-300 inline-flex items-center gap-1"
                >
                  <span>Open Full Leaderboard</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>

              {/* Table Preview */}
              <div className="overflow-x-auto rounded-xl border border-hairline/80 bg-raised/50">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="border-b border-hairline bg-inset/80 text-[11px] text-ink-muted uppercase">
                    <tr>
                      <th className="px-4 py-3">Normalized Failure Signature</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Flakiness Score</th>
                      <th className="px-4 py-3">Occurrences</th>
                      <th className="px-4 py-3">Retry Passes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline/50 text-slate-300">
                    <tr className="hover:bg-raised/80 transition-colors">
                      <td className="px-4 py-3.5">
                        <span className="font-semibold text-white block">job:e2e|step:test|selector:challenge-frame</span>
                        <span className="text-[10px] text-ink-muted">hash: 9a8b7c6d5e4f...</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="rounded bg-amber-500/10 text-amber-300 px-2 py-0.5 border border-amber-500/20">
                          timeout
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-rose-400 font-bold">84.5% (High Flake)</span>
                      </td>
                      <td className="px-4 py-3.5">38 runs</td>
                      <td className="px-4 py-3.5 text-emerald-400 font-semibold">19 passes on retry</td>
                    </tr>
                    <tr className="hover:bg-raised/80 transition-colors">
                      <td className="px-4 py-3.5">
                        <span className="font-semibold text-white block">job:build|step:bundle|err:heap_out_of_memory</span>
                        <span className="text-[10px] text-ink-muted">hash: 1f2e3d4c5b6a...</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="rounded bg-rose-500/10 text-rose-300 px-2 py-0.5 border border-rose-500/20">
                          infra_oom
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-amber-400 font-bold">62.0% (Moderate)</span>
                      </td>
                      <td className="px-4 py-3.5">9 runs</td>
                      <td className="px-4 py-3.5 text-emerald-400">3 passes on retry</td>
                    </tr>
                    <tr className="hover:bg-raised/80 transition-colors">
                      <td className="px-4 py-3.5">
                        <span className="font-semibold text-white block">job:unit|step:test|file:jwt-verifier.spec.ts</span>
                        <span className="text-[10px] text-ink-muted">hash: e3b0c44298fc...</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="rounded bg-blue-500/10 text-blue-300 px-2 py-0.5 border border-blue-500/20">
                          test_assertion
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-emerald-400 font-bold">12.0% (Deterministic)</span>
                      </td>
                      <td className="px-4 py-3.5">14 runs</td>
                      <td className="px-4 py-3.5 text-neutral-400">0 passes (Genuine bug)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'pr' && (
            <div className="rounded-2xl border border-hairline bg-canvas/90 p-6 sm:p-8 shadow-2xl backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-hairline">
                <div className="flex items-center gap-2">
                  <GitPullRequest className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-white">
                    Pull Request #142 · Sticky Comment Thread
                  </span>
                </div>
                <span className="text-[10px] font-mono text-ink-muted bg-inset px-2 py-0.5 rounded border border-hairline">
                  Single Updated Comment
                </span>
              </div>

              {/* Rendered Sticky Comment */}
              <div className="rounded-xl border border-hairline bg-raised/70 p-5 sm:p-6 space-y-4 text-xs font-sans text-slate-200">
                <div className="flex items-center gap-2.5 pb-3 border-b border-hairline/60">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    <Zap className="h-3.5 w-3.5" />
                  </div>
                  <span className="font-semibold text-white text-sm">
                    ⚡ Hopper CI Failure Diagnosis
                  </span>
                  <Badge tone="danger" mono className="text-[10px] ml-auto">
                    Confidence: 94%
                  </Badge>
                </div>

                <div className="space-y-2">
                  <p className="text-white font-medium">
                    <strong>Root Cause:</strong> The test fixture sets <code className="bg-black/60 px-1 py-0.5 rounded font-mono text-rose-300">expires_at</code> before freezing system time, causing the JWT verifier to evaluate an already-expired timestamp.
                  </p>
                </div>

                {/* Diff in PR Comment */}
                <div className="rounded-lg border border-hairline bg-black/80 p-3 font-mono text-[11px] space-y-1">
                  <p className="text-neutral-500">// Suggested Patch:</p>
                  <p className="text-rose-400">{'- const token = generateTestToken({ ttl: 3600 });'}</p>
                  <p className="text-rose-400">- vi.useFakeTimers();</p>
                  <p className="text-emerald-400">+ vi.useFakeTimers();</p>
                  <p className="text-emerald-400">{'+ const token = generateTestToken({ ttl: 3600 });'}</p>
                </div>

                {/* Gated Teaser Preview */}
                <div className="rounded-lg border border-dashed border-rose-500/30 bg-rose-950/10 p-3 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2 text-rose-300">
                    <Lock className="h-3.5 w-3.5 text-rose-400" />
                    <span>Historical Flakiness Matrix & Cross-PR Clustering locked on Free Tier</span>
                  </div>
                  <Link to={ROUTES.login} className="text-xs font-semibold text-white underline underline-offset-2">
                    Upgrade to Pro ($9)
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
