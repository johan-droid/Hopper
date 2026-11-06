import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous' | 'unconfigured';

interface SessionState {
  status: SessionStatus;
  session: Session | null;
  user: User | null;
  setSession: (session: Session | null) => void;
  setStatus: (status: SessionStatus) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: isSupabaseConfigured ? 'loading' : 'unconfigured',
  session: null,
  user: null,
  setSession: (session) =>
    set({
      session,
      user: session?.user ?? null,
      status: session ? 'authenticated' : isSupabaseConfigured ? 'anonymous' : 'unconfigured',
    }),
  setStatus: (status) => set({ status }),
}));

/**
 * Mirrors the Supabase session lifecycle into the store. Tokens are refreshed by
 * the SDK; the app never synthesises or signs a token of its own.
 */
export function useSessionBootstrap(): void {
  const queryClient = useQueryClient();
  const setSession = useSessionStore((s) => s.setSession);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      useSessionStore.getState().setStatus('unconfigured');
      return;
    }

    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session ?? null);
      })
      .catch(() => {
        if (active) useSessionStore.getState().setStatus('anonymous');
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      setSession(session);
      if (event === 'SIGNED_OUT') {
        queryClient.clear();
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
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

export async function signOut(): Promise<void> {
  if (isSupabaseConfigured) {
    await supabase.auth.signOut().catch(() => undefined);
  }
  useSessionStore.getState().setSession(null);
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  useSessionStore.getState().setSession(data.session);
}

export async function signUpWithPassword(email: string, password: string): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  useSessionStore.getState().setSession(data.session ?? null);
  return { needsConfirmation: !data.session };
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/login`,
  });
  if (error) throw error;
}
