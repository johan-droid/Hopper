import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppStore } from './store/useAppStore';
import { Header } from './components/layout/Header';
import { NavTabs } from './components/layout/NavTabs';
import { OverviewView } from './components/views/OverviewView';
import { SignatureInspectorView } from './components/views/SignatureInspectorView';
import { DiagnosticSandboxView } from './components/views/DiagnosticSandboxView';
import { BillingPlansView } from './components/views/BillingPlansView';
import { TelemetryView } from './components/views/TelemetryView';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});

export const AppContent: React.FC = () => {
  const { activeTab } = useAppStore();

  return (
    <div className="min-h-screen bg-[#0a0f1d] flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      <Header />
      <NavTabs />

      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        {activeTab === 'overview' && <OverviewView />}
        {activeTab === 'signatures' && <SignatureInspectorView />}
        {activeTab === 'diagnose' && <DiagnosticSandboxView />}
        {activeTab === 'billing' && <BillingPlansView />}
        {activeTab === 'gateway' && <TelemetryView />}
      </main>

      <footer className="py-6 border-t border-white/5 text-center text-xs text-slate-500 font-mono">
        Hopper CI/CD Failure Diagnosis Engine &bull; Inspired by Rear Admiral Grace Hopper &bull;{' '}
        <span className="italic text-slate-400">"A ship in port is safe, but that is not what ships are built for."</span>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
};

export default App;
