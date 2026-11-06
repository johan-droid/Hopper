import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useDiagnosisHistoryQuery } from '../../api/hooks';
import { History, Search, Filter, Sparkles, Zap, ArrowRight, AlertTriangle, Terminal } from 'lucide-react';

export const DiagnosisHistoryView: React.FC = () => {
  const { selectedWorkspaceId, inspectFailure, setTab } = useAppStore();
  const { data, isLoading, isError, refetch } = useDiagnosisHistoryQuery(selectedWorkspaceId || undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const historyItems = data?.diagnoses || [];

  const filteredHistory = historyItems.filter((item) => {
    if (selectedCategory !== 'all' && item.errorCategory !== selectedCategory) return false;
    const query = searchQuery.toLowerCase();
    if (
      query &&
      !(item.failedStepName || item.jobName || '').toLowerCase().includes(query) &&
      !(item.rootCauseClues || '').toLowerCase().includes(query) &&
      !(item.repoFullName || '').toLowerCase().includes(query)
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header and Filter Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <History className="w-5 h-5 text-cyan-400" />
            Diagnosis Ledger & Telemetry
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Historical audit log of all CI failure syntheses, cache hits, and token expenditure.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filter diagnoses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#0f1523] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-56 font-mono"
            />
          </div>

          <div className="flex items-center gap-2 bg-[#0f1523] border border-white/10 rounded-lg px-3 py-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-transparent text-slate-300 focus:outline-none cursor-pointer font-mono text-xs"
            >
              <option value="all">All Categories</option>
              <option value="test_assertion">Test Assertion</option>
              <option value="build_compile">Build Compile</option>
              <option value="dependency_resolution">Dependency</option>
              <option value="env_config">Environment Config</option>
              <option value="resource_exhaustion">Resource Exhaustion</option>
              <option value="database_connectivity">Database</option>
              <option value="network_infra">Network Infra</option>
              <option value="flaky_test">Flaky Test</option>
            </select>
          </div>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-[#0f1523] border border-white/5 rounded-xl p-5 space-y-3 animate-pulse">
              <div className="h-4 bg-slate-800 rounded w-1/3" />
              <div className="h-3 bg-slate-800/60 rounded w-2/3" />
              <div className="h-3 bg-slate-800/40 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Error Notice */}
      {isError && (
        <div className="bg-rose-950/40 border border-rose-500/30 rounded-xl p-6 text-center space-y-2">
          <AlertTriangle className="w-7 h-7 text-rose-400 mx-auto" />
          <p className="text-sm font-bold text-white">Could not load diagnosis history</p>
          <p className="text-xs text-slate-400">Verify your workspace permissions or network connectivity.</p>
          <button
            onClick={() => refetch()}
            className="mt-2 px-3 py-1.5 bg-rose-900/50 hover:bg-rose-800/50 border border-rose-700/50 rounded-lg text-xs font-mono text-rose-200 transition-colors cursor-pointer"
          >
            Retry Loading
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !isError && filteredHistory.length === 0 && (
        <div className="text-center py-12 bg-[#0f1523] border border-white/10 rounded-xl space-y-3">
          <Terminal className="w-8 h-8 text-slate-500 mx-auto" />
          <p className="text-sm text-slate-300 font-medium">No diagnostic reports found</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            When GitHub CI pipelines trigger failure webhooks or when you run an ad-hoc failure triage, evidence-backed AI diagnoses with root-cause clues will appear here.
          </p>
          <button
            onClick={() => setTab('investigation')}
            className="mt-2 px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 rounded-lg text-xs font-mono text-cyan-300 transition-colors cursor-pointer"
          >
            Open Diagnostic Sandbox &rarr;
          </button>
        </div>
      )}

      {/* Ledger Cards */}
      {!isLoading && !isError && filteredHistory.length > 0 && (
        <div className="space-y-3">
          {filteredHistory.map((item) => {
            const isCached = item.llmModelUsed?.includes('cache') || (item.promptTokens === 0 && item.completionTokens === 0);
            const totalTokens = (item.promptTokens || 0) + (item.completionTokens || 0);

            return (
              <div
                key={item.id}
                onClick={() => item.signatureHash && inspectFailure(item.signatureHash)}
                className="bg-[#0f1523] border border-white/10 hover:border-cyan-500/40 rounded-xl p-5 shadow-sm transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-white/5 uppercase">
                        {item.errorCategory}
                      </span>
                      {isCached ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950/60 text-cyan-400 border border-cyan-800/40 flex items-center gap-1 font-semibold">
                          <Zap className="w-2.5 h-2.5" /> CACHE HIT ($0.00)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950/60 text-purple-300 border border-purple-800/40 flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" /> {item.llmModelUsed || 'Claude 3.5 Haiku'}
                        </span>
                      )}
                      <span className="text-slate-500 text-xs font-mono">
                        &bull; {new Date(item.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <div className="font-mono text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">
                      {item.repoFullName ? `${item.repoFullName} › ` : ''}{item.failedStepName || item.jobName || 'CI Failure Step'}
                    </div>

                    <p className="text-xs text-slate-300 font-sans line-clamp-2">
                      <span className="text-slate-500 font-mono">Root Cause:</span> {item.rootCauseClues}
                    </p>
                  </div>

                  {/* Telemetry pill */}
                  <div className="flex items-center gap-4 text-xs font-mono text-slate-400 shrink-0 bg-slate-900/60 px-3 py-2 rounded-lg border border-white/5">
                    <div>
                      <span className="text-[10px] text-slate-500 block">TOKENS</span>
                      <span className="text-slate-200">{totalTokens}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">FLAKINESS</span>
                      <span className="text-amber-400 font-bold">{item.flakinessScore}%</span>
                    </div>
                    <div className="text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
