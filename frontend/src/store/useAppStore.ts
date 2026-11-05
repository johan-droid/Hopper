import { create } from 'zustand';

export type AppTab = 'overview' | 'signatures' | 'diagnose' | 'billing' | 'gateway';
export type PlanTier = 'free' | 'pro_dev' | 'team';

interface AppState {
  activeTab: AppTab;
  selectedOrg: string;
  planTier: PlanTier;
  supabaseUser: any | null;
  sessionExpired: boolean;
  setTab: (tab: AppTab) => void;
  setSelectedOrg: (org: string) => void;
  setPlanTier: (plan: PlanTier) => void;
  setSupabaseUser: (user: any | null) => void;
  setSessionExpired: (expired: boolean) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'overview',
  selectedOrg: 'acme-corp',
  planTier: 'free',
  supabaseUser: null,
  sessionExpired: false,
  setTab: (tab) => set({ activeTab: tab }),
  setSelectedOrg: (org) => set({ selectedOrg: org }),
  setPlanTier: (plan) => set({ planTier: plan }),
  setSupabaseUser: (user) => set({ supabaseUser: user }),
  setSessionExpired: (expired) => set({ sessionExpired: expired }),
  signIn: async (email, password) => {
    const { supabase } = window as unknown as { supabase: any };
    const { user, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    set({ supabaseUser: user });
  },
  signUp: async (email, password) => {
    const { supabase } = window as unknown as { supabase: any };
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  },
  signOut: async () => {
    const { supabase } = window as unknown as { supabase: any };
    await supabase.auth.signOut();
    set({ supabaseUser: null, sessionExpired: false });
    // supabase used for auth sign-out
  },
  resetPassword: async (email) => {
    const { supabase } = window as unknown as { supabase: any };
    const { error } = await supabase.auth.resetForPassword({ email });
    if (error) throw error;
  },
}));
