import React, { useState } from 'react';
import { Terminal, CheckCircle2, GitPullRequest, Copy, Check, Zap } from 'lucide-react';

export const IntegrationsView: React.FC = () => {
  const [copiedCli, setCopiedCli] = useState(false);
  const [copiedAction, setCopiedAction] = useState(false);

  const cliSnippet = `npm install -g @hopper/cli
hopper diagnose --file ./ci-build.log`;

  const githubActionSnippet = `- name: Triage Failures with Hopper
  if: failure()
  uses: hopper-ci/action-triage@v1
  with:
    github-token: \${{ secrets.GITHUB_TOKEN }}
    api-url: https://api.hopper.dev`;

  const handleCopy = (text: string, setter: (val: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <Terminal className="w-5 h-5 text-cyan-400" />
          Integrations & Ingress Telemetry
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          GitHub App webhooks, automated PR sticky comment delivery, and developer CLI integration.
        </p>
      </div>

      {/* GitHub App Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0f1523] border border-white/10 rounded-xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>GITHUB APP INSTALLATION</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
              <CheckCircle2 className="w-3 h-3" /> CONNECTED
            </span>
          </div>
          <div className="text-sm font-bold font-mono text-white">App ID: 1010101</div>
          <div className="text-[11px] font-mono text-slate-500">
            Permissions: Checks (write), Pull Requests (write), Contents (read)
          </div>
        </div>

        <div className="bg-[#0f1523] border border-white/10 rounded-xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>WEBHOOK INGRESS LATENCY</span>
            <span className="text-cyan-400 font-bold flex items-center gap-1 text-[11px]">
              <Zap className="w-3 h-3" /> &lt; 50MS
            </span>
          </div>
          <div className="text-sm font-bold font-mono text-white">4.14ms avg ack</div>
          <div className="text-[11px] font-mono text-slate-500">
            Redis rate-limiting + BullMQ decoupled async queue processing
          </div>
        </div>

        <div className="bg-[#0f1523] border border-white/10 rounded-xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>REPLAY PROTECTION</span>
            <span className="text-emerald-400 font-bold text-[11px]">ACTIVE</span>
          </div>
          <div className="text-sm font-bold font-mono text-white">24-Hour TTL Moat</div>
          <div className="text-[11px] font-mono text-slate-500">
            Deduplicates X-GitHub-Delivery headers across network retries
          </div>
        </div>
      </div>

      {/* Sticky PR Comment Preview */}
      <div className="bg-[#0f1523] border border-white/10 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <span className="text-xs font-mono text-slate-300 font-bold flex items-center gap-2">
            <GitPullRequest className="w-4 h-4 text-cyan-400" />
            LIVE GITHUB PR STICKY COMMENT PREVIEW
          </span>
          <span className="text-[11px] font-mono text-slate-500">
            Automatically upserted on failing PR runs
          </span>
        </div>

        <div className="bg-[#0a0f1d] border border-slate-800 rounded-lg p-5 font-sans text-xs text-slate-200 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white font-mono">hopper[bot]</span>
              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-slate-400 font-mono">bot</span>
              <span className="text-slate-500 text-[11px]">commented just now</span>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-rose-950/60 text-rose-400 border border-rose-800/40 font-bold">
              CI FAILURE DIAGNOSED
            </span>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-white text-sm">
              CI Failure Analysis: <code className="bg-slate-900 px-1 py-0.5 rounded text-cyan-300">test / unit-tests</code>
            </h4>
            <p className="text-slate-300">
              <strong>Category:</strong> <span className="text-rose-400 font-mono">test_assertion</span> &bull;{' '}
              <strong>Flakiness Confidence:</strong> <span className="text-amber-400 font-mono">92.5% (High Flakiness)</span>
            </p>
            <p className="text-slate-300">
              <strong>Root Cause:</strong> Assertion mismatch in the JWT expiry verifier due to timestamp clock drift in CI worker.
            </p>
          </div>

          <div className="bg-slate-900/80 border border-white/5 rounded p-3 font-mono text-[11px] space-y-1">
            <div className="text-slate-500 font-bold">RELEVANT EVIDENCE LINES:</div>
            <div className="text-slate-300">L42: AssertionError: expected 'active' to deeply equal 'expired'</div>
            <div className="text-slate-300">L43: at src/auth/jwt-verifier.spec.ts:42:15</div>
          </div>

          <div className="pt-2 flex items-center justify-between text-slate-400 font-mono text-[11px]">
            <span>Local Repro: <code className="text-emerald-400 bg-slate-900 px-1.5 py-0.5 rounded">npx vitest run jwt-verifier.spec.ts</code></span>
            <span className="text-cyan-400">View Full Trace in Hopper &rarr;</span>
          </div>
        </div>
      </div>

      {/* Developer CLI & CI Action Guides */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#0f1523] border border-white/10 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-slate-300">LOCAL DEVELOPER CLI</span>
            <button
              onClick={() => handleCopy(cliSnippet, setCopiedCli)}
              className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
            >
              {copiedCli ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedCli ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="p-3 bg-black/60 rounded-lg text-emerald-400 font-mono text-xs overflow-x-auto border border-white/5">
            {cliSnippet}
          </pre>
        </div>

        <div className="bg-[#0f1523] border border-white/10 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-slate-300">GITHUB ACTIONS WORKFLOW</span>
            <button
              onClick={() => handleCopy(githubActionSnippet, setCopiedAction)}
              className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
            >
              {copiedAction ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedAction ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="p-3 bg-black/60 rounded-lg text-emerald-400 font-mono text-xs overflow-x-auto border border-white/5">
            {githubActionSnippet}
          </pre>
        </div>
      </div>
    </div>
  );
};
