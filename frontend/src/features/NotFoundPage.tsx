import React from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '../lib/routes';

const NotFoundPage: React.FC = () => (
  <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
    <p className="font-mono text-xs uppercase tracking-widest text-ink-muted">404</p>
    <h1 className="mt-2 text-lg font-semibold text-ink">This page does not exist</h1>
    <p className="mt-1 max-w-sm text-sm text-ink-secondary">
      The route may have moved, or the link may be incomplete. Everything you can reach is listed in
      the sidebar.
    </p>
    <Link
      to={ROUTES.overview}
      className="mt-5 inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-sm font-medium text-accent-contrast hover:bg-accent/90"
    >
      Back to overview
    </Link>
  </div>
);

export default NotFoundPage;
