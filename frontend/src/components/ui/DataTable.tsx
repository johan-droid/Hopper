import React from 'react';
import { cn } from '../../lib/cn';
import { Button, Skeleton } from './primitives';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface Column<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Applied to both header and cell, e.g. `w-24` or `text-right`. */
  className?: string;
  /** Hidden below the `md` breakpoint to keep mobile tables readable. */
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  /** Accessible description of the table for screen readers. */
  caption: string;
  rowAriaLabel?: (row: T) => string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  empty,
  onRowClick,
  caption,
  rowAriaLabel,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="space-y-2 p-5" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading {caption}</span>
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <>{empty ?? <p className="px-5 py-10 text-center text-xs text-ink-muted">No records.</p>}</>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-hairline">
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className={cn(
                  'whitespace-nowrap px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted',
                  column.hideOnMobile && 'hidden md:table-cell',
                  column.className
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const interactive = Boolean(onRowClick);
            return (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-label={rowAriaLabel?.(row)}
                onKeyDown={
                  interactive
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onRowClick?.(row);
                        }
                      }
                    : undefined
                }
                className={cn(
                  'border-b border-hairline/60 last:border-0',
                  interactive &&
                    'cursor-pointer transition-colors hover:bg-overlay/50 focus-visible:bg-overlay/60'
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={cn(
                      'px-4 py-3 align-middle text-ink-secondary',
                      column.hideOnMobile && 'hidden md:table-cell',
                      column.className
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}) => {
  if (totalItems === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(totalItems, page * pageSize);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline px-4 py-2.5 text-xs text-ink-muted"
    >
      <span>
        {start}–{end} of {totalItems}
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          Prev
        </Button>
        <span className="font-mono">
          {page}/{totalPages}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </nav>
  );
};
