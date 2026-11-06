import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../features/auth/useSession';
import { ROUTES } from '../lib/routes';
import { Card, InlineNotice, Skeleton } from '../components/ui/primitives';

/**
 * Route guard. This is a usability boundary only — every request is still
 * authorised and tenant-scoped by the backend. Hiding a route is never treated
 * as an access control.
 */
export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status } = useSession();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-6" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (status === 'unconfigured') {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl items-center p-6">
        <Card className="w-full p-6">
          <h1 className="text-base font-semibold text-ink">Supabase is not configured</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            The dashboard needs an authentication provider. Set the public Supabase values and
            reload.
          </p>
          <div className="mt-4">
            <InlineNotice tone="neutral" title="Required environment variables">
              <code className="font-mono text-[11px]">VITE_SUPABASE_URL</code> and{' '}
              <code className="font-mono text-[11px]">VITE_SUPABASE_ANON_KEY</code>. Never put a
              service-role key in a <code className="font-mono text-[11px]">VITE_</code> variable —
              those are embedded in the browser bundle.
            </InlineNotice>
          </div>
          <p className="mt-4 text-xs text-ink-muted">
            See <code className="font-mono">docs/deployment/VERCEL_SETUP.md</code> for the setup
            sequence.
          </p>
        </Card>
      </div>
    );
  }

  if (status === 'anonymous') {
    return <Navigate to={ROUTES.login} state={{ from: location.pathname + location.search }} replace />;
  }

  return <>{children}</>;
};
