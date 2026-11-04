import React, { useEffect } from 'react';
import { useAppStore, AppTab } from '../../store/useAppStore';
import { BarChart3, FileSearch, Terminal, CreditCard, Activity } from 'lucide-react';

interface TabItem {
  id: AppTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeStyle?: string;
}

const TABS: TabItem[] = [
  { id: 'overview', label: 'Flaky Leaderboard', icon: BarChart3, badge: 'Top 10' },
  { id: 'signatures', label: 'Signature Inspector', icon: FileSearch },
  {
    id: 'diagnose',
    label: 'Ad-hoc Diagnostic Sandbox',
    icon: Terminal,
    badge: 'Interactive',
    badgeStyle: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40',
  },
  { id: 'billing', label: 'Plans & Quotas', icon: CreditCard },
  { id: 'gateway', label: 'Gateway Telemetry', icon: Activity },
];

export const NavTabs: React.FC = () => {
  const { activeTab, setTab } = useAppStore();

  // Keyboard shortcut support (1-5 keys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      const key = parseInt(e.key, 10);
      if (key >= 1 && key <= 5) {
        setTab(TABS[key - 1].id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setTab]);

  return (
    <nav className="flex items-center gap-1 px-6 border-b border-white/10 bg-[#0a0f1d]/60 backdrop-blur-sm overflow-x-auto">
      {TABS.map((tab, idx) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              isActive
                ? 'border-cyan-400 text-cyan-400 bg-cyan-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
            <span>{tab.label}</span>
            <span className="text-[10px] font-mono text-slate-600 ml-0.5">[{idx + 1}]</span>
            {tab.badge && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                  tab.badgeStyle || 'bg-cyan-950/60 text-cyan-400 border-cyan-800/40'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};
