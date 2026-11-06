import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { CopyButton } from './primitives';

/* -------------------------------------------------------------------------- */
/* Toasts                                                                     */
/* -------------------------------------------------------------------------- */

export type ToastTone = 'success' | 'danger' | 'warning' | 'neutral';

interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
}

interface ToastRecord extends ToastInput {
  id: number;
}

interface ToastApi {
  push: (toast: ToastInput) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export const useToast = (): ToastApi => {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error('useToast must be used within <ToastProvider>');
  }
  return api;
};

const TOAST_TONE: Record<ToastTone, { icon: React.ReactNode; className: string }> = {
  success: { icon: <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />, className: 'border-success/30' },
  danger: { icon: <AlertTriangle className="h-4 w-4 text-danger" aria-hidden />, className: 'border-danger/30' },
  warning: { icon: <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />, className: 'border-warning/30' },
  neutral: { icon: <Info className="h-4 w-4 text-ink-muted" aria-hidden />, className: 'border-hairline' },
};

/**
 * Announces operation results. Toasts are additive feedback only — a page must
 * still be correct without them, which is why no page depends on a toast to
 * render its outcome.
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((toast: ToastInput) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-2), { ...toast, id }]);
    window.setTimeout(() => dismiss(id), 6000);
  }, [dismiss]);

  const api = useMemo<ToastApi>(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => {
          const tone = TOAST_TONE[toast.tone ?? 'neutral'];
          return (
            <div
              key={toast.id}
              className={cn(
                'pointer-events-auto flex items-start gap-2 rounded-md border bg-raised px-3 py-2.5 shadow-raised',
                tone.className
              )}
            >
              <span className="mt-0.5">{tone.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-ink">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 break-words text-[11px] leading-snug text-ink-secondary">
                    {toast.description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="rounded p-1 text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                aria-label={`Dismiss notification: ${toast.title}`}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

/* -------------------------------------------------------------------------- */
/* Tooltip                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Supplementary hint only. The wrapped control must already carry its own
 * accessible name; the tooltip is never the sole label.
 */
export const Tooltip: React.FC<{
  label: string;
  children: React.ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}> = ({ label, children, side = 'top', className }) => (
  <span className={cn('group/tooltip relative inline-flex', className)}>
    {children}
    <span
      role="tooltip"
      className={cn(
        'pointer-events-none absolute left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded border border-hairline bg-raised px-2 py-1 text-[10px] text-ink-secondary opacity-0 shadow-raised transition-opacity duration-100',
        'group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100',
        side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
      )}
    >
      {label}
    </span>
  </span>
);

/* -------------------------------------------------------------------------- */
/* Breadcrumbs                                                                */
/* -------------------------------------------------------------------------- */

export interface Crumb {
  label: string;
  to?: string;
}

export const Breadcrumbs: React.FC<{ items: Crumb[]; className?: string }> = ({ items, className }) => (
  <nav aria-label="Breadcrumb" className={cn('mb-2', className)}>
    <ol className="flex flex-wrap items-center gap-1 text-[11px] text-ink-muted">
      {items.map((crumb, index) => {
        const isLast = index === items.length - 1;
        return (
          <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
            {index > 0 ? (
              <span aria-hidden className="text-ink-muted/60">
                /
              </span>
            ) : null}
            {crumb.to && !isLast ? (
              <NavLink to={crumb.to} className="rounded hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
                {crumb.label}
              </NavLink>
            ) : (
              <span aria-current={isLast ? 'page' : undefined} className={isLast ? 'text-ink-secondary' : undefined}>
                {crumb.label}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  </nav>
);

/* -------------------------------------------------------------------------- */
/* Code block                                                                 */
/* -------------------------------------------------------------------------- */

export const CodeBlock: React.FC<{
  code: string;
  label?: string;
  className?: string;
  maxHeight?: string;
}> = ({ code, label, className, maxHeight = '20rem' }) => (
  <div className={cn('overflow-hidden rounded-md border border-hairline bg-inset', className)}>
    <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wide text-ink-muted">{label ?? 'text'}</span>
      <CopyButton value={code} label="Copy" />
    </div>
    <pre
      className="overflow-auto p-3 font-mono text-[11.5px] leading-relaxed text-ink-secondary"
      style={{ maxHeight }}
      tabIndex={0}
    >
      <code>{code}</code>
    </pre>
  </div>
);

/* -------------------------------------------------------------------------- */
/* Segmented sub-navigation                                                   */
/* -------------------------------------------------------------------------- */

export const SegmentedNav: React.FC<{
  label: string;
  items: ReadonlyArray<{ to: string; label: string }>;
  className?: string;
}> = ({ label, items, className }) => (
  <nav aria-label={label} className={cn('mb-4 overflow-x-auto', className)}>
    <ul className="flex w-fit items-center gap-1 rounded-lg border border-hairline bg-inset p-1">
      {items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex h-7 items-center rounded-md px-3 text-xs transition-colors',
                isActive
                  ? 'bg-raised font-medium text-ink shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              )
            }
          >
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  </nav>
);

/* -------------------------------------------------------------------------- */
/* Disclosure heading that generates an id                                    */
/* -------------------------------------------------------------------------- */

export const useDisclosure = (initial = false) => {
  const [open, setOpen] = useState(initial);
  const id = useId();
  const toggle = useCallback(() => setOpen((current) => !current), []);
  return { open, toggle, id };
};

/** Focuses the element when it appears, used by route-level error states. */
export const useAutoFocus = <T extends HTMLElement>() => {
  const ref = React.useRef<T>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
};
