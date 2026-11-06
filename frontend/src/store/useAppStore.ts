import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export type AppTab =
  | 'landing'
  | 'overview'
  | 'repositories'
  | 'activity'
  | 'investigation'
  | 'history'
  | 'trends'
  | 'integrations'
  | 'settings'
  | 'signatures'
  | 'diagnose'
  | 'billing'
  | 'gateway';
export type PlanTier = 'free' | 'pro_dev' | 'team';

export interface SupabaseUserProfile {
  id: string;
  email?: string;
  user_metadata?: Record<string, any>;
}

interface AppState {
  activeTab: AppTab;
  selectedOrg: string;
  selectedWorkspaceId: string | null;
  selectedRepoId: string | null;
  planTier: PlanTier;
  simulatedPlan: PlanTier;
  selectedSignatureId: string | null;
  supabaseUser: SupabaseUserProfile | null;
  authToken: string | null;
  sessionExpired: boolean;
  authModalOpen: boolean;
  setTab: (tab: AppTab) => void;
  setSelectedOrg: (org: string) => void;
  setSelectedWorkspaceId: (id: string | null) => void;
  setSelectedRepoId: (id: string | null) => void;
  setPlanTier: (plan: PlanTier) => void;
  setSimulatedPlan: (plan: PlanTier) => void;
  setSelectedSignatureId: (id: string | null) => void;
  inspectSignature: (sigId: string) => void;
  inspectFailure: (sigId: string) => void;
  setSupabaseUser: (user: SupabaseUserProfile | null) => void;
  setAuthToken: (token: string | null) => void;
  setSessionExpired: (expired: boolean) => void;
  setAuthModalOpen: (open: boolean) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signInDemo: (userId?: string, email?: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

async function createDevHmacToken(userId: string, email: string): Promise<string> {
  const secret = 'hopper-dev-secret-key-at-least-32-bytes-long-for-hmac-sha256';
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: userId,
    email,
    aud: 'authenticated',
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 86400 * 7, // 7 days
  };

  const toB64Url = (str: string) =>
    btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const h = toB64Url(JSON.stringify(header));
  const p = toB64Url(JSON.stringify(payload));
  const signingInput = `${h}.${p}`;

  const enc = new TextEncoder();
  const key = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await window.crypto.subtle.sign('HMAC', key, enc.encode(signingInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${signingInput}.${sigB64}`;
}

const initialToken = typeof window !== 'undefined' ? localStorage.getItem('hopper_auth_token') : null;
const initialUserJson = typeof window !== 'undefined' ? localStorage.getItem('hopper_auth_user') : null;
const initialUser = initialUserJson ? JSON.parse(initialUserJson) : null;

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'landing',
  selectedOrg: 'acme-corp',
  selectedWorkspaceId: null,
  selectedRepoId: null,
  planTier: 'free',
  simulatedPlan: 'free',
  selectedSignatureId: 'sig_7f8a91c20e14',
  supabaseUser: initialUser,
  authToken: initialToken,
  sessionExpired: false,
  authModalOpen: false,
  setTab: (tab) => set({ activeTab: tab }),
  setSelectedOrg: (org) => set({ selectedOrg: org }),
  setSelectedWorkspaceId: (id) => set({ selectedWorkspaceId: id }),
  setSelectedRepoId: (id) => set({ selectedRepoId: id }),
  setPlanTier: (plan) => set({ planTier: plan, simulatedPlan: plan }),
  setSimulatedPlan: (plan) => set({ planTier: plan, simulatedPlan: plan }),
  setSelectedSignatureId: (id) => set({ selectedSignatureId: id }),
  inspectSignature: (sigId) => set({ selectedSignatureId: sigId, activeTab: 'investigation' }),
  inspectFailure: (sigId) => set({ selectedSignatureId: sigId, activeTab: 'investigation' }),
  setSupabaseUser: (user) => {
    if (user) {
      localStorage.setItem('hopper_auth_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('hopper_auth_user');
    }
    set({ supabaseUser: user });
  },
  setAuthToken: (token) => {
    if (token) {
      localStorage.setItem('hopper_auth_token', token);
    } else {
      localStorage.removeItem('hopper_auth_token');
    }
    set({ authToken: token });
  },
  setSessionExpired: (expired) => set({ sessionExpired: expired }),
  setAuthModalOpen: (open) => set({ authModalOpen: open }),

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const token = data.session?.access_token || null;
    const user = data.user
      ? { id: data.user.id, email: data.user.email, user_metadata: data.user.user_metadata }
      : null;

    if (token) localStorage.setItem('hopper_auth_token', token);
    if (user) localStorage.setItem('hopper_auth_user', JSON.stringify(user));

    set({ supabaseUser: user, authToken: token, sessionExpired: false, authModalOpen: false });
  },

  signUp: async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    const token = data.session?.access_token || null;
    const user = data.user
      ? { id: data.user.id, email: data.user.email, user_metadata: data.user.user_metadata }
      : null;

    if (token) localStorage.setItem('hopper_auth_token', token);
    if (user) localStorage.setItem('hopper_auth_user', JSON.stringify(user));

    set({ supabaseUser: user, authToken: token, authModalOpen: false });
  },

  signInDemo: async (userId = '00000000-0000-0000-0000-000000000001', email = 'alex@hopper.local') => {
    const isProduction = import.meta.env.PROD || import.meta.env.VITE_APP_ENV === 'production';
    if (isProduction) {
      throw new Error('Demo authentication is strictly disabled in production environments');
    }

    const token = await createDevHmacToken(userId, email);
    const user = { id: userId, email, user_metadata: { full_name: 'Alex Johnson (Demo)' } };

    localStorage.setItem('hopper_auth_token', token);
    localStorage.setItem('hopper_auth_user', JSON.stringify(user));

    set({ supabaseUser: user, authToken: token, sessionExpired: false, authModalOpen: false });
  },

  signOut: async () => {
    try {
      await supabase.auth.signOut();
    } catch (_err) {
      // Ignore network errors on signout
    }
    localStorage.removeItem('hopper_auth_token');
    localStorage.removeItem('hopper_auth_user');
    set({ supabaseUser: null, authToken: null, sessionExpired: false });
  },

  resetPassword: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  },
}));
