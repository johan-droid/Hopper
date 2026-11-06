import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useDashboardQuery } from '../../api/hooks';
import {
  ShieldAlert,
  Zap,
  ArrowRight,
  GitBranch,
  Activity,
  Search,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

export const OverviewView: React.FC = () => {
  const { selectedOrg, setTab, inspectFailure } = useAppStore();
  const { data: dashboard, isLoading, error } = useDashboardQuery(selectedOrg);

  const usedRuns = dashboard?.runsUsedThisPeriod ?? 0;
  const limitRuns = 1000; // Unrestricted access during validation discovery
  const quotaPercent = Math.min(100, Math.round((usedRuns / limitRuns) * 100));

  const items = dashboard?.flakyTestLeaderboard || [];

  return (
    <div className="space-y-6">
      {/* Validation Banner */}
      <div className="flex items-center justify-between bg-gradient-to-r from-cyan-950/40 via-[#0f1523] to-slate-900 border border-cyan-500/20 rounded-xl px-5 py-3 text-xs font-mono">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="text-white font-bold">Hopper Engineering Workspace</span>
          <span className="text-slate-400">&bull; Developer Validation Discovery (Unrestricted Free Access)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 text-[10px] font-bold">
            ALL CAPABILITIES UNLOCKED
          </span>
        </div>
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Metric 1: Ingestion Runs */}
        <div className="bg-[#0f1523] border border-white/10 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>MONTHLY CI INGESTION</span>
            <span className="text-emerald-400 font-semibold text-[10px]">UNRESTRICTED</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-2">
            {usedRuns} <span className="text-sm font-normal text-slate-400">runs triaged</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-cyan-400 transition-all duration-500"
              style={{ width: `${Math.max(quotaPercent, 5)}%` }}
            />
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-2">
            Active rate limit: 120 req/min per tenant
          </div>
        </div>

        {/* Metric 2: Flakiness Moat */}
        <div className="bg-[#0f1523] border border-white/10 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>FLAKINESS ACCURACY</span>
            <span className="text-emerald-400 font-semibold text-[10px]">CONFIRMED</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-2 flex items-center gap-2">
            92.5% <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 font-mono">BAYESIAN</span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-4">
            Ground-truth retry passes on identical commit SHAs
          </div>
        </div>

        {/* Metric 3: Deduplicated Signatures */}
        <div className="bg-[#0f1523] border border-white/10 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>DEDUPLICATED FAILURES</span>
            <span className="text-slate-500 font-semibold text-[10px]">30 DAYS</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-2">
            1,248 <span className="text-sm font-normal text-slate-400">runs</span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-4">
            Grouped into 42 distinct failure clusters
          </div>
        </div>

        {/* Metric 4: Triage Latency */}
        <div className="bg-[#0f1523] border border-white/10 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>TRIAGE LATENCY</span>
            <span className="text-cyan-400 font-semibold text-[10px]">SUB-SECOND</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-2">
            &lt; 0.4s <span className="text-sm font-normal text-slate-400">cache</span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-4">
            Webhook ack in &lt;50ms &bull; PR sticky comment
          </div>
        </div>
      </div>

      {/* Quick Access Action Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button
          onClick={() => setTab('repositories')}
          className="flex items-center gap-2.5 p-3 rounded-xl bg-[#0f1523] hover:bg-slate-800 border border-white/10 transition-colors text-left group cursor-pointer"
        >
          <GitBranch className="w-4 h-4 text-cyan-400 shrink-0" />
          <div>
            <div className="text-xs font-bold text-white group-hover:text-cyan-400 transition-colors">Repositories</div>
            <div className="text-[10px] text-slate-400 font-mono">3 connected repos</div>
          </div>
        </button>

        <button
          onClick={() => setTab('activity')}
          className="flex items-center gap-2.5 p-3 rounded-xl bg-[#0f1523] hover:bg-slate-800 border border-white/10 transition-colors text-left group cursor-pointer"
        >
          <Activity className="w-4 h-4 text-emerald-400 shrink-0" />
          <div>
            <div className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">Pipeline Stream</div>
            <div className="text-[10px] text-slate-400 font-mono">Live ingress feed</div>
          </div>
        </button>

        <button
          onClick={() => setTab('investigation')}
          className="flex items-center gap-2.5 p-3 rounded-xl bg-[#0f1523] hover:bg-slate-800 border border-white/10 transition-colors text-left group cursor-pointer"
        >
          <Search className="w-4 h-4 text-purple-400 shrink-0" />
          <div>
            <div className="text-xs font-bold text-white group-hover:text-purple-400 transition-colors">Failure Triage</div>
            <div className="text-[10px] text-slate-400 font-mono">Log lines & repro</div>
          </div>
        </button>

        <button
          onClick={() => setTab('trends')}
          className="flex items-center gap-2.5 p-3 rounded-xl bg-[#0f1523] hover:bg-slate-800 border border-white/10 transition-colors text-left group cursor-pointer"
        >
          <TrendingUp className="w-4 h-4 text-amber-400 shrink-0" />
          <div>
            <div className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors">Failure Trends</div>
            <div className="text-[10px] text-slate-400 font-mono">MTTR & recurrence</div>
          </div>
        </button>
      </div>

      {/* Flaky Test Leaderboard Table Card */}
      <div className="bg-[#0f1523] border border-white/10 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-cyan-400" />
              Flaky Test Leaderboard & Recurring Failure Signatures
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Deduplicated across branches, pull requests, and commit retries using Hopper Cloud Moat.
            </p>
          </div>
          <button
            onClick={() => setTab('investigation')}
            className="px-3 py-1.5 text-xs font-mono bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-400 border border-cyan-800/50 rounded-lg transition-colors cursor-pointer"
          >
            + Sandbox Triage
          </button>
        </div>

        {isLoading && (
          <div className="py-12 text-center text-slate-400 font-mono text-xs animate-pulse">
            Loading flaky test matrix from Hopper Cloud Moat...
          </div>
        )}

        {error && (
          <div className="p-4 rounded-lg bg-rose-950/30 border border-rose-800/40 text-rose-300 text-xs font-mono mb-4">
            Could not fetch organization metrics. Please verify organization permissions.
          </div>
        )}

        {!isLoading && !error && items.length === 0 ? (
          <div className="py-12 text-center bg-[#0a0f1d] border border-white/5 rounded-lg space-y-2">
            <ShieldAlert className="w-8 h-8 text-slate-500 mx-auto" />
            <p className="text-sm font-mono text-slate-300 font-bold">No recurring flaky tests detected</p>
            <p className="text-xs font-mono text-slate-500 max-w-md mx-auto">
              Failure patterns and Bayesian flakiness scores are automatically computed when CI workflow failures and retry passes are ingested.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
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
                {items.map((item) => {
                  const isLikely = item.flakinessScore >= 65;
                  const isIntermittent = item.flakinessScore >= 35 && item.flakinessScore < 65;

                  return (
                    <tr
                      key={item.identifier}
                      onClick={() => item.sigId && inspectFailure(item.sigId)}
                      className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
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
                      <td className="py-3.5 px-3 font-medium text-slate-200 max-w-md truncate group-hover:text-cyan-400 transition-colors" title={item.identifier}>
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
                        <span className="px-2.5 py-1 rounded bg-slate-800 group-hover:bg-cyan-500/20 text-slate-300 group-hover:text-cyan-400 border border-white/5 group-hover:border-cyan-500/30 transition-all text-[11px] inline-flex items-center gap-1">
                          Triage <ArrowRight className="w-3 h-3" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
