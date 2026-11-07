import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { api } from '../../api/client';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous' | 'unconfigured';

export interface HopperUser {
  id: string;
  userId: string;
  login: string;
  email: string | null;
  name: string;
  avatar_url?: string;
  avatarUrl?: string;
  role?: string;
  currentWorkspaceId?: string;
  user_metadata?: Record<string, any>;
}

export interface HopperSession {
  access_token: string;
  token_type: string;
  user: HopperUser;
  expires_at?: number;
}

interface SessionState {
  status: SessionStatus;
  session: HopperSession | null;
  user: HopperUser | null;
  setSession: (session: HopperSession | null) => void;
  setStatus: (status: SessionStatus) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: 'loading',
  session: null,
  user: null,
  setSession: (session) =>
    set({
      session,
      user: session?.user ?? null,
      status: session ? 'authenticated' : 'anonymous',
    }),
  setStatus: (status) => set({ status }),
}));

/**
 * Parses JWT claims from a base64url encoded token.
 */
function parseJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

function buildHopperSession(token: string, profileUser?: Record<string, any>): HopperSession {
  const claims = parseJwtPayload(token) || {};
  const id = profileUser?.profile_id || claims.profile_id || claims.sub || claims.user_id || 'github-user';
  const userId = claims.sub || claims.user_id || id;
  const login = profileUser?.login || claims.login || 'developer';
  const email = profileUser?.email || claims.email || (login ? `${login}@users.noreply.github.com` : null);
  const name = profileUser?.name || claims.name || login;
  const avatarUrl = profileUser?.avatarUrl || profileUser?.avatar_url || claims.avatar_url || `https://github.com/${login}.png`;

  const user: HopperUser = {
    id,
    userId,
    login,
    email,
    name,
    avatar_url: avatarUrl,
    avatarUrl,
    role: claims.role || 'authenticated',
    currentWorkspaceId: claims.current_workspace_id || profileUser?.current_workspace_id,
    user_metadata: {
      user_name: login,
      name,
      avatar_url: avatarUrl,
      ...claims,
      ...profileUser,
    },
  };

  return {
    access_token: token,
    token_type: 'bearer',
    user,
    expires_at: claims.exp,
  };
}

/**
 * Boots session state from either:
 * 1. OAuth callback query parameter (?token=...)
 * 2. Stored Hopper JWT in localStorage
 * 3. Supabase Auth session fallback if configured
 */
export function useSessionBootstrap(): void {
  const queryClient = useQueryClient();
  const setSession = useSessionStore((s) => s.setSession);

  useEffect(() => {
    let active = true;

    async function initializeSession() {
      // 1. Check for OAuth callback in URL
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const callbackToken = urlParams.get('token');
        if (callbackToken) {
          localStorage.setItem('hopper_auth_token', callbackToken);
          // Clean the query parameter without reload
          urlParams.delete('token');
          urlParams.delete('login');
          const cleanSearch = urlParams.toString() ? `?${urlParams.toString()}` : '';
          window.history.replaceState({}, '', `${window.location.pathname}${cleanSearch}`);
        }
      }

      // 2. Check Hopper GitHub auth token
      const storedToken = typeof window !== 'undefined' ? localStorage.getItem('hopper_auth_token') : null;
      if (storedToken) {
        try {
          const authMe = await api.getAuthMe();
          if (active && authMe.success) {
            const hopperSession = buildHopperSession(storedToken, authMe.user);
            setSession(hopperSession);
            return;
          }
        } catch {
          // If token verification failed, try using claims directly or clear stale token
          const claims = parseJwtPayload(storedToken);
          if (claims && claims.exp && claims.exp > Date.now() / 1000) {
            if (active) {
              setSession(buildHopperSession(storedToken));
              return;
            }
          }
          localStorage.removeItem('hopper_auth_token');
        }
      }

      // 3. Fallback to Supabase if configured
      if (isSupabaseConfigured) {
        try {
          const { data } = await supabase.auth.getSession();
          if (active && data.session) {
            const sbUser = data.session.user;
            const hopperSession: HopperSession = {
              access_token: data.session.access_token,
              token_type: data.session.token_type,
              user: {
                id: sbUser.id,
                userId: sbUser.id,
                login: (sbUser.user_metadata?.user_name as string) || (sbUser.email?.split('@')[0] ?? 'developer'),
                email: sbUser.email ?? null,
                name: (sbUser.user_metadata?.full_name as string) || (sbUser.email?.split('@')[0] ?? 'Developer'),
                avatar_url: sbUser.user_metadata?.avatar_url as string | undefined,
                avatarUrl: sbUser.user_metadata?.avatar_url as string | undefined,
                user_metadata: sbUser.user_metadata,
              },
              expires_at: data.session.expires_at,
            };
            setSession(hopperSession);
            return;
          }
        } catch {
          // Supabase session lookup failed
        }
      }

      // 4. Anonymous state (ready for GitHub login)
      if (active) {
        useSessionStore.getState().setStatus('anonymous');
      }
    }

    void initializeSession();

    // Setup Supabase auth change listener if configured
    let unsubscribeSupabase = () => {};
    if (isSupabaseConfigured) {
      const { data: subscription } = supabase.auth.onAuthStateChange((event, sbSession) => {
        if (!active) return;
        if (sbSession) {
          const sbUser = sbSession.user;
          setSession({
            access_token: sbSession.access_token,
            token_type: sbSession.token_type,
            user: {
              id: sbUser.id,
              userId: sbUser.id,
              login: (sbUser.user_metadata?.user_name as string) || (sbUser.email?.split('@')[0] ?? 'developer'),
              email: sbUser.email ?? null,
              name: (sbUser.user_metadata?.full_name as string) || (sbUser.email?.split('@')[0] ?? 'Developer'),
              avatar_url: sbUser.user_metadata?.avatar_url as string | undefined,
              avatarUrl: sbUser.user_metadata?.avatar_url as string | undefined,
              user_metadata: sbUser.user_metadata,
            },
            expires_at: sbSession.expires_at,
          });
        } else if (event === 'SIGNED_OUT') {
          queryClient.clear();
          setSession(null);
        }
      });
      unsubscribeSupabase = () => subscription.subscription.unsubscribe();
    }

    return () => {
      active = false;
      unsubscribeSupabase();
    };
  }, [queryClient, setSession]);
}

export function useSession() {
  const session = useSessionStore((s) => s.session);
  const user = useSessionStore((s) => s.user);
  const status = useSessionStore((s) => s.status);
  const userId = user?.id ?? null;
  return { session, user, status, userId, isAuthenticated: status === 'authenticated' };
}

/**
 * Initiates the pure GitHub OAuth Web Application flow.
 */
export function initiateGitHubOAuth(): void {
  const currentOrigin = window.location.origin;
  const redirectTarget = `${currentOrigin}/login/callback`;
  window.location.href = `/api/auth/github?redirect_uri=${encodeURIComponent(redirectTarget)}`;
}

/**
 * Authenticates with a GitHub Personal Access Token (PAT).
 */
export async function signInWithGitHubToken(token: string): Promise<HopperSession> {
  const result = await api.loginWithGitHubToken(token);
  localStorage.setItem('hopper_auth_token', result.token);
  const session = buildHopperSession(result.token, result.user);
  useSessionStore.getState().setSession(session);
  return session;
}

/**
 * Syncs user GitHub resources (organizations and repositories) into Hopper.
 */
export async function syncGitHub(payload?: { githubToken?: string; workspaceId?: string }) {
  return api.syncGitHub(payload);
}

export async function signOut(): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('hopper_auth_token');
  }
  if (isSupabaseConfigured) {
    await supabase.auth.signOut().catch(() => undefined);
  }
  await api.logout().catch(() => undefined);
  useSessionStore.getState().setSession(null);
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase Auth is not configured. Please use GitHub Authentication.');
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data.session) {
    const sbUser = data.session.user;
    useSessionStore.getState().setSession({
      access_token: data.session.access_token,
      token_type: data.session.token_type,
      user: {
        id: sbUser.id,
        userId: sbUser.id,
        login: (sbUser.user_metadata?.user_name as string) || (sbUser.email?.split('@')[0] ?? 'developer'),
        email: sbUser.email ?? null,
        name: (sbUser.user_metadata?.full_name as string) || (sbUser.email?.split('@')[0] ?? 'Developer'),
        avatar_url: sbUser.user_metadata?.avatar_url as string | undefined,
        avatarUrl: sbUser.user_metadata?.avatar_url as string | undefined,
        user_metadata: sbUser.user_metadata,
      },
      expires_at: data.session.expires_at,
    });
  }
}

export async function signUpWithPassword(email: string, password: string): Promise<{ needsConfirmation: boolean }> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase Auth is not configured. Please use GitHub Authentication.');
  }
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

export async function sendPasswordReset(email: string): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase Auth is not configured. Please use GitHub Authentication.');
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/login`,
  });
  if (error) throw error;
}
