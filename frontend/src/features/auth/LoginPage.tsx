import React, { useState, useEffect } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  initiateGitHubOAuth,
  signInWithDevAccount,
  useSession,
} from './useSession';
import { ROUTES } from '../../lib/routes';
import {
  Button,
  Card,
  InlineNotice,
} from '../../components/ui/primitives';
import { Zap, Github, ShieldCheck, Terminal } from 'lucide-react';

const LoginPage: React.FC = () => {
  const { isAuthenticated, status } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? ROUTES.overview;

  // Catch token in query params if landed on /login?token=... or /login/callback?token=...
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    if (token) {
      localStorage.setItem('hopper_auth_token', token);
      navigate(from, { replace: true });
    }
  }, [location.search, navigate, from]);

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const handleGitHubOAuth = () => {
    setError(null);
    setBusy(true);
    try {
      initiateGitHubOAuth();
    } catch (caught) {
      setBusy(false);
      setError(caught instanceof Error ? caught.message : 'Could not initiate GitHub login.');
    }
  };

  const handleDevLogin = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await signInWithDevAccount('johan-droid');
      navigate(from, { replace: true });
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : 'Failed to authenticate development account.'
      );
    } finally {
      setBusy(false);
    }
  };

  const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-hairline px-5 py-3">
        <Link to={ROUTES.landing} className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-accent text-accent-contrast">
            <Zap className="h-3.5 w-3.5" aria-hidden />
          </span>
          Hopper
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Github className="h-6 w-6" />
            </div>
            <h1 className="mt-3 text-xl font-semibold tracking-tight text-ink">
              Sign in to Hopper
            </h1>
            <p className="mt-1 text-xs text-ink-secondary">
              Hopper uses GitHub as the authoritative source of truth for identity, organizations, and repositories.
            </p>
          </div>

          <Card className="mt-6 p-6">
            {error ? (
              <div className="mb-4">
                <InlineNotice tone="danger" title="Authentication Error">
                  {error}
                </InlineNotice>
              </div>
            ) : null}

            {notice ? (
              <div className="mb-4">
                <InlineNotice tone="success" title="Success">
                  {notice}
                </InlineNotice>
              </div>
            ) : null}

            {/* Authoritative Single-Sign-On GitHub OAuth Flow */}
            <div className="space-y-3">
              <Button
                type="button"
                variant="primary"
                className="w-full justify-center gap-2 py-2.5 text-sm font-medium shadow-sm"
                onClick={handleGitHubOAuth}
                loading={busy}
                disabled={status === 'loading'}
              >
                <Github className="h-4 w-4" />
                Continue with GitHub
              </Button>

              {/* Seamless Development Authentication (Bypasses token input completely) */}
              {isDevelopment ? (
                <div className="pt-2">
                  <div className="relative my-3 flex items-center justify-center">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-hairline" />
                    </div>
                    <div className="relative bg-raised px-2 text-[10px] font-medium uppercase tracking-wider text-ink-muted">
                      Local Development
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full justify-center gap-2 py-2 text-xs font-normal"
                    onClick={handleDevLogin}
                    loading={busy}
                    disabled={status === 'loading'}
                  >
                    <Terminal className="h-3.5 w-3.5 text-accent" />
                    Quick Sign-In (@johan-droid)
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="mt-5 rounded-md bg-inset/50 p-3 text-[11px] text-ink-muted border border-hairline">
              <div className="flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                <span>
                  No manual API tokens required. Authenticating provisions your personal workspace, links your active GitHub identity, and synchronizes your repositories automatically.
                </span>
              </div>
            </div>
          </Card>

          <p className="mt-4 text-center text-[11px] text-ink-muted">
            <Link to={ROUTES.landing} className="hover:text-ink">
              ← Back to the product page
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
};

export default LoginPage;
