import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useRepositoriesQuery, useRepoFailuresQuery } from '../../api/hooks';
import { Activity, XCircle, CheckCircle, RefreshCw, GitCommit, GitPullRequest, Filter, FolderGit2, Loader2, AlertCircle } from 'lucide-react';

interface ActivityRun {
  id: string;
  githubRunId: string;
  repoFullName: string;
  workflowName: string;
  jobName: string;
  failedStepName?: string;
  commitSha: string;
  branch: string;
  prNumber?: number;
  status: 'failure' | 'success' | 'flaky_resolved';
  flakinessScore?: number;
  failedAt: string;
  signatureId?: string;
}

export const PipelineActivityView: React.FC = () => {
  const { selectedWorkspaceId, inspectFailure } = useAppStore();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterBranch, setFilterBranch] = useState<string>('all');
  const [selectedRepoId, setSelectedRepoId] = useState<string>('');

  const { data: reposData, isLoading: isReposLoading, isError: isReposError } = useRepositoriesQuery(selectedWorkspaceId || undefined);
  const repositories = reposData?.repositories || [];

  useEffect(() => {
    if (repositories.length > 0 && !selectedRepoId) {
      setSelectedRepoId(repositories[0].id);
    }
  }, [repositories, selectedRepoId]);

  const { data: failuresData, isLoading: isFailuresLoading, isError: isFailuresError, refetch } = useRepoFailuresQuery(selectedRepoId);

  const selectedRepo = repositories.find((r) => r.id === selectedRepoId);

  // Transform live backend failures into ActivityRun list
  const liveRuns: ActivityRun[] = (failuresData?.failures || []).map((f) => ({
    id: f.id,
    githubRunId: String(f.githubRunId),
    repoFullName: selectedRepo?.full_name || 'connected-repo',
    workflowName: f.workflowName || 'CI',
    jobName: f.jobName || 'test',
    failedStepName: f.failedStepName,
    commitSha: f.commitSha ? f.commitSha.slice(0, 7) : 'head',
    branch: f.branch || 'main',
    prNumber: f.prNumber || undefined,
    status: f.exitCode === 0 ? 'success' : 'failure',
    flakinessScore: undefined,
    failedAt: f.failedAt ? new Date(f.failedAt).toLocaleTimeString() : 'Recently',
    signatureId: f.id,
  }));

  const filteredRuns = liveRuns.filter((run) => {
    if (filterStatus !== 'all' && run.status !== filterStatus) return false;
    if (filterBranch === 'main' && run.branch !== 'main') return false;
    if (filterBranch === 'prs' && !run.prNumber) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            Pipeline Activity Feed
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time ingress and triage stream of GitHub Actions workflow runs and jobs.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Repository Selector */}
          {repositories.length > 0 && (
            <div className="flex items-center gap-2 bg-[#0f1523] border border-white/10 rounded-lg px-3 py-1.5 text-xs">
              <FolderGit2 className="w-3.5 h-3.5 text-cyan-400" />
              <select
                value={selectedRepoId}
                onChange={(e) => setSelectedRepoId(e.target.value)}
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer font-mono"
              >
                {repositories.map((repo) => (
                  <option key={repo.id} value={repo.id}>
                    {repo.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 bg-[#0f1523] border border-white/10 rounded-lg px-3 py-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-transparent text-slate-300 focus:outline-none cursor-pointer font-mono"
            >
              <option value="all">All Statuses</option>
              <option value="failure">Failed Only</option>
              <option value="flaky_resolved">Flaky Resolved</option>
              <option value="success">Successful</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-[#0f1523] border border-white/10 rounded-lg px-3 py-1.5 text-xs">
            <select
              value={filterBranch}
              onChange={(e) => setFilterBranch(e.target.value)}
              className="bg-transparent text-slate-300 focus:outline-none cursor-pointer font-mono"
            >
              <option value="all">All Branches</option>
              <option value="main">Main Branch Only</option>
              <option value="prs">Pull Requests Only</option>
            </select>
          </div>

          <button
            onClick={() => refetch()}
            className="p-1.5 rounded-lg bg-[#0f1523] border border-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Refresh feed"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Loading & Error States */}
      {(isReposLoading || isFailuresLoading) && (
        <div className="bg-[#0f1523] border border-white/10 rounded-xl p-12 text-center">
          <Loader2 className="w-6 h-6 text-cyan-400 animate-spin mx-auto mb-3" />
          <p className="text-xs font-mono text-slate-400">Loading live pipeline activity from Hopper Engine...</p>
        </div>
      )}

      {(isReposError || isFailuresError) && (
        <div className="bg-rose-950/30 border border-rose-800/40 rounded-xl p-6 text-center text-rose-300 text-xs font-mono flex items-center justify-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400" />
          Failed to load live failure feed. Please ensure you are signed in and have access to this workspace.
        </div>
      )}

      {/* Empty State */}
      {!isReposLoading && !isFailuresLoading && repositories.length === 0 && (
        <div className="bg-[#0f1523] border border-white/10 rounded-xl p-12 text-center">
          <FolderGit2 className="w-8 h-8 text-slate-500 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-white font-mono">No Connected Repositories</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Connect a GitHub repository to this workspace to view real-time CI/CD workflow activity and failure diagnoses.
          </p>
        </div>
      )}

      {!isReposLoading && !isFailuresLoading && repositories.length > 0 && liveRuns.length === 0 && (
        <div className="bg-[#0f1523] border border-white/10 rounded-xl p-12 text-center">
          <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-white font-mono">Clean Pipeline — No Recorded Failures</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            {selectedRepo?.full_name} has no CI failures recorded yet. The Hopper webhook ingress gateway is listening for incoming workflow runs.
          </p>
        </div>
      )}

      {/* Activity Table */}
      {!isReposLoading && !isFailuresLoading && filteredRuns.length > 0 && (
        <div className="bg-[#0f1523] border border-white/10 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/60 border-b border-white/10 text-slate-400 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Repository & Workflow</th>
                  <th className="px-5 py-3">Failed Step</th>
                  <th className="px-5 py-3">Commit / Ref</th>
                  <th className="px-5 py-3">Triage Verdict</th>
                  <th className="px-5 py-3 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {filteredRuns.map((run) => (
                  <tr
                    key={run.id}
                    onClick={() => run.signatureId && inspectFailure(run.signatureId)}
                    className={`hover:bg-slate-800/40 transition-colors ${
                      run.signatureId ? 'cursor-pointer group' : ''
                    }`}
                  >
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {run.status === 'failure' && (
                        <span className="flex items-center gap-1.5 text-rose-400 font-semibold">
                          <XCircle className="w-4 h-4 shrink-0" /> Failed
                        </span>
                      )}
                      {run.status === 'flaky_resolved' && (
                        <span className="flex items-center gap-1.5 text-amber-400 font-semibold">
                          <RefreshCw className="w-4 h-4 shrink-0" /> Pass-on-Retry
                        </span>
                      )}
                      {run.status === 'success' && (
                        <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                          <CheckCircle className="w-4 h-4 shrink-0" /> Passed
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-white group-hover:text-cyan-400 transition-colors">
                        {run.repoFullName}
                      </div>
                      <div className="text-slate-400 text-[11px] mt-0.5">
                        {run.workflowName} &bull; {run.jobName}
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      {run.failedStepName ? (
                        <span className="px-2 py-0.5 rounded bg-rose-950/40 text-rose-300 border border-rose-800/40 text-[11px]">
                          {run.failedStepName}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <GitCommit className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-cyan-400">{run.commitSha}</span>
                        {run.prNumber ? (
                          <span className="flex items-center gap-1 text-slate-400 text-[10px]">
                            <GitPullRequest className="w-3 h-3 text-slate-500" /> #{run.prNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">({run.branch})</span>
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      {run.flakinessScore !== undefined ? (
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              run.flakinessScore >= 60
                                ? 'bg-amber-950/60 text-amber-400 border border-amber-800/40'
                                : 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                            }`}
                          >
                            {run.flakinessScore >= 60 ? 'FLAKY' : 'DETERMINISTIC'} ({run.flakinessScore}%)
                          </span>
                          <span className="text-slate-500 text-[10px] group-hover:text-cyan-400 transition-colors">
                            Inspect &rarr;
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px] group-hover:text-cyan-400 transition-colors">
                          Inspect failure &rarr;
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-3.5 text-right text-slate-400 whitespace-nowrap">
                      {run.failedAt}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
