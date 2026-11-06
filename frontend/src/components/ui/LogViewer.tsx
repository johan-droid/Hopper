import React, { useMemo, useState } from 'react';
import { CopyButton, Input } from './primitives';
import { cn } from '../../lib/cn';

export interface LogViewerProps {
  /** Raw text. It is always rendered as text nodes — never as HTML. */
  content: string;
  /** 1-based first line number, so extracted excerpts keep their real numbering. */
  startLine?: number;
  className?: string;
  maxHeight?: string;
  /** Lines highlighted as evidence (for example from a diagnosis). */
  highlightLines?: number[];
}

interface RenderedLine {
  number: number;
  text: string;
}

/**
 * Renders untrusted CI logs safely: no `dangerouslySetInnerHTML`, explicit
 * wrapping for long lines, and optional search highlighting built from plain
 * text segments.
 */
export const LogViewer: React.FC<LogViewerProps> = ({
  content,
  startLine = 1,
  className,
  maxHeight = '24rem',
  highlightLines = [],
}) => {
  const [query, setQuery] = useState('');

  const lines = useMemo<RenderedLine[]>(() => {
    const raw = content.replace(/\r\n/g, '\n').split('\n');
    return raw.map((text, index) => ({ number: startLine + index, text }));
  }, [content, startLine]);

  const highlightSet = useMemo(() => new Set(highlightLines), [highlightLines]);
  const normalizedQuery = query.trim().toLowerCase();
  const matchCount = normalizedQuery
    ? lines.filter((line) => line.text.toLowerCase().includes(normalizedQuery)).length
    : 0;

  return (
    <div className={cn('overflow-hidden rounded-md border border-hairline bg-inset', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-3 py-2">
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="log-search">
            Search log lines
          </label>
          <Input
            id="log-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search log lines…"
            className="h-7 w-48 text-xs"
          />
          {normalizedQuery ? (
            <span className="font-mono text-[11px] text-ink-muted" aria-live="polite">
              {matchCount} match{matchCount === 1 ? '' : 'es'}
            </span>
          ) : null}
        </div>
        <CopyButton value={content} label="Copy log" />
      </div>

      <div
        className="overflow-auto font-mono text-[11.5px] leading-[1.65]"
        style={{ maxHeight }}
        tabIndex={0}
        role="region"
        aria-label="CI log output"
      >
        <ol className="min-w-full">
          {lines.map((line) => {
            const isMatch = normalizedQuery && line.text.toLowerCase().includes(normalizedQuery);
            const isEvidence = highlightSet.has(line.number);
            return (
              <li
                key={line.number}
                className={cn(
                  'flex gap-3 border-l-2 px-3',
                  isEvidence
                    ? 'border-l-danger bg-danger/5'
                    : isMatch
                      ? 'border-l-warning bg-warning/5'
                      : 'border-l-transparent'
                )}
              >
                <span className="w-10 shrink-0 select-none text-right text-ink-muted/70" aria-hidden>
                  {line.number}
                </span>
                <span className="log-line whitespace-pre-wrap break-words text-ink-secondary">
                  {line.text || '\u00a0'}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
};
