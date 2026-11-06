import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  sendPasswordReset,
  signInWithPassword,
  signUpWithPassword,
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
import { Zap } from 'lucide-react';

type Mode = 'signin' | 'signup' | 'reset';

const LoginPage: React.FC<{ initialMode?: Mode }> = ({ initialMode = 'signin' }) => {
  const { isAuthenticated, status } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // /login and /signup render the same page; keep the mode in sync with the URL.
  React.useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const from = (location.state as { from?: string } | null)?.from ?? ROUTES.overview;

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
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
        <div className="w-full max-w-sm">
          <h1 className="text-lg font-semibold tracking-tight text-ink">
            {mode === 'reset' ? 'Reset your password' : mode === 'signup' ? 'Create an account' : 'Sign in to Hopper'}
          </h1>
          <p className="mt-1 text-xs text-ink-secondary">
            {mode === 'reset'
              ? 'We will email a single-use recovery link.'
              : 'Sessions are issued and refreshed by Supabase Auth.'}
          </p>

          {!isSupabaseConfigured ? (
            <div className="mt-4">
              <InlineNotice tone="warning" title="Authentication is not configured">
                Set <code className="font-mono">VITE_SUPABASE_URL</code> and{' '}
                <code className="font-mono">VITE_SUPABASE_ANON_KEY</code>. Until then no sign-in can
                succeed — there is no client-side fallback token.
              </InlineNotice>
            </div>
          ) : null}

          <Card className="mt-5 p-5">
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <Field label="Email address" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  disabled={!isSupabaseConfigured}
                />
              </Field>

              {mode !== 'reset' ? (
                <Field
                  label="Password"
                  htmlFor="password"
                  hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
                >
                  <Input
                    id="password"
                    type="password"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    required
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    disabled={!isSupabaseConfigured}
                  />
                </Field>
              ) : null}

              {error ? (
                <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
                  {error}
                </p>
              ) : null}
              {notice ? (
                <p role="status" className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
                  {notice}
                </p>
              ) : null}

              <Button
                type="submit"
                variant="primary"
                className="w-full"
                loading={busy}
                disabled={!isSupabaseConfigured || status === 'loading'}
              >
                {mode === 'reset' ? 'Send reset link' : mode === 'signup' ? 'Create account' : 'Sign in'}
              </Button>
            </form>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3 text-xs">
              <button
                type="button"
                className="text-accent hover:underline"
                onClick={() => {
                  setMode(mode === 'signin' ? 'signup' : 'signin');
                  setError(null);
                  setNotice(null);
                }}
              >
                {mode === 'signin' ? 'Create an account' : 'I already have an account'}
              </button>
              {mode !== 'reset' ? (
                <button
                  type="button"
                  className="text-ink-muted hover:text-ink"
                  onClick={() => {
                    setMode('reset');
                    setError(null);
                    setNotice(null);
                  }}
                >
                  Forgot password?
                </button>
              ) : null}
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
