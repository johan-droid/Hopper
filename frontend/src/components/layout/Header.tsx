import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useHealthQuery } from '../../api/hooks';
import { Zap, Activity, LogOut, LogIn } from 'lucide-react';

export const Header: React.FC = () => {
  const {
    selectedOrg,
    setSelectedOrg,
    setTab,
    supabaseUser,
    signOut,
    setAuthModalOpen,
  } = useAppStore();
  const { data: health, isLoading } = useHealthQuery();

  const isHealthy = health?.status === 'healthy';

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-[#0f1523]/80 backdrop-blur-md sticky top-0 z-50">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setTab('landing')}
          className="flex items-center gap-3 group text-left cursor-pointer"
          title="Return to Hopper Landing Page"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base tracking-wider text-white group-hover:text-cyan-300 transition-colors">
                HOPPER
              </span>
              <span className="text-[10px] font-mono tracking-widest text-cyan-400 bg-cyan-950/80 border border-cyan-800/50 px-1.5 py-0.5 rounded">
                CI/CD INTELLIGENCE
              </span>
            </div>
          </div>
        </button>

        <button
          onClick={() => setTab('landing')}
          className="ml-2 text-xs font-mono text-slate-400 hover:text-cyan-400 border border-white/10 hover:border-cyan-500/30 px-2 py-0.5 rounded transition-colors cursor-pointer"
        >
          ← Landing Page
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        {/* Gateway Health Indicator */}
        <div
          className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono border ${
            isLoading
              ? 'bg-slate-800 text-slate-400 border-slate-700'
              : isHealthy
              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50'
              : 'bg-rose-950/40 text-rose-400 border-rose-800/50'
          }`}
        >
          <Activity className="w-3.5 h-3.5 animate-pulse" />
          <span>{isLoading ? 'CONNECTING...' : isHealthy ? 'GATEWAY: HEALTHY' : 'GATEWAY: DEGRADED'}</span>
        </div>

        {/* Org Selector */}
        <div className="flex items-center gap-1.5 bg-[#080c14] border border-white/10 px-2.5 py-1 rounded-md text-xs font-mono">
          <span className="text-slate-500">ORG:</span>
          <select
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value)}
            className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
          >
            <option value="acme-corp" className="bg-[#0f1523]">acme-corp</option>
            <option value="github-actions-demo" className="bg-[#0f1523]">github-actions-demo</option>
            <option value="hopper-oss" className="bg-[#0f1523]">hopper-oss</option>
          </select>
        </div>

        {/* Validation Tier Badge */}
        <div className="px-3 py-1 rounded-md text-xs font-mono bg-cyan-950/40 text-cyan-300 border border-cyan-800/40 flex items-center gap-1.5 font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span>PREVIEW: UNRESTRICTED</span>
        </div>

        {/* User Auth Profile / Login */}
        <div className="ml-2 pl-3 border-l border-white/10 flex items-center">
          {supabaseUser ? (
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700 px-2.5 py-1 rounded-md text-xs font-mono text-slate-200"
                title={`Signed in as ${supabaseUser.email || supabaseUser.id}`}
              >
                <div className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[10px] font-bold">
                  {supabaseUser.email ? supabaseUser.email[0].toUpperCase() : 'U'}
                </div>
                <span className="max-w-[120px] truncate">{supabaseUser.email || 'User'}</span>
              </div>
              <button
                onClick={() => signOut()}
                className="text-slate-400 hover:text-rose-400 p-1.5 rounded hover:bg-white/5 transition-colors cursor-pointer"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAuthModalOpen(true)}
              className="flex items-center gap-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-3 py-1 rounded-md text-xs font-mono font-medium shadow-sm transition-all cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
