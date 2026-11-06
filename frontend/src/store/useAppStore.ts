import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'dark' | 'light' | 'system';

interface UiState {
  theme: ThemePreference;
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  selectedWorkspaceId: string | null;
  setTheme: (theme: ThemePreference) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSelectedWorkspaceId: (id: string | null) => void;
}

/**
 * Client-only UI state. Server data lives exclusively in TanStack Query — this
 * store must never become a second cache of backend records.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'dark',
      sidebarCollapsed: false,
      commandPaletteOpen: false,
      selectedWorkspaceId: null,
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
      setSelectedWorkspaceId: (selectedWorkspaceId) => set({ selectedWorkspaceId }),
    }),
    {
      name: 'hopper.ui',
      partialize: (state) => ({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        selectedWorkspaceId: state.selectedWorkspaceId,
      }),
    }
  )
);
