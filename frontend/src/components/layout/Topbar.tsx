import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { signOut, useSession, syncGitHub } from '../../features/auth/useSession';
import { useHealthQuery, queryKeys } from '../../api/hooks';
import { useUiStore } from '../../store/useAppStore';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { Badge, Button, IconButton, Kbd, StatusDot } from '../ui/primitives';
import { Tooltip, useToast } from '../ui/feedback';
import { ROUTES } from '../../lib/routes';
import { Command, LogOut, Menu, Moon, Search, Sun, User, RefreshCw, Github, Sparkles } from 'lucide-react';

export const Topbar: React.FC<{ onOpenMobileNav: () => void }> = ({ onOpenMobileNav }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { user, isAuthenticated } = useSession();
  const { workspace, workspaceId } = useWorkspace();
  const { data: health, isLoading: healthLoading, isError: healthError } = useHealthQuery();
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const healthy = health?.status === 'healthy';
  const statusTone = healthLoading ? 'neutral' : healthError ? 'danger' : healthy ? 'success' : 'warning';
  const statusLabel = healthLoading
    ? 'Checking API'
    : healthError
      ? 'API unreachable'
      : healthy
        ? 'All systems operational'
        : 'Degraded';

  const handleSyncGitHub = async () => {
    setSyncing(true);
    try {
      const res = await syncGitHub({ workspaceId: workspaceId ?? undefined });
      await queryClient.invalidateQueries({ queryKey: queryKeys.repositories(workspaceId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspaces(user?.id ?? null) });
      toast.push({
        tone: 'success',
        title: 'GitHub Sync Complete',
        description: `Synced ${res.stats.organizationsSynced} organizations and ${res.stats.repositoriesSynced} repositories.`,
      });
    } catch (err: any) {
      toast.push({
        tone: 'danger',
        title: 'GitHub Sync Failed',
        description: err.message || 'Could not synchronize with GitHub.',
      });
    } finally {
      setSyncing(false);
    }
  };

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

      <Tooltip label="Launch Zero-Backend Puter.js Edition (DeepSeek, GPT-4o, Qwen, Gemini)">
        <a
          href="/puter/"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:inline-flex items-center gap-1.5 rounded-md border border-cyan/40 bg-cyan/10 px-2 py-1 text-[11px] font-medium text-cyan hover:bg-cyan/20 transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5 text-cyan" aria-hidden />
          <span>Puter AI Serverless</span>
        </a>
      </Tooltip>

      <Tooltip label={statusLabel}>
        <div className="flex items-center gap-1.5 rounded-md border border-hairline px-2 py-1 text-[11px] text-ink-secondary">
          <StatusDot tone={statusTone} pulse={healthLoading} />
          <span className="hidden lg:inline">{statusLabel}</span>
        </div>
      </Tooltip>

      <Tooltip label={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
        <IconButton
          label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
        </IconButton>
      </Tooltip>

      {isAuthenticated ? (
        <Tooltip label="Synchronize organizations and repositories from GitHub">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleSyncGitHub}
            disabled={syncing}
            className="hidden sm:inline-flex items-center gap-1.5 h-8 text-xs font-normal"
          >
            <RefreshCw className={`h-3 w-3 ${syncing ? 'animate-spin text-accent' : ''}`} />
            <span>{syncing ? 'Syncing…' : 'Sync GitHub'}</span>
          </Button>
        </Tooltip>
      ) : null}

      {isAuthenticated ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setUserMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            className="flex h-8 items-center gap-2 rounded-md border border-hairline px-2 text-xs text-ink-secondary hover:text-ink"
          >
            {user?.avatar_url || user?.avatarUrl ? (
              <img
                src={user.avatar_url || user.avatarUrl}
                alt={user.login || 'User'}
                className="h-5 w-5 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-[10px] font-semibold text-accent">
                {((user?.login || user?.email || 'U')[0]).toUpperCase()}
              </span>
            )}
            <span className="hidden max-w-[140px] truncate sm:inline">
              {user?.login ? `@${user.login}` : user?.email}
            </span>
          </button>

          {userMenuOpen ? (
            <>
              <div className="fixed inset-0 z-10" aria-hidden onClick={() => setUserMenuOpen(false)} />
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-md border border-hairline bg-raised py-1 shadow-raised"
              >
                <div className="border-b border-hairline px-3 py-2">
                  <p className="truncate text-xs font-medium text-ink">
                    {user?.name || user?.login || user?.email}
                  </p>
                  <p className="truncate text-[11px] text-ink-muted">
                    {user?.email || (user?.login ? `@${user.login}` : '')}
                  </p>
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-accent">
                    <Github className="h-3 w-3" />
                    <span>Authenticated via GitHub</span>
                  </div>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-secondary hover:bg-overlay hover:text-ink"
                  onClick={() => {
                    setUserMenuOpen(false);
                    void handleSyncGitHub();
                  }}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  Sync GitHub Resources
                </button>
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
