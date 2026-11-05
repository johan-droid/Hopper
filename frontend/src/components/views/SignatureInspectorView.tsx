import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSignatureQuery } from '../../api/hooks';
import { ArrowLeft, Copy, Check, Sparkles, GitBranch, GitPullRequest, Clock } from 'lucide-react';

export const SignatureInspectorView: React.FC = () => {
  const { setTab } = useAppStore();
  // Use first signature from local state or default
  const [signatureId, setSignatureId] = useState<string>('sig_7f8a91c20e14');
  const { data: signatureData, isLoading } = useSignatureQuery(signatureId);
  const [copied, setCopied] = useState(false);

  // Fallback demo signature if backend returns null
  const sig = signatureData || {
    id: signatureId,
    signatureHash: 'sha256:7f8a91c20e149d8c3621980be103f6f1c4a921d7',
    normalizedTemplate: 'Error: Timeout of 30000ms exceeded waiting for selector [data-testid=3ds-challenge-frame]',
    testIdentifier: 'tests/checkout.spec.ts › Checkout Flow › 3D Secure verification modal',
    errorCategory: 'timeout / selector_missing',
    flakinessScore: 92.5,
    totalOccurrences: 14,
    mainBranchOccurrences: 2,
    uniquePrsAffected: 6,
    sameShaRetryPasses: 4,
    cachedRootCause: 'Async race condition: iframe takes >30s to mount when Stripe sandbox API latency spikes during CI test concurrency.',
    cachedNextCheck: 'Increase test timeout or stub 3DS modal using Playwright route mock.',
    firstSeenAt: '2026-10-24T08:14:22Z',
    lastSeenAt: new Date().toISOString(),
    crossRunTimeline: [
      {
        githubRunId: '10928374',
        commitSha: '8d2f1b4',
        branch: 'feat/checkout-redesign',
        prNumber: 142,
        exitCode: 1,
        durationMs: 34200,
        failedAt: '12 mins ago',
        sanitizedLogSnippet: `Error: Timeout of 30000ms exceeded waiting for selector "[data-testid='3ds-challenge-frame']"\n  at tests/checkout.spec.ts:52:19\n  at Frame.waitForSelector (node_modules/playwright-core/lib/client/frame.js:321:12)`,
      },
      {
        githubRunId: '10924102',
        commitSha: '8d2f1b4',
        branch: 'feat/checkout-redesign',
        prNumber: 142,
        exitCode: 0,
        durationMs: 14800,
        failedAt: '25 mins ago (Retry #1 Passed)',
        sanitizedLogSnippet: `[Retry passed without code changes - Same SHA passed cleanly confirming flakiness]`,
      },
      {
        githubRunId: '10887123',
        commitSha: 'e4a19c0',
        branch: 'main',
        prNumber: null,
        exitCode: 1,
        durationMs: 31050,
        failedAt: 'Yesterday',
        sanitizedLogSnippet: `Error: Timeout of 30000ms exceeded waiting for selector "[data-testid='3ds-challenge-frame']"\n  at tests/checkout.spec.ts:52:19`,
      },
    ],
  };

  const handleCopyHash = () => {
    navigator.clipboard.writeText(sig.signatureHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="bg-[#0f1523] border border-white/10 rounded-xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-rose-950/60 text-rose-400 border border-rose-800/40">
                {sig.flakinessScore}% Flakiness Score
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-mono bg-slate-800 text-slate-400 border border-white/5">
                {sig.errorCategory}
              </span>
              {isLoading && <span className="text-xs font-mono text-cyan-400 animate-pulse">Syncing...</span>}
            </div>
            <h1 className="text-xl font-bold font-mono text-white tracking-tight">{sig.testIdentifier}</h1>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs font-mono text-cyan-400 bg-[#080c14] border border-cyan-950 px-2.5 py-1 rounded">
                {sig.signatureHash}
              </span>
              <button
                onClick={handleCopyHash}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Copy SHA-256 Signature"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <button
            onClick={() => setTab('overview')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Leaderboard
          </button>
        </div>

        {/* 4 Moat Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-[#0a0f1d] border border-white/5 rounded-lg p-3.5">
            <div className="text-[11px] font-mono text-slate-500 uppercase">Total Occurrences</div>
            <div className="text-2xl font-bold font-mono text-white mt-1">{sig.totalOccurrences}x</div>
          </div>
          <div className="bg-[#0a0f1d] border border-white/5 rounded-lg p-3.5">
            <div className="text-[11px] font-mono text-slate-500 uppercase">Unique PRs Affected</div>
            <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">{sig.uniquePrsAffected} PRs</div>
          </div>
          <div className="bg-[#0a0f1d] border border-white/5 rounded-lg p-3.5">
            <div className="text-[11px] font-mono text-slate-500 uppercase">Same-SHA Retry Passes</div>
            <div className="text-2xl font-bold font-mono text-emerald-400 mt-1">{sig.sameShaRetryPasses} passes</div>
          </div>
          <div className="bg-[#0a0f1d] border border-white/5 rounded-lg p-3.5">
            <div className="text-[11px] font-mono text-slate-500 uppercase">Main Branch Failures</div>
            <div className="text-2xl font-bold font-mono text-rose-400 mt-1">{sig.mainBranchOccurrences}x</div>
          </div>
        </div>

        {/* AI Root-Cause Assessment */}
        {sig.cachedRootCause && (
          <div className="mt-6 p-4 rounded-xl bg-gradient-to-br from-blue-950/40 via-cyan-950/20 to-[#0f1523] border border-cyan-800/40">
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-bold mb-2">
              <Sparkles className="w-4 h-4 text-cyan-400 animate-pulse" />
              Hopper AI Root-Cause Assessment (Cached Synthesis)
            </div>
            <p className="text-xs text-slate-200 leading-relaxed font-sans">{sig.cachedRootCause}</p>
            {sig.cachedNextCheck && (
              <div className="mt-3 flex items-start gap-2 p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/30 text-emerald-300 text-xs font-mono">
                <span className="font-bold">Recommendation:</span>
                <span>{sig.cachedNextCheck}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cross-Run Timeline */}
      <div className="bg-[#0f1523] border border-white/10 rounded-xl p-6 shadow-sm">
        <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          Cross-Run Failure Timeline & Log Traces
        </h3>

        <div className="space-y-3">
          {sig.crossRunTimeline.map((run, i) => (
            <div
              key={`${run.githubRunId}-${i}`}
              className="bg-[#0a0f1d] border border-white/5 rounded-lg p-4 hover:border-white/10 transition-colors"
            >
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2.5 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400 font-bold">{run.commitSha}</span>
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    <GitBranch className="w-3 h-3 text-slate-500" />
                    {run.branch}
                  </span>
                  {run.prNumber && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-purple-950/50 text-purple-300 border border-purple-800/40">
                      <GitPullRequest className="w-3 h-3 text-purple-400" />
                      PR #{run.prNumber}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-slate-400">
                  <span>⏱ {(run.durationMs / 1000).toFixed(1)}s</span>
                  <span>📅 {run.failedAt}</span>
                  <span
                    className={`px-2 py-0.5 rounded font-bold ${
                      run.exitCode === 0
                        ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/40'
                        : 'bg-rose-950/50 text-rose-400 border border-rose-800/40'
                    }`}
                  >
                    {run.exitCode === 0 ? 'PASSED (Retry)' : `FAILED (Exit ${run.exitCode})`}
                  </span>
                </div>
              </div>

              <pre className="text-[11px] font-mono text-slate-300 bg-[#060913] p-3 rounded border border-white/5 overflow-x-auto whitespace-pre-wrap">
                {run.sanitizedLogSnippet}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
