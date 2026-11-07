import React from 'react';
import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw, Home, Terminal } from 'lucide-react';
import { Button, Card } from '../ui/primitives';
import { ROUTES } from '../../lib/routes';

export const RouteErrorBoundary: React.FC = () => {
  const error = useRouteError();

  let title = 'Unexpected Application Error';
  let message = 'An unexpected error occurred while rendering this view.';
  let details: string | null = null;
  let status: number | null = null;

  if (isRouteErrorResponse(error)) {
    status = error.status;
    title = error.status === 404 ? 'Page Not Found' : `Application Error (${error.status})`;
    message = error.statusText || error.data?.message || message;
  } else if (error instanceof Error) {
    message = error.message;
    details = error.stack || null;
  } else if (typeof error === 'string') {
    message = error;
  }

  // Detect dynamic import or stale module errors from dev HMR or new deployments
  const isChunkLoadError =
    message.includes('dynamically imported module') ||
    message.includes('Failed to fetch') ||
    message.includes('Loading chunk');

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-canvas px-4 py-12 text-ink selection:bg-accent/20">
      <div className="w-full max-w-lg">
        <Card className="relative overflow-hidden border-hairline/80 bg-raised p-6 shadow-2xl sm:p-8">
          {/* Subtle accent border at top */}
          <div
            className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-danger via-rose-500 to-accent"
            aria-hidden="true"
          />

          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-danger/30 bg-danger/10 text-danger">
              <AlertTriangle className="h-6 w-6" aria-hidden="true" />
            </div>

            <div className="min-w-0 flex-1">
              {status ? (
                <span className="font-mono text-xs font-semibold uppercase tracking-wider text-danger">
                  Error {status}
                </span>
              ) : null}
              <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
                {title}
              </h1>
              <p className="mt-2 text-xs leading-relaxed text-ink-secondary sm:text-sm">
                {isChunkLoadError
                  ? 'A newer version of this module or application is available. Reloading will refresh your session assets.'
                  : message}
              </p>
            </div>
          </div>

          {/* Collapsible stack details in dev */}
          {import.meta.env.DEV && details ? (
            <div className="mt-5 rounded-lg border border-hairline bg-inset p-3 font-mono text-[11px] text-ink-muted">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs text-ink-secondary">
                <Terminal className="h-3.5 w-3.5" />
                <span>Debug Stack Trace</span>
              </div>
              <pre className="max-h-36 overflow-auto whitespace-pre-wrap leading-relaxed">
                {details}
              </pre>
            </div>
          ) : null}

          {/* Actions */}
          <div className="mt-6 flex flex-wrap items-center gap-3 pt-2">
            <Button
              variant="primary"
              onClick={() => window.location.reload()}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Reload Page</span>
            </Button>

            <Link to={ROUTES.landing}>
              <Button variant="secondary" className="gap-2">
                <Home className="h-4 w-4" />
                <span>Return to Home</span>
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default RouteErrorBoundary;

