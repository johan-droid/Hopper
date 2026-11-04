import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useDashboardQuery } from '../../api/hooks';
import { ShieldAlert, Zap, Lock, ArrowRight } from 'lucide-react';

export const OverviewView: React.FC = () => {
  const { selectedOrg, simulatedPlan, setSimulatedPlan, inspectSignature, setTab } = useAppStore();
  const { data: dashboard, isLoading, error } = useDashboardQuery(selectedOrg);

  const isFreePlan = simulatedPlan === 'free';
  const usedRuns = dashboard?.runsUsedThisPeriod ?? 14;
  const limitRuns = isFreePlan ? 30 : dashboard?.monthlyRunsLimit ?? 250;
  const quotaPercent = Math.min(100, Math.round((usedRuns / limitRuns) * 100));

  const items = dashboard?.flakyTestLeaderboard ?? [
    {
      rank: 1,
      identifier: 'src/auth/jwt-verifier.spec.ts > should verify valid signed JWT token',
      flakinessScore: 92.5,
      occurrences30d: 14,
      occurrences90d: 40,
      sameShaRetryPasses: 4,
      lastSeen: new Date().toISOString(),
      sigId: 'sig_7f8a91c20e14',
    },
    {
      rank: 2,
      identifier: 'tests/checkout.spec.ts › Checkout Flow › 3D Secure verification',
      flakinessScore: 78.0,
      occurrences30d: 9,
      occurrences90d: 25,
      sameShaRetryPasses: 2,
      lastSeen: new Date(Date.now() - 86400000).toISOString(),
      sigId: 'sig_a91b2c3d4e5f',
    },
    {
      rank: 3,
      identifier: 'cypress/e2e/payment.cy.ts › Stripe webhook verification race',
      flakinessScore: 68.4,
      occurrences30d: 7,
      occurrences90d: 19,
      sameShaRetryPasses: 3,
      lastSeen: new Date(Date.now() - 172800000).toISOString(),
      sigId: 'sig_112233445566',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Metric 1: Quota */}
        <div className="bg-[#0f1523] border border-white/10 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>MONTHLY INGESTION QUOTA</span>
            <span className="text-cyan-400 font-semibold">ENFORCED</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-2">
            {usedRuns} <span className="text-sm font-normal text-slate-400">/ {limitRuns} runs</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                quotaPercent > 80 ? 'bg-amber-400' : 'bg-cyan-400'
              }`}
              style={{ width: `${quotaPercent}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-2">
            {limitRuns - usedRuns} runs remaining before rate-limiting
          </div>
        </div>

        {/* Metric 2: Confidence */}
        <div className="bg-[#0f1523] border border-white/10 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>FLAKINESS MOAT SCORE</span>
            <span className="text-emerald-400 font-semibold">CONFIDENCE</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-2 flex items-center gap-2">
            82.4% <span className="text-xs px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 font-mono">HIGH</span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-4">
            Across 14 retry passes on identical commit SHAs
          </div>
        </div>

        {/* Metric 3: Deduplicated Signatures */}
        <div className="bg-[#0f1523] border border-white/10 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>DEDUPLICATED SIGNATURES</span>
            <span className="text-slate-500 font-semibold">30 DAYS</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-2">
            1,248 <span className="text-sm font-normal text-slate-400">failures</span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-4">
            Grouped into 42 distinct failure clusters
          </div>
        </div>

        {/* Metric 4: Avg Time to Diagnosis */}
        <div className="bg-[#0f1523] border border-white/10 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>AVG TIME-TO-DIAGNOSIS</span>
            <span className="text-blue-400 font-semibold">LATENCY</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-2">
            &lt; 3.8s <span className="text-sm font-normal text-slate-400">synthesis</span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-4">
            FastAPI/Express webhook to PR sticky comment
          </div>
        </div>
      </div>

      {/* Leaderboard Table Card */}
      <div className="bg-[#0f1523] border border-white/10 rounded-xl p-6 shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-cyan-400" />
              Flaky Test Leaderboard & Failure Patterns
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Ranked by cross-run flakiness confidence, retry success rates, and PR disruption impact.
            </p>
          </div>
          <button
            onClick={() => setTab('diagnose')}
            className="px-3 py-1.5 text-xs font-mono bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-400 border border-cyan-800/50 rounded-lg transition-colors cursor-pointer"
          >
            + Adhoc Diagnose
          </button>
        </div>

        {isLoading && (
          <div className="py-12 text-center text-slate-400 font-mono text-xs animate-pulse">
            Loading flaky test matrix from Hopper Cloud Moat...
          </div>
        )}

        {error && (
          <div className="p-4 rounded-lg bg-rose-950/30 border border-rose-800/40 text-rose-300 text-xs font-mono">
            Could not fetch live dashboard. Showing cached telemetry fallback.
          </div>
        )}

        <div className="overflow-x-auto relative">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-white/10 text-slate-400 uppercase text-[11px]">
                <th className="py-3 px-3 w-14">Rank</th>
                <th className="py-3 px-3">Test Identifier / Path</th>
                <th className="py-3 px-3">Flakiness Confidence</th>
                <th className="py-3 px-3">30d Fails</th>
                <th className="py-3 px-3">90d Fails</th>
                <th className="py-3 px-3">Same-SHA Passes</th>
                <th className="py-3 px-3">Last Seen</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {items.map((item, index) => {
                const isLocked = isFreePlan && index > 0;
                const isLikely = item.flakinessScore >= 65;
                const isIntermittent = item.flakinessScore >= 35 && item.flakinessScore < 65;

                return (
                  <tr
                    key={item.identifier}
                    className={`transition-colors ${
                      isLocked
                        ? 'paywall-blur opacity-50 select-none'
                        : 'hover:bg-white/[0.02]'
                    }`}
                  >
                    <td className="py-3.5 px-3">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-md font-bold ${
                          item.rank === 1
                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        #{item.rank}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 font-medium text-slate-200 max-w-md truncate" title={item.identifier}>
                      {item.identifier}
                    </td>
                    <td className="py-3.5 px-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] border ${
                          isLikely
                            ? 'bg-rose-950/40 text-rose-400 border-rose-800/40'
                            : isIntermittent
                            ? 'bg-amber-950/40 text-amber-400 border-amber-800/40'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        <ShieldAlert className="w-3 h-3" />
                        {item.flakinessScore}% {isLikely ? 'Likely Flaky' : isIntermittent ? 'Intermittent' : 'Deterministic'}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 font-semibold text-white">{item.occurrences30d}</td>
                    <td className="py-3.5 px-3 text-slate-500">{item.occurrences90d}</td>
                    <td className="py-3.5 px-3">
                      <span className="text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
                        {item.sameShaRetryPasses} passes
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-slate-500 text-[11px]">
                      {new Date(item.lastSeen).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      {isLocked ? (
                        <span className="text-slate-500 flex items-center justify-end gap-1">
                          <Lock className="w-3.5 h-3.5" /> Locked
                        </span>
                      ) : (
                        <button
                          onClick={() => inspectSignature(item.sigId || 'sig_7f8a91c20e14')}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors cursor-pointer text-[11px]"
                        >
                          Inspect ↗
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Paywall Overlay Banner (Shown on Free Tier) */}
          {isFreePlan && (
            <div className="absolute inset-x-0 bottom-4 flex justify-center px-4 pointer-events-auto">
              <div className="max-w-xl w-full bg-[#0a0f1d]/95 border border-amber-500/30 rounded-xl p-5 shadow-2xl backdrop-blur-md text-center">
                <div className="flex items-center justify-center gap-2 text-amber-400 font-bold text-sm mb-1">
                  <Lock className="w-4 h-4" />
                  Cross-Run Flaky Test History Locked on Free Tier
                </div>
                <p className="text-xs text-slate-300 mb-4 leading-relaxed">
                  Your repository has detected multiple cross-run failure patterns across branches. Unlock 30-day failure timelines, flaky test matrices, and real-time Slack alerts to prevent bad merges.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => setTab('billing')}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-xs transition-all shadow-lg shadow-cyan-500/20 cursor-pointer"
                  >
                    Upgrade to Pro ($9/mo) <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setSimulatedPlan('pro_dev')}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-white/10 transition-colors cursor-pointer"
                  >
                    Preview Unlocked Mode
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
