import React, { Suspense, lazy } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppStore } from './store/useAppStore';
import { Header } from './components/layout/Header';
import { NavTabs } from './components/layout/NavTabs';
import { AuthModal } from './components/auth/AuthModal';
import { Loader2 } from 'lucide-react';

// Lazy-loaded route views for code splitting and sub-200kB initial bundle
const OverviewView = lazy(() => import('./components/views/OverviewView').then((m) => ({ default: m.OverviewView })));
const RepositoriesView = lazy(() => import('./components/views/RepositoriesView').then((m) => ({ default: m.RepositoriesView })));
const PipelineActivityView = lazy(() => import('./components/views/PipelineActivityView').then((m) => ({ default: m.PipelineActivityView })));
const FailureInvestigationView = lazy(() => import('./components/views/FailureInvestigationView').then((m) => ({ default: m.FailureInvestigationView })));
const DiagnosisHistoryView = lazy(() => import('./components/views/DiagnosisHistoryView').then((m) => ({ default: m.DiagnosisHistoryView })));
const FailureTrendsView = lazy(() => import('./components/views/FailureTrendsView').then((m) => ({ default: m.FailureTrendsView })));
const IntegrationsView = lazy(() => import('./components/views/IntegrationsView').then((m) => ({ default: m.IntegrationsView })));
const WorkspaceSettingsView = lazy(() => import('./components/views/WorkspaceSettingsView').then((m) => ({ default: m.WorkspaceSettingsView })));
const LandingPageView = lazy(() => import('./components/views/LandingPageView').then((m) => ({ default: m.LandingPageView })));

const ViewLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center p-24 text-slate-400 font-mono text-xs">
    <Loader2 className="w-5 h-5 text-cyan-400 animate-spin mr-2" />
    Loading view chunk...
  </div>
);

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

  if (activeTab === 'landing') {
    return (
      <Suspense fallback={<ViewLoadingFallback />}>
        <LandingPageView />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f1d] flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      <Header />
      <NavTabs />

      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        <Suspense fallback={<ViewLoadingFallback />}>
          {activeTab === 'overview' && <OverviewView />}
          {activeTab === 'repositories' && <RepositoriesView />}
          {activeTab === 'activity' && <PipelineActivityView />}
          {(activeTab === 'investigation' || activeTab === 'signatures' || activeTab === 'diagnose') && (
            <FailureInvestigationView />
          )}
          {activeTab === 'history' && <DiagnosisHistoryView />}
          {activeTab === 'trends' && <FailureTrendsView />}
          {(activeTab === 'integrations' || activeTab === 'gateway') && <IntegrationsView />}
          {(activeTab === 'settings' || activeTab === 'billing') && <WorkspaceSettingsView />}
        </Suspense>
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
      <AuthModal />
    </QueryClientProvider>
  );
};

export default App;
