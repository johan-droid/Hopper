import React, { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useWorkspacesQuery, useWorkspaceMembersQuery } from '../../api/hooks';
import { Settings, Users, Key, Sparkles, Building, UserCheck, Loader2 } from 'lucide-react';

export const WorkspaceSettingsView: React.FC = () => {
  const { selectedOrg, selectedWorkspaceId } = useAppStore();
  const [apiKeyVisible, setApiKeyVisible] = useState(false);

  const { data: wsData } = useWorkspacesQuery();
  const activeWorkspace = wsData?.workspaces.find((w) => w.id === selectedWorkspaceId) || wsData?.workspaces[0];

  const targetWsId = activeWorkspace?.id || selectedWorkspaceId;
  const { data: membersData, isLoading: isMembersLoading } = useWorkspaceMembersQuery(targetWsId || undefined);

  const members = membersData?.members || [];

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5 text-cyan-400" />
          Workspace Settings & Multi-Tenancy
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Manage team members, RBAC authorization, connected GitHub App installations, and validation tier status.
        </p>
      </div>

      {/* Validation Mode Banner (Monetization Deferred) */}
      <div className="bg-gradient-to-r from-cyan-950/40 via-[#0f1523] to-slate-900 border border-cyan-500/30 rounded-xl p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">Validation Discovery Mode: Unrestricted Free Tier</span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                ACTIVE
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Hopper is currently operating under autonomous developer validation and product discovery. Payment gateway integrations and paid subscription tiers are explicitly deferred. All features—including automated GitHub App PR comments, Claude 3.5 Haiku AI diagnosis, Cloud Moat fingerprinting, and unlimited cross-run matrices—are accessible at no charge.
            </p>
          </div>
        </div>
      </div>

      {/* Workspace Profile Card */}
      <div className="bg-[#0f1523] border border-white/10 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-2">
            <Building className="w-4 h-4 text-cyan-400" />
            ORGANIZATION WORKSPACE PROFILE
          </span>
          <span className="text-[11px] font-mono text-slate-500">
            ID: {activeWorkspace?.id || 'default-workspace'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
          <div>
            <span className="text-slate-500 text-[11px] block">WORKSPACE NAME</span>
            <span className="text-white font-bold">{activeWorkspace?.name || selectedOrg}</span>
          </div>
          <div>
            <span className="text-slate-500 text-[11px] block">WORKSPACE TYPE</span>
            <span className="text-slate-200">
              {activeWorkspace?.type ? `${activeWorkspace.type.toUpperCase()} (Multi-Tenant)` : 'Organization'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 text-[11px] block">DATA RESIDENCY</span>
            <span className="text-slate-200">PostgreSQL 16 + pgvector</span>
          </div>
        </div>
      </div>

      {/* Team Members & Roles (RBAC) */}
      <div className="bg-[#0f1523] border border-white/10 rounded-xl overflow-hidden shadow-sm">
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-mono font-bold text-slate-200">TEAM MEMBERS & RBAC ROLES</span>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            {isMembersLoading ? 'Loading members...' : `${members.length} Active Member${members.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {isMembersLoading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-5 h-5 text-cyan-400 animate-spin mx-auto mb-2" />
            <p className="text-xs font-mono text-slate-400">Loading workspace membership...</p>
          </div>
        ) : members.length === 0 ? (
          <div className="p-8 text-center text-xs font-mono text-slate-400">
            No additional members in this workspace yet. Use workspace invitations to add team members.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/60 border-b border-white/10 text-slate-400 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="px-5 py-3">Member ID</th>
                  <th className="px-5 py-3">User Profile</th>
                  <th className="px-5 py-3">Assigned Role</th>
                  <th className="px-5 py-3 text-right">Added At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-white flex items-center gap-2">
                      <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
                      {m.id.slice(0, 8)}...
                    </td>
                    <td className="px-5 py-3.5 text-slate-400">{m.user_id}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          m.role === 'owner'
                            ? 'bg-purple-950/60 text-purple-400 border border-purple-800/40'
                            : m.role === 'admin'
                            ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-800/40'
                            : 'bg-slate-800 text-slate-300 border border-white/5'
                        }`}
                      >
                        {m.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right text-slate-500">
                      {m.created_at ? new Date(m.created_at).toLocaleDateString() : 'Active'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Developer API Key */}
      <div className="bg-[#0f1523] border border-white/10 rounded-xl p-6 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-2">
            <Key className="w-4 h-4 text-cyan-400" />
            CLI INGESTION API TOKEN
          </span>
          <button
            onClick={() => setApiKeyVisible(!apiKeyVisible)}
            className="text-xs font-mono text-cyan-400 hover:text-cyan-300 cursor-pointer"
          >
            {apiKeyVisible ? 'Hide Token' : 'Reveal Token'}
          </button>
        </div>
        <div className="bg-black/60 border border-white/5 rounded-lg p-3 font-mono text-xs text-slate-300 flex items-center justify-between">
          <code>
            {apiKeyVisible
              ? 'hop_live_9f83a0e1c4b27d890ef14327a1b4908c'
              : 'hop_live_••••••••••••••••••••••••••••••••'}
          </code>
        </div>
        <p className="text-[11px] text-slate-500 font-mono">
          Used by local developer CLI (`hopper diagnose`) to authenticate and upload raw log streams for synthesis.
        </p>
      </div>
    </div>
  );
};
