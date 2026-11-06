import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NAV_GROUPS, ROUTES } from '../../lib/routes';
import { useUiStore } from '../../store/useAppStore';
import { cn } from '../../lib/cn';
import { signOut } from '../../features/auth/useSession';
import { CornerDownLeft, LogOut, Moon, Search, Sun } from 'lucide-react';

interface Command {
  id: string;
  label: string;
  section: 'Navigate' | 'Actions';
  keywords: string;
  run: () => void;
  icon: React.ComponentType<{ className?: string }>;
}

export const CommandPalette: React.FC = () => {
  const navigate = useNavigate();
  const open = useUiStore((state) => state.commandPaletteOpen);
  const setOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const navigation = NAV_GROUPS.flatMap((group) =>
      group.items.map((item) => ({
        id: `nav-${item.to}`,
        label: item.label,
        section: 'Navigate' as const,
        keywords: `${item.description} ${group.label}`,
        run: () => navigate(item.to),
        icon: item.icon,
      }))
    );

    return [
      ...navigation,
      {
        id: 'action-theme',
        label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        section: 'Actions',
        keywords: 'appearance colour contrast',
        run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
        icon: theme === 'dark' ? Sun : Moon,
      },
      {
        id: 'action-signout',
        label: 'Sign out',
        section: 'Actions',
        keywords: 'logout session',
        run: () => {
          void signOut().then(() => navigate(ROUTES.landing, { replace: true }));
        },
        icon: LogOut,
      },
    ];
  }, [navigate, setTheme, theme]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.keywords}`.toLowerCase().includes(needle)
    );
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(!open);
        return;
      }
      if (!open) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  useEffect(() => {
    if (open) {
      setQuery('');
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const command = results[activeIndex];
      if (command) {
        command.run();
        setOpen(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm">
      <div className="absolute inset-0" aria-hidden onClick={() => setOpen(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-xl overflow-hidden rounded-lg border border-hairline bg-raised shadow-raised"
      >
        <div className="flex items-center gap-2 border-b border-hairline px-3">
          <Search className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages and actions…"
            aria-label="Search commands"
            aria-controls="command-results"
            aria-activedescendant={results[activeIndex] ? `command-${results[activeIndex].id}` : undefined}
            className="h-11 w-full bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-hairline px-1.5 py-0.5 font-mono text-[10px] text-ink-muted sm:block">
            ESC
          </kbd>
        </div>

        <ul id="command-results" role="listbox" className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-ink-muted">No matching commands.</li>
          ) : (
            results.map((command, index) => {
              const Icon = command.icon;
              return (
                <li key={command.id} role="presentation">
                  <button
                    id={`command-${command.id}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      command.run();
                      setOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs',
                      index === activeIndex ? 'bg-overlay text-ink' : 'text-ink-secondary'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                    <span className="flex-1 truncate">{command.label}</span>
                    <span className="text-[10px] uppercase tracking-wide text-ink-muted">
                      {command.section}
                    </span>
                    {index === activeIndex ? (
                      <CornerDownLeft className="h-3 w-3 text-ink-muted" aria-hidden />
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
};
