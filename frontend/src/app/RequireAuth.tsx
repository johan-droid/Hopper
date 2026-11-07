import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../features/auth/useSession';
import { ROUTES } from '../lib/routes';
import { Skeleton } from '../components/ui/primitives';

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

  if (status === 'anonymous' || status === 'unconfigured') {
    return <Navigate to={ROUTES.login} state={{ from: location.pathname + location.search }} replace />;
  }

  return <>{children}</>;
};
