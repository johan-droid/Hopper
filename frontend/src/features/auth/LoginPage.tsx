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
import { WorkflowVisualizer } from '../../components/ui/WorkflowVisualizer';
import { GithubIcon } from '../../components/ui/primitives';
import {
  Zap,
  ShieldCheck,
  ArrowRight,
  Info,
  CheckCircle2,
} from 'lucide-react';

const LoginPage: React.FC = () => {
  const { isAuthenticated, status } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Safely sanitize target destination against open-redirect vulnerabilities
  const rawFrom = (location.state as { from?: string } | null)?.from;
  const from = sanitizeRedirectPath(rawFrom);

  // Catch token or GitHub OAuth authorization code in query params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    const code = params.get('code');
    const state = params.get('state');

    if (token) {
      localStorage.setItem('hopper_auth_token', token);
      navigate(from, { replace: true });
      return;
    }

    if (code) {
      setBusy(true);
      setError(null);
      const callbackUrl = `/api/auth/github/callback?code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ''}`;

      fetch(callbackUrl, {
        headers: { Accept: 'application/json' },
      })
        .then(async (res) => {
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || errData.message || `GitHub authentication failed (HTTP ${res.status})`);
          }
          return res.json();
        })
        .then((data) => {
          if (data.token) {
            localStorage.setItem('hopper_auth_token', data.token);
            navigate(from, { replace: true });
          } else {
            throw new Error('No authentication token returned from GitHub authorization.');
          }
        })
        .catch((err) => {
          setBusy(false);
          setError(err.message || 'Failed to exchange GitHub authorization code.');
        });
    }
  }, [location.search, navigate, from]);

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const handleGitHubOAuth = async () => {
    setError(null);
    setBusy(true);
    try {
      await initiateGitHubOAuth();
    } catch (caught) {
      setBusy(false);
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not initiate GitHub authentication. Please try again.'
      );
    }
  };

  const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';

  return (
    <div className="relative min-h-screen w-full bg-canvas text-ink antialiased selection:bg-accent/20 selection:text-ink">
      {/* Ambient background with dot grid and crimson glow */}
      <DotGridBackground glowColor="both" />

      {/* Top Navigation */}
      <header className="relative z-10 border-b border-hairline/60 bg-canvas/60 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            to={ROUTES.landing}
            className="group inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight text-ink transition-colors hover:text-ink"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-danger to-rose-600 text-white shadow-sm ring-1 ring-white/20 transition-transform duration-200 group-hover:scale-105">
              <Zap className="h-4 w-4" aria-hidden />
            </span>
            <span className="font-semibold tracking-tight">Hopper</span>
            <Badge tone="neutral" mono className="text-[10px] uppercase tracking-wider">
              Autonomous CI/CD
            </Badge>
          </Link>

          <Link
            to={ROUTES.landing}
            className="text-xs text-ink-secondary transition-colors hover:text-ink inline-flex items-center gap-1"
          >
            <span>Documentation & Overview</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </header>

      {/* Main Content: Split Composition */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-12 lg:gap-16">
          {/* Left Column: Platform Promise & Autonomous Workflow */}
          <section
            aria-label="Platform Architecture & Lifecycle"
            className="flex flex-col space-y-6 lg:col-span-7"
          >
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-danger/30 bg-danger/10 px-3 py-1 text-xs font-medium text-danger">
                <span className="flex h-1.5 w-1.5 rounded-full bg-danger animate-pulse" />
                Next-Gen Autonomous Engineering
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl lg:text-[40px] lg:leading-[1.15]">
                Autonomous software engineering,{' '}
                <span className="bg-gradient-to-r from-danger via-rose-400 to-accent bg-clip-text text-transparent">
                  verified in isolation.
                </span>
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-ink-secondary sm:text-base">
                Hopper links directly with your GitHub ecosystem to analyze CI failures, build context-aware fixes in ephemeral microVM sandboxes, run regression suites, and submit verified pull requests for engineering sign-off.
              </p>
            </div>

            {/* Workflow Visualizer Card */}
            <div className="overflow-hidden rounded-xl border border-hairline/80 bg-raised/70 p-5 shadow-2xl backdrop-blur-md">
              <WorkflowVisualizer />
            </div>

            {/* Platform Trust Highlights */}
            <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
              <div className="flex items-start gap-2.5 rounded-lg border border-hairline/50 bg-raised/40 p-3 text-xs text-ink-secondary">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                <span>
                  <strong className="text-ink font-medium">Deterministic Isolation:</strong> Checks execute in clean sandboxes with strict network boundaries.
                </span>
              </div>
              <div className="flex items-start gap-2.5 rounded-lg border border-hairline/50 bg-raised/40 p-3 text-xs text-ink-secondary">
                <ShieldCheck className="h-4 w-4 shrink-0 text-accent mt-0.5" />
                <span>
                  <strong className="text-ink font-medium">Minimal Permissions:</strong> Auth login is read-only. Repo access requires explicit GitHub App installation.
                </span>
              </div>
            </div>
          </section>

          {/* Right Column: Authoritative GitHub Authentication */}
          <section
            aria-label="Authentication Panel"
            className="flex flex-col justify-center lg:col-span-5 lg:pt-4"
          >
            <Card className="relative overflow-hidden border-hairline/80 bg-raised/90 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
              {/* Subtle top card glow line */}
              <div
                className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent"
                aria-hidden="true"
              />

              {/* Header */}
              <div className="text-center sm:text-left">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-hairline bg-inset text-ink shadow-inner sm:mx-0">
                  <GithubIcon className="h-6 w-6" />
                </div>
                <h2 className="mt-4 text-xl font-bold tracking-tight text-ink sm:text-2xl">
                  Sign in to Hopper
                </h2>
                <p className="mt-1.5 text-xs text-ink-secondary leading-relaxed sm:text-sm">
                  Connect your GitHub account to access your repositories, diagnostic intelligence, and autonomous workspace runs.
                </p>
              </div>

              {/* Error Notice */}
              {error ? (
                <div className="mt-5">
                  <InlineNotice tone="danger" title="Authentication Error">
                    {error}
                  </InlineNotice>
                </div>
              ) : null}

              {/* Development Environment Diagnostic notice */}
              {isDevelopment ? (
                <div className="mt-5 rounded-lg border border-accent/20 bg-accent/10 p-3 text-xs text-accent">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 text-accent mt-0.5" />
                    <div>
                      <span className="font-semibold text-ink">Authoritative Gateway:</span> Direct GitHub App OAuth enabled via <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-[11px]">/api/auth/github</code>.
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Single Primary Action: Continue with GitHub */}
              <div className="mt-6 space-y-4">
                <Button
                  type="button"
                  variant="primary"
                  className="group relative flex w-full items-center justify-center gap-2.5 rounded-lg bg-ink py-3 text-sm font-semibold text-canvas shadow-lg transition-all duration-200 hover:bg-ink/90 hover:shadow-accent/10 focus-visible:ring-2 focus-visible:ring-accent"
                  onClick={handleGitHubOAuth}
                  loading={busy}
                  disabled={status === 'loading'}
                  aria-label="Continue with GitHub"
                >
                  <GithubIcon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110" />
                  <span>Continue with GitHub</span>
                </Button>

                {/* Identity & Permissions Clarification */}
                <div className="rounded-lg border border-hairline/60 bg-inset/60 p-3.5 text-left text-[11px] leading-relaxed text-ink-secondary">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-accent mt-0.5" />
                    <div>
                      <span className="font-medium text-ink">Authoritative GitHub Identity:</span>{' '}
                      Signing in provides identity only (<code className="font-mono text-[10px] text-ink">read:user</code>, <code className="font-mono text-[10px] text-ink">user:email</code>). Hopper never requests repository write credentials during sign-in. Code execution and PR access are strictly managed through the Hopper GitHub App per selected repository.
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer info */}
              <div className="mt-6 border-t border-hairline/60 pt-4 text-center">
                <p className="text-[11px] text-ink-muted">
                  By signing in, you agree to Hopper's{' '}
                  <span className="text-ink-secondary">Terms of Service</span> and{' '}
                  <span className="text-ink-secondary">Security Protocol</span>.
                </p>
              </div>
            </Card>

            {/* Back link */}
            <div className="mt-4 text-center">
              <Link
                to={ROUTES.landing}
                className="text-xs text-ink-muted transition-colors hover:text-ink inline-flex items-center gap-1.5"
              >
                <span>← Return to homepage</span>
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default LoginPage;
