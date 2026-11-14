import React, { useState, useEffect } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  initiateGitHubOAuth,
  sanitizeRedirectPath,
  useSession,
} from './useSession';
import { ROUTES } from '../../lib/routes';
import {
  Button,
  Card,
  InlineNotice,
  Badge,
} from '../../components/ui/primitives';
import { DotGridBackground } from '../../components/ui/DotGridBackground';
import { GithubIcon } from '../../components/ui/primitives';
import {
  Zap,
  ShieldCheck,
  ArrowLeft,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { isAuthenticated } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const [busy, setBusy] = useState(false);
  const [authStep, setAuthStep] = useState<'idle' | 'redirecting' | 'exchanging' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Safely sanitize target destination against open-redirect vulnerabilities
  const rawFrom = (location.state as { from?: string } | null)?.from;
  const from = sanitizeRedirectPath(rawFrom);

  // Catch OAuth callback tokens, codes, errors, or cancellations in query params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    const code = params.get('code');
    const state = params.get('state');
    const oauthError = params.get('error');
    const oauthErrorDescription = params.get('error_description');

    // Handle OAuth cancellation or provider-level errors
    if (oauthError) {
      setBusy(false);
      setAuthStep('idle');
      if (oauthError === 'access_denied') {
        setError('GitHub authorization was cancelled. Click "Continue with GitHub" to retry.');
      } else {
        setError(oauthErrorDescription || `GitHub authorization failed (${oauthError}).`);
      }
      return;
    }

    // Direct token handoff (e.g. from server callback redirect)
    if (token) {
      setAuthStep('success');
      localStorage.setItem('hopper_auth_token', token);
      const timer = setTimeout(() => {
        navigate(from, { replace: true });
      }, 400);
      return () => clearTimeout(timer);
    }

    // Authorization code exchange
    if (code) {
      setBusy(true);
      setAuthStep('exchanging');
      setError(null);
      const callbackUrl = `/api/auth/github/callback?code=${encodeURIComponent(code)}${
        state ? `&state=${encodeURIComponent(state)}` : ''
      }`;

      fetch(callbackUrl, {
        headers: { Accept: 'application/json' },
      })
        .then(async (res) => {
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(
              errData.error?.message ||
                errData.message ||
                `GitHub authorization exchange failed (HTTP ${res.status})`
            );
          }
          return res.json();
        })
        .then((data) => {
          if (data.token) {
            setAuthStep('success');
            localStorage.setItem('hopper_auth_token', data.token);
            setTimeout(() => {
              navigate(from, { replace: true });
            }, 300);
          } else {
            throw new Error('No session token returned from GitHub authorization.');
          }
        })
        .catch((err) => {
          setBusy(false);
          setAuthStep('idle');
          setError(err.message || 'Failed to exchange GitHub authorization code.');
        });
    }
  }, [location.search, navigate, from]);

  // Already authenticated: redirect directly to application destination
  if (isAuthenticated && authStep !== 'exchanging') {
    return <Navigate to={from} replace />;
  }

  const handleGitHubOAuth = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    setAuthStep('redirecting');
    try {
      await initiateGitHubOAuth();
    } catch (caught) {
      setBusy(false);
      setAuthStep('idle');
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not connect to GitHub OAuth. Please try again.'
      );
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between bg-canvas text-ink antialiased selection:bg-rose-500/20 selection:text-white">
      {/* Ambient background with dot grid and restrained crimson glow */}
      <DotGridBackground glowColor="crimson" />

      {/* Top Header: Identity & Back Navigation */}
      <header className="relative z-10 w-full border-b border-hairline/60 bg-canvas/40 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link
            to={ROUTES.landing}
            className="group inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight text-ink transition-colors hover:text-white"
            aria-label="Hopper Home"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-md shadow-rose-950/40 ring-1 ring-white/10 transition-transform duration-200 group-hover:scale-105">
              <Zap className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="font-semibold text-base tracking-tight text-white">Hopper</span>
            <Badge tone="neutral" mono className="text-[10px] uppercase tracking-wider hidden sm:inline-flex">
              Auth Gateway
            </Badge>
          </Link>

          <Link
            to={ROUTES.landing}
            className="inline-flex items-center gap-1.5 text-xs text-ink-secondary transition-colors hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Return to Overview</span>
          </Link>
        </div>
      </header>

      {/* Main Centered Authentication Composition */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-md">
          <Card className="relative overflow-hidden border-hairline/80 bg-raised/90 p-7 shadow-2xl backdrop-blur-xl sm:p-9">
            {/* Signature Top Crimson Accent Line */}
            <div
              className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-rose-500 to-transparent"
              aria-hidden="true"
            />

            {/* Header */}
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-hairline bg-inset text-white shadow-inner">
                <GithubIcon className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Welcome to Hopper
              </h1>
              <p className="mt-2 text-sm text-ink-secondary">
                Your development workflow, connected.
              </p>
            </div>

            {/* Status Notifications */}
            {error ? (
              <div className="mt-6" role="alert" aria-live="assertive">
                <InlineNotice tone="danger" title="Authentication Notice">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                </InlineNotice>
              </div>
            ) : null}

            {authStep === 'exchanging' ? (
              <div className="mt-6 flex items-center justify-center gap-2.5 rounded-lg border border-hairline bg-inset/80 p-3 text-xs text-ink-secondary" role="status" aria-live="polite">
                <Loader2 className="h-4 w-4 animate-spin text-rose-400" />
                <span>Completing GitHub authentication...</span>
              </div>
            ) : null}

            {authStep === 'success' ? (
              <div className="mt-6 flex items-center justify-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 text-xs text-emerald-400" role="status" aria-live="polite">
                <CheckCircle2 className="h-4 w-4" />
                <span>Authentication successful. Entering Hopper...</span>
              </div>
            ) : null}

            {/* Primary Action: Continue with GitHub */}
            <div className="mt-7 space-y-4">
              <Button
                type="button"
                variant="primary"
                className="group relative flex w-full h-12 items-center justify-center gap-3 rounded-lg bg-white px-4 text-sm font-semibold text-neutral-950 shadow-lg shadow-white/5 transition-all duration-200 hover:bg-neutral-100 hover:shadow-rose-500/10 focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-60"
                onClick={handleGitHubOAuth}
                loading={busy || authStep === 'redirecting'}
                disabled={busy || authStep === 'redirecting' || authStep === 'exchanging' || authStep === 'success'}
                aria-label="Continue with GitHub"
              >
                <GithubIcon className="h-5 w-5 shrink-0 transition-transform group-hover:scale-110 text-neutral-950" />
                <span>
                  {authStep === 'redirecting'
                    ? 'Connecting to GitHub...'
                    : authStep === 'exchanging'
                    ? 'Authenticating...'
                    : 'Continue with GitHub'}
                </span>
              </Button>

              {/* Minimal Single-Gateway Assurance */}
              <p className="text-center text-xs text-ink-muted">
                One single gateway for existing members and new workspaces.
              </p>
            </div>

            {/* Security & Scopes Reassurance */}
            <div className="mt-8 rounded-lg border border-hairline/60 bg-inset/50 p-3.5 text-left text-xs leading-relaxed text-ink-secondary">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                <div>
                  <span className="font-medium text-ink">Identity Only:</span>{' '}
                  Hopper requests read-only profile information (<code className="font-mono text-[11px] text-white">read:user</code>, <code className="font-mono text-[11px] text-white">user:email</code>). Repository permissions, webhook intake, and pull-request comments are strictly managed through the verified Hopper GitHub App per selected repository.
                </div>
              </div>
            </div>

            {/* Legal / Policy Footer */}
            <div className="mt-6 border-t border-hairline/60 pt-4 text-center">
              <p className="text-[11px] text-ink-muted">
                By signing in, you agree to Hopper's{' '}
                <span className="text-ink-secondary">Terms of Service</span> and{' '}
                <span className="text-ink-secondary">Security Protocol</span>.
              </p>
            </div>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-hairline/40 py-4 text-center text-xs text-ink-muted">
        <p>Hopper CI/CD Failure Diagnosis Engine · Apache-2.0</p>
      </footer>
    </div>
  );
};

export default LoginPage;
