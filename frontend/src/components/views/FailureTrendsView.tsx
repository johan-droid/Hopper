import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useDashboardQuery } from '../../api/hooks';
import { TrendingUp, Flame, ArrowRight } from 'lucide-react';

export const FailureTrendsView: React.FC = () => {
  const { selectedOrg, inspectFailure } = useAppStore();
  const { data: dashboard, isLoading, error } = useDashboardQuery(selectedOrg);
  const [selectedWindow, setSelectedWindow] = useState<'30d' | '90d'>('30d');

  const leaderboard = dashboard?.flakyTestLeaderboard || [];

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-cyan-400" />
            Flakiness Leaderboards & Recurrence Trends
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Bayesian flakiness scoring computed from same-commit SHA retry passes across PRs.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-[#0f1523] border border-white/10 rounded-lg p-1 text-xs font-mono">
          <button
            onClick={() => setSelectedWindow('30d')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              selectedWindow === '30d'
                ? 'bg-cyan-500/20 text-cyan-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Last 30 Days
          </button>
          <button
            onClick={() => setSelectedWindow('90d')}
            className={`px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
              selectedWindow === '90d'
                ? 'bg-cyan-500/20 text-cyan-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Last 90 Days
          </button>
        </div>
      </div>

      {/* Flaky Test Leaderboard Table */}
      <div className="bg-[#0f1523] border border-white/10 rounded-xl overflow-hidden shadow-sm">
        {isLoading && (
          <div className="py-12 text-center text-slate-400 font-mono text-xs animate-pulse">
            Analyzing Bayesian flakiness trends across {selectedWindow}...
          </div>
        )}

        {error && (
          <div className="p-4 m-4 rounded-lg bg-rose-950/30 border border-rose-800/40 text-rose-300 text-xs font-mono">
            Could not load flakiness trends. Verify organization permissions.
          </div>
        )}

        {!isLoading && !error && leaderboard.length === 0 ? (
          <div className="py-12 text-center p-6 space-y-2">
            <TrendingUp className="w-8 h-8 text-slate-500 mx-auto" />
            <p className="text-sm font-mono text-slate-300 font-bold">No recurring flaky tests detected</p>
            <p className="text-xs font-mono text-slate-500 max-w-md mx-auto">
              As CI failures occur across PRs and retry passes succeed on identical commits, Bayesian flakiness scores and trends will populate here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/60 border-b border-white/10 text-slate-400 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-5 py-3 w-12 text-center">Rank</th>
                  <th className="px-5 py-3">Flaky Test Identifier</th>
                  <th className="px-5 py-3 text-center">Flakiness Score</th>
                  <th className="px-5 py-3 text-center">Occurrences ({selectedWindow})</th>
                  <th className="px-5 py-3 text-center">Retry Passes (Same SHA)</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {leaderboard.map((item) => (
                  <tr
                    key={item.rank}
                    onClick={() => item.sigId && inspectFailure(item.sigId)}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                  >
                    <td className="px-5 py-3.5 text-center font-bold text-slate-400">
                      #{item.rank}
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-white group-hover:text-cyan-400 transition-colors line-clamp-1">
                        {item.identifier}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Last detected: {new Date(item.lastSeen).toLocaleDateString()}
                      </div>
                    </td>

                    <td className="px-5 py-3.5 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold inline-flex items-center gap-1 ${
                          item.flakinessScore >= 80
                            ? 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                            : item.flakinessScore >= 50
                            ? 'bg-amber-950/60 text-amber-400 border border-amber-800/40'
                            : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                        }`}
                      >
                        {item.flakinessScore >= 80 && <Flame className="w-3 h-3" />}
                        {item.flakinessScore}%
                      </span>
                    </td>

                    <td className="px-5 py-3.5 text-center font-bold text-slate-200">
                      {selectedWindow === '30d' ? item.occurrences30d : item.occurrences90d}x
                    </td>

                    <td className="px-5 py-3.5 text-center">
                      <span className="px-2 py-0.5 rounded bg-cyan-950/40 text-cyan-300 border border-cyan-800/40 text-[11px] font-bold">
                        {item.sameShaRetryPasses} passes
                      </span>
                    </td>

                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <span className="text-cyan-400 text-xs font-semibold group-hover:translate-x-1 inline-flex items-center gap-1 transition-transform">
                        Triage <ArrowRight className="w-3 h-3" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
