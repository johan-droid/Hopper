import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut, useSession } from '../../features/auth/useSession';
import { useHealthQuery } from '../../api/hooks';
import { useUiStore } from '../../store/useAppStore';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { Badge, Button, IconButton, Kbd, StatusDot } from '../ui/primitives';
import { ROUTES } from '../../lib/routes';
import { Command, LogOut, Menu, Moon, Search, Sun, User } from 'lucide-react';

export const Topbar: React.FC<{ onOpenMobileNav: () => void }> = ({ onOpenMobileNav }) => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useSession();
  const { workspace } = useWorkspace();
  const { data: health, isLoading: healthLoading, isError: healthError } = useHealthQuery();
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const healthy = health?.status === 'healthy';
  const statusTone = healthLoading ? 'neutral' : healthError ? 'danger' : healthy ? 'success' : 'warning';
  const statusLabel = healthLoading
    ? 'Checking API'
    : healthError
      ? 'API unreachable'
      : healthy
        ? 'All systems operational'
        : 'Degraded';

  const handleSignOut = async () => {
    setUserMenuOpen(false);
    await signOut();
    navigate(ROUTES.landing, { replace: true });
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-hairline bg-raised/90 px-3 backdrop-blur md:px-5">
      <IconButton label="Open navigation" className="md:hidden" onClick={onOpenMobileNav}>
        <Menu className="h-4 w-4" aria-hidden />
      </IconButton>

      <div className="hidden min-w-0 items-center gap-2 md:flex">
        <span className="truncate text-sm font-medium text-ink">{workspace?.name ?? 'Workspace'}</span>
        {workspace ? <Badge tone="neutral">{workspace.type}</Badge> : null}
      </div>

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => setCommandPaletteOpen(true)}
        className="flex h-8 items-center gap-2 rounded-md border border-hairline bg-inset px-2.5 text-xs text-ink-muted transition-colors hover:text-ink"
        aria-label="Open command palette"
      >
        <Search className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">Search or jump to…</span>
        <span className="ml-1 hidden items-center gap-0.5 sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div
        className="flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-[11px] text-ink-secondary"
        title={statusLabel}
      >
        <StatusDot tone={statusTone} pulse={healthLoading} />
        <span className="hidden lg:inline">{statusLabel}</span>
      </div>

      <IconButton
        label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
      </IconButton>

      {isAuthenticated ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setUserMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            className="flex h-8 items-center gap-2 rounded-md border border-hairline px-2 text-xs text-ink-secondary hover:text-ink"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-[10px] font-semibold text-accent">
              {(user?.email?.[0] ?? 'U').toUpperCase()}
            </span>
            <span className="hidden max-w-[140px] truncate sm:inline">{user?.email}</span>
          </button>

          {userMenuOpen ? (
            <>
              <div className="fixed inset-0 z-10" aria-hidden onClick={() => setUserMenuOpen(false)} />
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-md border border-hairline bg-raised py-1 shadow-raised"
              >
                <div className="border-b border-hairline px-3 py-2">
                  <p className="truncate text-xs font-medium text-ink">{user?.email}</p>
                  <p className="mt-0.5 text-[10px] text-ink-muted">Authenticated via Supabase</p>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-secondary hover:bg-overlay hover:text-ink"
                  onClick={() => {
                    setUserMenuOpen(false);
                    navigate(ROUTES.settings);
                  }}
                >
                  <User className="h-3.5 w-3.5" aria-hidden />
                  Profile settings
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-secondary hover:bg-overlay hover:text-ink"
                  onClick={() => {
                    setUserMenuOpen(false);
                    setCommandPaletteOpen(true);
                  }}
                >
                  <Command className="h-3.5 w-3.5" aria-hidden />
                  Command palette
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-danger hover:bg-overlay"
                  onClick={handleSignOut}
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden />
                  Sign out
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <Button size="sm" variant="primary" onClick={() => navigate(ROUTES.login)}>
          Sign in
        </Button>
      )}
    </header>
  );
};
