import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useHealthQuery } from '../../api/hooks';
import { Zap, Activity } from 'lucide-react';

export const Header: React.FC = () => {
  const { selectedOrg, setSelectedOrg, simulatedPlan, setSimulatedPlan } = useAppStore();
  const { data: health, isLoading } = useHealthQuery();

  const isHealthy = health?.status === 'healthy';

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-[#0f1523]/80 backdrop-blur-md sticky top-0 z-50">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-base tracking-wider text-white">HOPPER</span>
            <span className="text-[10px] font-mono tracking-widest text-cyan-400 bg-cyan-950/80 border border-cyan-800/50 px-1.5 py-0.5 rounded">
              CI/CD INTELLIGENCE
            </span>
          </div>
        </div>
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

        {/* Current Plan Badge */}
        <div
          className={`px-3 py-1 rounded-md text-xs font-mono border ${
            simulatedPlan === 'free'
              ? 'bg-amber-950/30 text-amber-400 border-amber-800/40'
              : simulatedPlan === 'pro_dev'
              ? 'bg-blue-950/30 text-blue-400 border-blue-800/40'
              : 'bg-emerald-950/30 text-emerald-400 border-emerald-800/40'
          }`}
        >
          {simulatedPlan === 'free'
            ? 'FREE TIER (30 RUNS)'
            : simulatedPlan === 'pro_dev'
            ? 'PRO DEV (250 RUNS)'
            : 'TEAM (1000 RUNS)'}
        </div>

        {/* Pro Mode Simulation Toggle */}
        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer ml-1 select-none">
          <input
            type="checkbox"
            checked={simulatedPlan !== 'free'}
            onChange={(e) => setSimulatedPlan(e.target.checked ? 'pro_dev' : 'free')}
            className="accent-cyan-500 rounded cursor-pointer"
          />
          <span>Simulate Pro Mode</span>
        </label>
      </div>
    </header>
  );
};
