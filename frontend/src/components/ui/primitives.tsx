import React from 'react';
import { cn } from '../../lib/cn';
import { AlertCircle, Check, Copy, Loader2, RefreshCw } from 'lucide-react';

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-contrast hover:bg-accent/90 shadow-sm disabled:bg-accent/50',
  secondary:
    'bg-overlay text-ink border border-hairline hover:bg-overlay/70 disabled:text-ink-muted',
  ghost: 'text-ink-secondary hover:text-ink hover:bg-overlay/60 disabled:text-ink-muted',
  danger: 'bg-danger text-white hover:bg-danger/90 disabled:bg-danger/50',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', loading, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors duration-[var(--motion-fast)]',
        'disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md';
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, label, size = 'md', children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-md text-ink-secondary transition-colors',
        'hover:bg-overlay hover:text-ink disabled:cursor-not-allowed disabled:text-ink-muted',
        size === 'sm' ? 'h-7 w-7' : 'h-8 w-8',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});

/* -------------------------------------------------------------------------- */
/* Badges and status                                                          */
/* -------------------------------------------------------------------------- */

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-overlay text-ink-secondary border-hairline',
  accent: 'bg-accent/10 text-accent border-accent/30',
  success: 'bg-success/10 text-success border-success/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  danger: 'bg-danger/10 text-danger border-danger/30',
  info: 'bg-info/10 text-info border-info/30',
};

export const Badge: React.FC<{
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
  mono?: boolean;
}> = ({ tone = 'neutral', children, className, mono }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5',
      mono && 'font-mono',
      TONE_CLASSES[tone],
      className
    )}
  >
    {children}
  </span>
);

const DOT_COLORS: Record<Tone, string> = {
  neutral: 'bg-ink-muted',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
};

export const StatusDot: React.FC<{ tone?: Tone; pulse?: boolean; className?: string }> = ({
  tone = 'neutral',
  pulse,
  className,
}) => (
  <span
    aria-hidden
    className={cn(
      'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
      DOT_COLORS[tone],
      pulse && 'animate-pulse',
      className
    )}
  />
);

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

export const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className,
  children,
}) => <section className={cn('surface rounded-lg shadow-raised', className)}>{children}</section>;

export const CardHeader: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}> = ({ title, description, actions, className }) => (
  <div className={cn('flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3', className)}>
    <div className="min-w-0">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {description ? <p className="mt-0.5 text-xs text-ink-secondary">{description}</p> : null}
    </div>
    {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
  </div>
);

export const PageHeader: React.FC<{
  title: string;
  description?: string;
  breadcrumbs?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ title, description, breadcrumbs, actions }) => (
  <header className="mb-6">
    {breadcrumbs ? <div className="mb-2 text-xs text-ink-muted">{breadcrumbs}</div> : null}
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-ink-secondary">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  </header>
);

export const Divider: React.FC<{ className?: string }> = ({ className }) => (
  <hr className={cn('border-0 border-t border-hairline', className)} />
);

export const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="rounded border border-hairline bg-overlay px-1.5 py-0.5 font-mono text-[10px] text-ink-secondary">
    {children}
  </kbd>
);

/* -------------------------------------------------------------------------- */
/* Form controls                                                              */
/* -------------------------------------------------------------------------- */

const CONTROL_CLASSES =
  'w-full rounded-md border border-hairline bg-inset px-3 text-sm text-ink placeholder:text-ink-muted ' +
  'transition-colors focus:border-accent focus:outline-none focus-visible:outline-none disabled:opacity-60';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(CONTROL_CLASSES, 'h-9', className)} {...props} />;
  }
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(CONTROL_CLASSES, 'py-2 leading-relaxed', className)} {...props} />;
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(CONTROL_CLASSES, 'h-9 cursor-pointer pr-8', className)} {...props}>
      {children}
    </select>
  );
});

export const Field: React.FC<{
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}> = ({ label, htmlFor, hint, error, children }) => (
  <div className="space-y-1.5">
    <label htmlFor={htmlFor} className="block text-xs font-medium text-ink-secondary">
      {label}
    </label>
    {children}
    {error ? (
      <p role="alert" className="text-xs text-danger">
        {error}
      </p>
    ) : hint ? (
      <p className="text-xs text-ink-muted">{hint}</p>
    ) : null}
  </div>
);

/* -------------------------------------------------------------------------- */
/* Feedback                                                                   */
/* -------------------------------------------------------------------------- */

export const Spinner: React.FC<{ className?: string; label?: string }> = ({
  className,
  label = 'Loading',
}) => (
  <span role="status" aria-label={label} className={cn('inline-flex items-center gap-2', className)}>
    <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden />
    <span className="sr-only">{label}</span>
  </span>
);

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('animate-pulse rounded-md bg-overlay', className)} aria-hidden />
);

export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon, title, description, action, className }) => (
  <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
    {icon ? <div className="mb-3 text-ink-muted">{icon}</div> : null}
    <h3 className="text-sm font-semibold text-ink">{title}</h3>
    {description ? (
      <p className="mt-1 max-w-md text-xs leading-relaxed text-ink-secondary">{description}</p>
    ) : null}
    {action ? <div className="mt-4">{action}</div> : null}
  </div>
);

export const ErrorState: React.FC<{
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}> = ({ title = 'Something went wrong', message, onRetry, className }) => (
  <div
    role="alert"
    className={cn(
      'flex flex-col items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 px-5 py-4',
      className
    )}
  >
    <div className="flex items-start gap-2">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">{message}</p>
      </div>
    </div>
    {onRetry ? (
      <Button size="sm" variant="secondary" onClick={onRetry}>
        <RefreshCw className="h-3 w-3" aria-hidden />
        Retry
      </Button>
    ) : null}
  </div>
);

export const InlineNotice: React.FC<{
  tone?: Tone;
  title?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ tone = 'info', title, children, className }) => (
  <div
    className={cn(
      'rounded-md border px-4 py-3 text-xs leading-relaxed',
      TONE_CLASSES[tone],
      className
    )}
  >
    {title ? <p className="mb-0.5 font-semibold">{title}</p> : null}
    <div className="text-ink-secondary">{children}</div>
  </div>
);

/* -------------------------------------------------------------------------- */
/* Metric                                                                     */
/* -------------------------------------------------------------------------- */

export const MetricCard: React.FC<{
  label: string;
  value?: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
  /**
   * Set when the API cannot supply this metric. The card then reports
   * "Unavailable" instead of rendering a placeholder number.
   */
  unavailableReason?: string;
}> = ({ label, value, hint, tone = 'neutral', unavailableReason }) => (
  <div className="surface rounded-lg px-4 py-3.5">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</span>
      <StatusDot tone={tone} />
    </div>
    {unavailableReason ? (
      <>
        <p className="mt-2 text-sm text-ink-muted">Unavailable</p>
        <p className="mt-1 text-[11px] leading-snug text-ink-muted">{unavailableReason}</p>
      </>
    ) : (
      <>
        <p className="mt-1.5 font-mono text-2xl font-semibold leading-tight text-ink">{value}</p>
        {hint ? <p className="mt-1 text-[11px] leading-snug text-ink-muted">{hint}</p> : null}
      </>
    )}
  </div>
);

/* -------------------------------------------------------------------------- */
/* Copy button                                                                */
/* -------------------------------------------------------------------------- */

export const CopyButton: React.FC<{ value: string; label?: string; size?: 'sm' | 'md' }> = ({
  value,
  label = 'Copy',
  size = 'sm',
}) => {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Button size={size} variant="ghost" onClick={copy} aria-live="polite">
      {copied ? <Check className="h-3 w-3 text-success" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
      {copied ? 'Copied' : label}
    </Button>
  );
};
