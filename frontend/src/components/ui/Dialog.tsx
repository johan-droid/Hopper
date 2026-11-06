import React, { useEffect, useRef } from 'react';
import { cn } from '../../lib/cn';
import { IconButton } from './primitives';
import { X } from 'lucide-react';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  initialFocusRef?: React.RefObject<HTMLElement>;
}

/**
 * Accessible modal: labelled by its heading, closes on Escape, traps the initial
 * focus, and restores focus to the trigger on close.
 */
export const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  initialFocusRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const target = initialFocusRef?.current ?? containerRef.current;
    target?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused.current?.focus();
    };
  }, [open, onClose, initialFocusRef]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[10vh] backdrop-blur-sm">
      <div
        className="absolute inset-0"
        aria-hidden
        onClick={onClose}
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? 'dialog-description' : undefined}
        tabIndex={-1}
        className={cn(
          'relative w-full max-w-lg rounded-lg border border-hairline bg-raised shadow-raised',
          'focus:outline-none',
          className
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-3.5">
          <div>
            <h2 id="dialog-title" className="text-sm font-semibold text-ink">
              {title}
            </h2>
            {description ? (
              <p id="dialog-description" className="mt-0.5 text-xs text-ink-secondary">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="Close dialog" size="sm" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex justify-end gap-2 border-t border-hairline px-5 py-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
};
