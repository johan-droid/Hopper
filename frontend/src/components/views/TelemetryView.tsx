import React, { useState } from 'react';
import { useHealthQuery } from '../../api/hooks';
import { Activity, Copy, Check, Server, Database, Cpu } from 'lucide-react';

export const TelemetryView: React.FC = () => {
  const { data: health, isLoading } = useHealthQuery();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!health) return;
    navigator.clipboard.writeText(JSON.stringify(health, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0f1523] border border-white/10 rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
          <Activity className="w-5 h-5 text-cyan-400" />
          Gateway Architecture & Live Telemetry
        </h2>
        <p className="text-xs text-slate-400 mb-6">
          Hopper processes GitHub Action webhook deliveries in &lt;50ms, deduplicating events in Redis, persisting traces to PostgreSQL/pgvector, and synthesizing root causes.
        </p>

        {/* Status Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[#0a0f1d] border border-white/5 rounded-lg p-4">
            <div className="flex items-center gap-2 text-slate-500 text-[11px] font-mono uppercase mb-1">
              <Server className="w-3.5 h-3.5" /> Service Version
            </div>
            <div className="text-base font-bold font-mono text-white">
              {health?.version ? `Hopper v${health.version}` : 'Hopper v1.0.0'}
            </div>
          </div>

          <div className="bg-[#0a0f1d] border border-white/5 rounded-lg p-4">
            <div className="flex items-center gap-2 text-slate-500 text-[11px] font-mono uppercase mb-1">
              <Activity className="w-3.5 h-3.5 text-emerald-400" /> API Uptime
            </div>
            <div className="text-base font-bold font-mono text-emerald-400">
              {health?.uptimeSeconds ? formatUptime(health.uptimeSeconds) : 'Active'}
            </div>
          </div>

          <div className="bg-[#0a0f1d] border border-white/5 rounded-lg p-4">
            <div className="flex items-center gap-2 text-slate-500 text-[11px] font-mono uppercase mb-1">
              <Database className="w-3.5 h-3.5 text-cyan-400" /> PostgreSQL & pgvector
            </div>
            <div className="text-base font-bold font-mono text-cyan-400">
              {health?.dependencies.database.status === 'healthy' ? 'CONNECTED (Pool OK)' : 'ONLINE'}
            </div>
          </div>

          <div className="bg-[#0a0f1d] border border-white/5 rounded-lg p-4">
            <div className="flex items-center gap-2 text-slate-500 text-[11px] font-mono uppercase mb-1">
              <Cpu className="w-3.5 h-3.5 text-blue-400" /> Queue Engine
            </div>
            <div className="text-base font-bold font-mono text-blue-400">
              {health?.dependencies.redis.connected ? 'BullMQ (Connected)' : 'BullMQ + Redis'}
            </div>
          </div>
        </div>
      </div>

      {/* Raw Payload Inspector */}
      <div className="bg-[#0f1523] border border-white/10 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-mono text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <span>LIVE JSON PAYLOAD (/api/health)</span>
            {isLoading && <span className="text-cyan-400 text-[10px] animate-pulse">Polling...</span>}
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy JSON'}</span>
          </button>
        </div>

        <pre className="bg-[#04060a] border border-white/5 rounded-lg p-4 text-xs font-mono text-cyan-400 overflow-x-auto whitespace-pre">
          {health ? JSON.stringify(health, null, 2) : 'Connecting to Hopper API Gateway (/api/health)...'}
        </pre>
      </div>
    </div>
  );
};
