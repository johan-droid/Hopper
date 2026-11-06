import React, { useState } from 'react';
import { useRepositoriesQuery } from '../../api/hooks';
import { useAppStore } from '../../store/useAppStore';
import { GitBranch, GitCommit, AlertTriangle, CheckCircle, Search, RefreshCw, ExternalLink } from 'lucide-react';

export const RepositoriesView: React.FC = () => {
  const { selectedWorkspaceId, setSelectedRepoId, setTab } = useAppStore();
  const { data, isLoading, isError, refetch } = useRepositoriesQuery(selectedWorkspaceId || undefined);
  const [searchQuery, setSearchQuery] = useState('');

  const repositories = data?.repositories || [];

  const filteredRepos = repositories.filter((r) =>
    r.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectRepo = (repoId: string) => {
    setSelectedRepoId(repoId);
    setTab('activity');
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-cyan-400" />
            Connected Repositories
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Repositories monitored by Hopper GitHub App installation. CI failures are automatically triaged.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search repositories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#0f1523] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-64"
            />
          </div>

          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#0f1523] hover:bg-slate-800 border border-white/10 rounded-lg text-xs font-mono text-slate-300 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Sync
          </button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-[#0f1523] border border-white/5 rounded-xl p-5 space-y-4 animate-pulse">
              <div className="h-4 bg-slate-800 rounded w-2/3" />
              <div className="h-3 bg-slate-800/60 rounded w-1/2" />
              <div className="h-3 bg-slate-800/60 rounded w-3/4" />
            </div>
          ))}
        </div>
      )}

      {/* Error Notice */}
      {isError && (
        <div className="bg-rose-950/40 border border-rose-500/30 rounded-xl p-6 text-center space-y-2">
          <AlertTriangle className="w-7 h-7 text-rose-400 mx-auto" />
          <p className="text-sm font-bold text-white">Could not load repositories for this workspace</p>
          <p className="text-xs text-slate-400">Verify your network connection or workspace permissions.</p>
          <button
            onClick={() => refetch()}
            className="mt-2 px-3 py-1.5 bg-rose-900/50 hover:bg-rose-800/50 border border-rose-700/50 rounded-lg text-xs font-mono text-rose-200 transition-colors cursor-pointer"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Repository Cards Grid */}
      {!isLoading && !isError && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filteredRepos.map((repo) => (
            <div
              key={repo.id}
              onClick={() => handleSelectRepo(repo.id)}
              className="bg-[#0f1523] border border-white/10 hover:border-cyan-500/50 rounded-xl p-5 shadow-sm transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <span className="font-mono text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">
                    {repo.full_name}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 flex items-center gap-1">
                    <CheckCircle className="w-2.5 h-2.5" /> Active
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-xs text-slate-400 font-mono">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-3.5 h-3.5 text-slate-500" />
                    <span>Default branch: <span className="text-slate-200">{repo.default_branch}</span></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <GitCommit className="w-3.5 h-3.5 text-slate-500" />
                    <span>GitHub ID: <span className="text-slate-200">{repo.github_repo_id}</span></span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-xs font-mono">
                <span className="text-cyan-400 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                  View pipeline activity &rarr;
                </span>
                <a
                  href={`https://github.com/${repo.full_name}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-slate-500 hover:text-slate-300"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !isError && filteredRepos.length === 0 && (
        <div className="text-center py-12 bg-[#0f1523] border border-white/10 rounded-xl space-y-3">
          <GitBranch className="w-8 h-8 text-slate-500 mx-auto" />
          <p className="text-sm text-slate-300 font-medium">No repositories connected to this workspace</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Connect repositories via the Hopper GitHub App installation or link them from Workspace Settings to start automated failure triage.
          </p>
          <button
            onClick={() => setTab('integrations')}
            className="mt-2 px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 rounded-lg text-xs font-mono text-cyan-300 transition-colors cursor-pointer"
          >
            Go to Integrations &rarr;
          </button>
        </div>
      )}
    </div>
  );
};

