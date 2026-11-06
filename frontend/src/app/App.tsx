import React, { Suspense, lazy } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from 'react-router-dom';
import { RequireAuth } from './RequireAuth';
import { useSessionBootstrap } from '../features/auth/useSession';
import { useThemeApplication } from '../components/layout/Sidebar';
import { WorkspaceProvider } from '../features/workspace/WorkspaceProvider';
import { AppShell } from '../components/layout/AppShell';
import { ToastProvider } from '../components/ui/feedback';
import { ROUTES } from '../lib/routes';
import { Skeleton } from '../components/ui/primitives';

const LandingPage = lazy(() => import('../features/marketing/LandingPage'));
const LoginPage = lazy(() => import('../features/auth/LoginPage'));
const OverviewPage = lazy(() => import('../features/overview/OverviewPage'));
const RepositoriesPage = lazy(() => import('../features/repositories/RepositoriesPage'));
const RepositoryDetailPage = lazy(() => import('../features/repositories/RepositoryDetailPage'));
const ActivityPage = lazy(() => import('../features/activity/ActivityPage'));
const FailureDetailPage = lazy(() => import('../features/failures/FailureDetailPage'));
const InvestigationPage = lazy(() => import('../features/investigations/InvestigationPage'));
const DiagnosesPage = lazy(() => import('../features/diagnoses/DiagnosesPage'));
const TrendsPage = lazy(() => import('../features/trends/TrendsPage'));
const IntegrationsPage = lazy(() => import('../features/integrations/IntegrationsPage'));
const SettingsLayout = lazy(() => import('../features/settings/SettingsLayout'));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'));
const MembersPage = lazy(() => import('../features/settings/MembersPage'));
const SecurityPage = lazy(() => import('../features/settings/SecurityPage'));
const BillingPage = lazy(() => import('../features/settings/BillingPage'));
const NotFoundPage = lazy(() => import('../features/NotFoundPage'));

const RouteFallback: React.FC = () => (
  <div className="space-y-3 p-1" aria-busy="true" aria-live="polite">
    <span className="sr-only">Loading page</span>
    <Skeleton className="h-7 w-48" />
    <Skeleton className="h-4 w-80" />
    <Skeleton className="mt-4 h-64 w-full" />
  </div>
);

const withSuspense = (element: React.ReactNode) => <Suspense fallback={<RouteFallback />}>{element}</Suspense>;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const status = (error as { status?: number })?.status ?? 0;
        // Never retry auth/permission failures; retry transient errors twice.
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 2;
      },
      staleTime: 15_000,
    },
    mutations: { retry: 0 },
  },
});

const Shell: React.FC = () => (
  <RequireAuth>
    <WorkspaceProvider>
      <AppShell />
    </WorkspaceProvider>
  </RequireAuth>
);

const router = createBrowserRouter([
  { path: ROUTES.landing, element: withSuspense(<LandingPage />) },
  { path: ROUTES.login, element: withSuspense(<LoginPage />) },
  { path: ROUTES.signup, element: withSuspense(<LoginPage initialMode="signup" />) },
  {
    path: '/app',
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to={ROUTES.overview} replace /> },
      { path: 'overview', element: withSuspense(<OverviewPage />) },
      { path: 'repositories', element: withSuspense(<RepositoriesPage />) },
      { path: 'repositories/:repositoryId', element: withSuspense(<RepositoryDetailPage />) },
      { path: 'activity', element: withSuspense(<ActivityPage />) },
      { path: 'failures/:failureId', element: withSuspense(<FailureDetailPage />) },
      { path: 'investigations', element: withSuspense(<InvestigationPage />) },
      { path: 'investigations/:signatureId', element: withSuspense(<InvestigationPage />) },
      { path: 'diagnoses', element: withSuspense(<DiagnosesPage />) },
      { path: 'trends', element: withSuspense(<TrendsPage />) },
      { path: 'integrations', element: withSuspense(<IntegrationsPage />) },
      {
        path: 'settings',
        element: withSuspense(<SettingsLayout />),
        children: [
          { index: true, element: <Navigate to={ROUTES.settingsGeneral} replace /> },
          { path: 'general', element: withSuspense(<SettingsPage />) },
          { path: 'members', element: withSuspense(<MembersPage />) },
          { path: 'security', element: withSuspense(<SecurityPage />) },
          { path: 'billing', element: withSuspense(<BillingPage />) },
        ],
      },
      { path: '*', element: withSuspense(<NotFoundPage />) },
    ],
  },
  { path: '*', element: withSuspense(<NotFoundPage />) },
]);

const AppRoot: React.FC = () => {
  useSessionBootstrap();
  useThemeApplication();
  return <RouterProvider router={router} />;
};

export const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <ToastProvider>
      <AppRoot />
    </ToastProvider>
  </QueryClientProvider>
);

export default App;
export { queryClient };
