import React, { useState, useEffect } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  initiateGitHubOAuth,
  signInWithGitHubToken,
  signInWithPassword,
  signUpWithPassword,
  sendPasswordReset,
  useSession,
} from './useSession';
import { isSupabaseConfigured } from '../../lib/supabase';
import { ROUTES } from '../../lib/routes';
import {
  Button,
  Card,
  Field,
  InlineNotice,
  Input,
} from '../../components/ui/primitives';
import { Zap, Github, Key, ArrowRight, ShieldCheck } from 'lucide-react';

type Mode = 'signin' | 'signup' | 'reset';

const LoginPage: React.FC<{ initialMode?: Mode }> = ({ initialMode = 'signin' }) => {
  const { isAuthenticated, status } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  // Mode & form state
  const [mode, setMode] = useState<Mode>(initialMode);
  const [personalAccessToken, setPersonalAccessToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showLegacyEmailAuth, setShowLegacyEmailAuth] = useState(false);

  React.useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

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

  const handlePatSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!personalAccessToken.trim()) {
      setError('Please enter a GitHub Personal Access Token');
      return;
    }

    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      await signInWithGitHubToken(personalAccessToken.trim());
      navigate(from, { replace: true });
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : 'Failed to authenticate with GitHub token. Please verify token permissions.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleLegacyPasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);

    try {
      if (mode === 'reset') {
        await sendPasswordReset(email);
        setNotice('If that address has an account, a reset link is on its way.');
      } else if (mode === 'signup') {
        const { needsConfirmation } = await signUpWithPassword(email, password);
        if (needsConfirmation) {
          setNotice('Check your inbox to confirm the address, then sign in.');
          setMode('signin');
        } else {
          navigate(from, { replace: true });
        }
      } else {
        await signInWithPassword(email, password);
        navigate(from, { replace: true });
      }
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : 'Authentication failed. Check your credentials and try again.'
      );
    } finally {
      setBusy(false);
    }
  };

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
              Hopper is GitHub-native. Authenticate to sync your organizations, installations, and CI/CD pipelines.
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

            {/* Primary GitHub OAuth Flow */}
            <div className="space-y-4">
              <Button
                type="button"
                variant="primary"
                className="w-full justify-center gap-2 py-2.5 text-sm font-medium shadow-sm"
                onClick={handleGitHubOAuth}
                loading={busy && !personalAccessToken}
                disabled={status === 'loading'}
              >
                <Github className="h-4 w-4" />
                Continue with GitHub
              </Button>

              <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-hairline" />
                </div>
                <div className="relative bg-raised px-2 text-[11px] font-medium uppercase tracking-wider text-ink-muted">
                  Or use a personal token
                </div>
              </div>

              {/* Personal Access Token Flow */}
              <form onSubmit={handlePatSubmit} className="space-y-3">
                <Field
                  label="GitHub Personal Access Token"
                  htmlFor="pat-input"
                  hint="Requires read:user, repo, and read:org scopes."
                >
                  <div className="relative">
                    <Input
                      id="pat-input"
                      type="password"
                      value={personalAccessToken}
                      onChange={(e) => setPersonalAccessToken(e.target.value)}
                      placeholder="ghp_... or github_pat_..."
                      autoComplete="off"
                      spellCheck="false"
                      className="font-mono text-xs pr-8"
                    />
                    <Key className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-ink-muted pointer-events-none" />
                  </div>
                </Field>

                <Button
                  type="submit"
                  variant="secondary"
                  className="w-full justify-center gap-2"
                  loading={busy && Boolean(personalAccessToken)}
                  disabled={!personalAccessToken.trim() || status === 'loading'}
                >
                  Sign in with Token
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </form>
            </div>

            <div className="mt-5 rounded-md bg-inset/50 p-3 text-[11px] text-ink-muted border border-hairline">
              <div className="flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                <span>
                  Hopper establishes a verified session, provisions your personal workspace, and auto-discovers your repositories and workflow failures.
                </span>
              </div>
            </div>

            {/* Supabase Password Login (Only if configured) */}
            {isSupabaseConfigured ? (
              <div className="mt-5 border-t border-hairline pt-3 text-center">
                <button
                  type="button"
                  className="text-xs text-ink-muted hover:text-ink transition-colors"
                  onClick={() => setShowLegacyEmailAuth(!showLegacyEmailAuth)}
                >
                  {showLegacyEmailAuth ? 'Hide Email / Password Sign In' : 'Legacy Email Sign In (Supabase)'}
                </button>

                {showLegacyEmailAuth ? (
                  <form onSubmit={handleLegacyPasswordSubmit} className="mt-4 space-y-3 text-left">
                    <Field label="Email" htmlFor="email">
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                      />
                    </Field>
                    <Field label="Password" htmlFor="password">
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </Field>
                    <Button type="submit" variant="secondary" className="w-full" loading={busy}>
                      {mode === 'signup' ? 'Create Account' : 'Sign in with Password'}
                    </Button>
                  </form>
                ) : null}
              </div>
            ) : null}
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
