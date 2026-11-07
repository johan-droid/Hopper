import React, { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/cn';
import { NAV_GROUPS, ROUTES } from '../../lib/routes';
import { useUiStore } from '../../store/useAppStore';
import { useWorkspace } from '../../features/workspace/WorkspaceProvider';
import { IconButton, Spinner } from '../ui/primitives';
import { PanelLeftClose, PanelLeftOpen, X, Zap } from 'lucide-react';

export const Sidebar: React.FC<{ mobileOpen: boolean; onCloseMobile: () => void }> = ({
  mobileOpen,
  onCloseMobile,
}) => {
  const collapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const { workspace, workspaces, setWorkspaceId, loading } = useWorkspace();

  return (
    <>
      {/* Mobile scrim */}
      <div
        className={cn(
          'fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity md:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        aria-hidden
        onClick={onCloseMobile}
      />

      <aside
        aria-label="Primary navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-hairline bg-raised',
          'transition-[width,transform] duration-200 ease-standard md:static md:translate-x-0',
          collapsed ? 'md:w-[68px]' : 'md:w-60',
          'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-hairline px-3">
          <NavLink
            to={ROUTES.overview}
            className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 hover:bg-overlay/60"
            onClick={onCloseMobile}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-contrast">
              <Zap className="h-4 w-4" aria-hidden />
            </span>
            {!collapsed ? (
              <span className="truncate text-sm font-semibold tracking-tight text-ink">Hopper</span>
            ) : null}
          </NavLink>

          <div className="flex items-center gap-1">
            <IconButton
              label="Close navigation"
              size="sm"
              className="md:hidden"
              onClick={onCloseMobile}
            >
              <X className="h-4 w-4" aria-hidden />
            </IconButton>
            <IconButton
              label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              size="sm"
              className="hidden md:inline-flex"
              onClick={toggleSidebar}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" aria-hidden />
              ) : (
                <PanelLeftClose className="h-4 w-4" aria-hidden />
              )}
            </IconButton>
          </div>
        </div>

        <div className="border-b border-hairline px-3 py-3">
          <label
            htmlFor="workspace-selector"
            className={cn('mb-1 block text-[10px] font-medium uppercase tracking-wide text-ink-muted', collapsed && 'md:sr-only')}
          >
            Workspace
          </label>
          {loading ? (
            <div className="flex items-center gap-2 px-1 py-1 text-xs text-ink-muted">
              <Spinner />
              <span className={cn(collapsed && 'md:sr-only')}>Loading…</span>
            </div>
          ) : (
            <select
              id="workspace-selector"
              value={workspace?.id ?? ''}
              onChange={(event) => setWorkspaceId(event.target.value)}
              className={cn(
                'w-full rounded-md border border-hairline bg-inset px-2 py-1.5 text-xs text-ink',
                'focus:border-accent focus:outline-none',
                collapsed && 'md:sr-only'
              )}
              aria-label="Active workspace"
            >
              {workspaces.length === 0 ? <option value="">No workspace</option> : null}
              {workspaces.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          )}
          {workspace && !collapsed ? (
            <p className="mt-1.5 truncate px-1 text-[10px] text-ink-muted">{workspace.type}</p>
          ) : null}
        </div>

        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2 py-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              <p
                className={cn(
                  'px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted',
                  collapsed && 'md:sr-only'
                )}
              >
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        onClick={onCloseMobile}
                        title={collapsed ? item.label : undefined}
                        className={({ isActive }) =>
                          cn(
                            'group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs transition-colors',
                            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
                            isActive
                              ? 'bg-accent/10 font-medium text-ink'
                              : 'text-ink-secondary hover:bg-overlay/60 hover:text-ink'
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <Icon
                              className={cn(
                                'h-4 w-4 shrink-0',
                                isActive ? 'text-accent' : 'text-ink-muted group-hover:text-ink-secondary'
                              )}
                              aria-hidden
                            />
                            <span className={cn('truncate', collapsed && 'md:sr-only')}>{item.label}</span>
                          </>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className={cn('border-t border-hairline px-3 py-2 text-[10px] text-ink-muted flex items-center justify-between', collapsed && 'md:sr-only')}>
          <span>CI/CD intelligence</span>
          <a
            href="https://developer.puter.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-cyan hover:underline transition-colors"
          >
            Powered by Puter
          </a>
        </div>
      </aside>
    </>
  );
};

/** Dark/light/system theme application. */
export function useThemeApplication(): void {
  const theme = useUiStore((state) => state.theme);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      root.classList.toggle('dark', resolved === 'dark');
      root.classList.toggle('light', resolved === 'light');
      root.dataset.theme = resolved;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}
