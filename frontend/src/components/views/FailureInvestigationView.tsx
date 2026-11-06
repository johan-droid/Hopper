import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSignatureQuery, useAdhocDiagnoseMutation } from '../../api/hooks';
import {
  Copy,
  Check,
  Terminal,
  Clock,
  GitCommit,
  GitPullRequest,
  Play,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

const SAMPLE_LOGS: Record<string, { label: string; job: string; step: string; log: string }> = {
  jest_fail: {
    label: 'Jest Assertion Failure',
    job: 'test / unit-tests',
    step: 'Run pnpm test',
    log: `
FAIL src/auth/jwt-verifier.spec.ts
  ● JWT Authenticator › should verify valid signed JWT token
    AssertionError: expected 'active' to deeply equal 'expired'
      at src/auth/jwt-verifier.spec.ts:42:15
      at processTicksAndRejections (node:internal/process/task_queues:95:5)
Process completed with exit code 1.
    `.trim(),
  },
  playwright_timeout: {
    label: 'Playwright E2E 3DS Timeout (Flaky)',
    job: 'e2e / chromium',
    step: 'npx playwright test',
    log: `
Error: Timeout of 30000ms exceeded waiting for selector "[data-testid='3ds-challenge-frame']"
  at tests/checkout.spec.ts:52:19
  at Frame.waitForSelector (node_modules/playwright-core/lib/client/frame.js:321:12)
  at async CheckoutPage.submitPayment (tests/pages/checkout.ts:88:5)
Process completed with exit code 1.
    `.trim(),
  },
  docker_daemon: {
    label: 'Docker Daemon Socket Connection',
    job: 'docker / build-image',
    step: 'docker build',
    log: `
ERROR: Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?
Error: Process completed with exit code 1.
    `.trim(),
  },
  oom_crash: {
    label: 'Node.js Heap Out of Memory',
    job: 'build / bundle',
    step: 'npm run build',
    log: `
<--- Last few GCs --->
[1844:0x5e8c000]    42150 ms: Mark-sweep 2042.4 (2080.1) -> 2038.1 (2082.3) MB, 842.1 / 0.0 ms  (average mu = 0.125, current mu = 0.018) allocation failure; scavenge might not succeed
<--- JS stacktrace --->
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
Process completed with exit code 137.
    `.trim(),
  },
};

export const FailureInvestigationView: React.FC = () => {
  const { selectedSignatureId, setTab } = useAppStore();
  const { data: signatureData, isLoading, isError, refetch } = useSignatureQuery(selectedSignatureId || null);

  const [activeSubMode, setActiveSubMode] = useState<'investigate' | 'sandbox'>(
    selectedSignatureId ? 'investigate' : 'sandbox'
  );
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedRepro, setCopiedRepro] = useState(false);

  // Sandbox State
  const [sandboxPreset, setSandboxPreset] = useState<string>('jest_fail');
  const [rawLogInput, setRawLogInput] = useState<string>(SAMPLE_LOGS.jest_fail.log);
  const [jobNameInput, setJobNameInput] = useState<string>(SAMPLE_LOGS.jest_fail.job);
  const [stepNameInput, setStepNameInput] = useState<string>(SAMPLE_LOGS.jest_fail.step);
  const diagnoseMutation = useAdhocDiagnoseMutation();

  const sig = signatureData;

  const handleCopyHash = () => {
    if (sig?.signatureHash) {
      navigator.clipboard.writeText(sig.signatureHash);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 2000);
    }
  };

  const handleCopyRepro = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedRepro(true);
    setTimeout(() => setCopiedRepro(false), 2000);
  };

  const handlePresetChange = (key: string) => {
    setSandboxPreset(key);
    const preset = SAMPLE_LOGS[key];
    if (preset) {
      setRawLogInput(preset.log);
      setJobNameInput(preset.job);
      setStepNameInput(preset.step);
    }
  };

  const handleRunDiagnosis = async () => {
    await diagnoseMutation.mutateAsync({
      rawLog: rawLogInput,
      jobName: jobNameInput,
      stepName: stepNameInput,
      modifiedFiles: [],
    });
  };

  return (
    <div className="space-y-6">
      {/* Submode Switcher */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubMode('investigate')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              activeSubMode === 'investigate'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Signature Deep-Dive
          </button>
          <button
            onClick={() => setActiveSubMode('sandbox')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeSubMode === 'sandbox'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            Ad-hoc Diagnostic Sandbox
          </button>
        </div>

        <span className="text-[11px] font-mono text-slate-500">
          Fingerprint Engine: <span className="text-slate-300">Deterministic SHA-256 + Cloud Moat</span>
        </span>
      </div>

      {activeSubMode === 'investigate' ? (
        isLoading ? (
          <div className="py-16 text-center text-slate-400 font-mono text-xs animate-pulse bg-[#0f1523] border border-white/5 rounded-xl">
            Loading failure signature deep-dive and cross-run timeline...
          </div>
        ) : isError ? (
          <div className="p-8 rounded-xl bg-rose-950/40 border border-rose-500/30 text-center space-y-3 font-mono">
            <p className="text-sm font-bold text-white">Failure Signature Not Found</p>
            <p className="text-xs text-slate-400">The requested signature may belong to another workspace or does not exist.</p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => refetch()}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-lg cursor-pointer"
              >
                Retry Request
              </button>
              <button
                onClick={() => setTab('activity')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-lg cursor-pointer"
              >
                Back to Pipeline Activity
              </button>
              <button
                onClick={() => setActiveSubMode('sandbox')}
                className="px-3 py-1.5 bg-cyan-600/30 hover:bg-cyan-600/40 border border-cyan-500/40 text-xs text-cyan-300 rounded-lg cursor-pointer"
              >
                Open Sandbox Triage
              </button>
            </div>
          </div>
        ) : !sig ? (
          <div className="text-center py-16 bg-[#0f1523] border border-white/10 rounded-xl space-y-3 font-mono">
            <Terminal className="w-8 h-8 text-slate-500 mx-auto" />
            <p className="text-sm text-slate-300 font-bold">No Failure Signature Selected</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Select a failing job from Pipeline Activity or use the Ad-hoc Diagnostic Sandbox to paste and triage a raw build log.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setTab('activity')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-lg cursor-pointer"
              >
                View Pipeline Activity
              </button>
              <button
                onClick={() => setActiveSubMode('sandbox')}
                className="px-3 py-1.5 bg-cyan-600/30 hover:bg-cyan-600/40 border border-cyan-500/40 text-xs text-cyan-300 rounded-lg cursor-pointer"
              >
                Ad-hoc Diagnostic Sandbox &rarr;
              </button>
            </div>
          </div>
        ) : (
        <div className="space-y-6">
          {/* Signature Overview Header Card */}
          <div className="bg-[#0f1523] border border-white/10 rounded-xl p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold ${
                      sig.flakinessScore >= 50
                        ? 'bg-amber-950/60 text-amber-400 border border-amber-800/40'
                        : 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                    }`}
                  >
                    {sig.flakinessScore}% Flakiness Probability
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-mono bg-slate-800 text-slate-400 border border-white/5">
                    {sig.errorCategory}
                  </span>
                  <span className="px-2 py-0.5 rounded text-xs font-mono bg-cyan-950/40 text-cyan-300 border border-cyan-800/40">
                    {sig.sameShaRetryPasses} Same-SHA Retry Passes
                  </span>
                </div>
                <h1 className="text-lg font-bold font-mono text-white tracking-tight">
                  {sig.testIdentifier || sig.normalizedTemplate}
                </h1>
                <div className="flex items-center gap-2 mt-2 text-xs font-mono text-slate-400">
                  <span>SHA-256:</span>
                  <span className="text-slate-200 bg-slate-900 px-2 py-0.5 rounded border border-white/5">
                    {sig.signatureHash.slice(0, 32)}...
                  </span>
                  <button
                    onClick={handleCopyHash}
                    className="p-1 hover:text-cyan-400 text-slate-400 transition-colors cursor-pointer"
                    title="Copy full hash"
                  >
                    {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Stats badges */}
              <div className="flex items-center gap-3 font-mono text-xs">
                <div className="bg-slate-900/80 border border-white/5 rounded-lg px-3 py-2 text-center">
                  <div className="text-slate-500 text-[10px]">TOTAL SEEN</div>
                  <div className="text-base font-bold text-white">{sig.totalOccurrences}x</div>
                </div>
                <div className="bg-slate-900/80 border border-white/5 rounded-lg px-3 py-2 text-center">
                  <div className="text-slate-500 text-[10px]">MAIN BRANCH</div>
                  <div className="text-base font-bold text-white">{sig.mainBranchOccurrences}x</div>
                </div>
                <div className="bg-slate-900/80 border border-white/5 rounded-lg px-3 py-2 text-center">
                  <div className="text-slate-500 text-[10px]">PRS IMPACTED</div>
                  <div className="text-base font-bold text-white">{sig.uniquePrsAffected}</div>
                </div>
              </div>
            </div>
          </div>

          {/* AI Intelligence & Evidence Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Root Cause & Suggested Fix */}
            <div className="space-y-4">
              <div className="bg-[#0f1523] border border-cyan-500/20 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 mb-2">
                  <Sparkles className="w-4 h-4" />
                  <span>IDENTIFIED ROOT CAUSE CLUES</span>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed font-sans">
                  {sig.cachedRootCause || 'Awaiting automated synthesis on next pipeline failure.'}
                </p>

                <div className="mt-4 pt-4 border-t border-white/5">
                  <div className="text-xs font-mono text-emerald-400 mb-1 flex items-center gap-1.5">
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>SUGGESTED NEXT CHECK</span>
                  </div>
                  <p className="text-xs text-slate-300 font-sans">
                    {sig.cachedNextCheck || 'Run the test suite locally with concurrent workers.'}
                  </p>
                </div>
              </div>

              {/* Local Repro Card */}
              <div className="bg-[#0f1523] border border-white/10 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
                  <span>LOCAL REPRODUCTION COMMAND</span>
                  <button
                    onClick={() => handleCopyRepro('npm test -- checkout.spec.ts')}
                    className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 cursor-pointer text-[11px]"
                  >
                    {copiedRepro ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedRepro ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="bg-black/60 border border-white/5 rounded-lg p-3 font-mono text-xs text-emerald-400 flex items-center justify-between">
                  <code>npm test -- checkout.spec.ts</code>
                </div>
              </div>
            </div>

            {/* Right Column: Cross-Run Occurrences & Timeline */}
            <div className="bg-[#0f1523] border border-white/10 rounded-xl p-5 shadow-sm flex flex-col justify-between">
              <div>
                <div className="text-xs font-mono text-slate-400 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <span>CROSS-RUN EVIDENCE & RETRY HISTORY</span>
                </div>

                <div className="space-y-3 font-mono text-xs">
                  {sig.crossRunTimeline.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-slate-900/60 border border-white/5 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <GitCommit className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-cyan-400">{item.commitSha}</span>
                          {item.prNumber && (
                            <span className="text-slate-400 text-[10px]">
                              <GitPullRequest className="w-3 h-3 inline mr-0.5" />#{item.prNumber}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500">{item.failedAt}</span>
                      </div>

                      <pre className="text-[11px] text-slate-300 bg-black/40 p-2 rounded overflow-x-auto whitespace-pre-wrap leading-tight">
                        {item.sanitizedLogSnippet}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-[11px] text-slate-500 font-mono mt-4 pt-3 border-t border-white/5">
                First observed: {new Date(sig.firstSeenAt).toLocaleDateString()} &bull; Last seen: {new Date(sig.lastSeenAt).toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>
        )
      ) : (
        /* Sandbox Interactive Mode */
        <div className="space-y-6">
          <div className="bg-[#0f1523] border border-white/10 rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-mono text-slate-300 font-semibold">
                SELECT A REAL-WORLD TEST FAILURE PRESET:
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {Object.entries(SAMPLE_LOGS).map(([key, item]) => (
                  <button
                    key={key}
                    onClick={() => handlePresetChange(key)}
                    className={`px-3 py-1 text-xs font-mono rounded border transition-colors cursor-pointer ${
                      sandboxPreset === key
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                        : 'bg-slate-900 text-slate-400 border-white/5 hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
              <div>
                <label className="text-slate-400 text-[11px] block mb-1">Workflow Job Name</label>
                <input
                  type="text"
                  value={jobNameInput}
                  onChange={(e) => setJobNameInput(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="text-slate-400 text-[11px] block mb-1">Failed Step Name</label>
                <input
                  type="text"
                  value={stepNameInput}
                  onChange={(e) => setStepNameInput(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-400 text-[11px] font-mono block mb-1">
                Raw CI Log Snippet (ANSI codes & secrets will be scrubbed)
              </label>
              <textarea
                rows={7}
                value={rawLogInput}
                onChange={(e) => setRawLogInput(e.target.value)}
                className="w-full bg-black/60 border border-white/10 rounded-lg p-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleRunDiagnosis}
                disabled={diagnoseMutation.isPending || !rawLogInput.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-mono text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {diagnoseMutation.isPending ? 'Synthesizing Diagnosis...' : 'Diagnose CI Failure'}
              </button>
            </div>
          </div>

          {/* Diagnostic Result */}
          {diagnoseMutation.data && (
            <div className="bg-[#0f1523] border border-cyan-500/30 rounded-xl p-6 shadow-lg space-y-4 animate-in fade-in duration-300">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="text-xs font-mono text-cyan-400 font-bold flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  DIAGNOSTIC EVIDENCE REPORT
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-cyan-950/60 text-cyan-400 border border-cyan-800/40">
                  Fingerprint: {diagnoseMutation.data.signatureHash.slice(0, 16)}...
                </span>
              </div>

              <div>
                <div className="text-xs font-mono text-slate-400 mb-1">ROOT CAUSE HYPOTHESIS</div>
                <p className="text-xs text-white font-sans leading-relaxed">
                  {diagnoseMutation.data.diagnosis.root_cause_clues}
                </p>
              </div>

              <div>
                <div className="text-xs font-mono text-slate-400 mb-2">RELEVANT EVIDENCE FRAMES</div>
                <div className="space-y-1.5 font-mono text-xs">
                  {diagnoseMutation.data.diagnosis.relevant_log_lines.map((line: any, idx: number) => (
                    <div key={idx} className="p-2 rounded bg-slate-900/80 border border-white/5 flex items-start gap-3">
                      <span className="text-cyan-400 font-bold text-[11px]">L{line.line_number}</span>
                      <span className="text-slate-200 flex-1">{line.content}</span>
                      {line.explanation && (
                        <span className="text-slate-500 text-[10px] shrink-0">{line.explanation}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {diagnoseMutation.data.diagnosis.local_repro_command && (
                <div className="pt-2">
                  <div className="text-xs font-mono text-slate-400 mb-1">LOCAL REPRODUCTION COMMAND</div>
                  <code className="block p-2.5 rounded bg-black/60 text-emerald-400 font-mono text-xs border border-white/5">
                    {diagnoseMutation.data.diagnosis.local_repro_command}
                  </code>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
