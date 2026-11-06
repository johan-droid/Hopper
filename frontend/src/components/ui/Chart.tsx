import React from 'react';
import { cn } from '../../lib/cn';

export interface SeriesPoint {
  label: string;
  value: number;
}

/**
 * Minimal SVG bar chart. Deliberately dependency-free: the app must not pull a
 * charting runtime into the initial bundle for two views. Bars are described by
 * an accessible table so the data is not imagery-only.
 */
export const BarChart: React.FC<{
  data: SeriesPoint[];
  title: string;
  valueLabel: string;
  height?: number;
  tone?: 'accent' | 'danger';
  className?: string;
  emptyMessage?: string;
}> = ({ data, title, valueLabel, height = 140, tone = 'accent', className, emptyMessage }) => {
  if (data.length === 0) {
    return (
      <p className={cn('px-5 py-10 text-center text-xs text-ink-muted', className)}>
        {emptyMessage ?? 'No data for this period.'}
      </p>
    );
  }

  const max = Math.max(...data.map((point) => point.value), 1);

  return (
    <figure className={cn('px-5 pb-4 pt-2', className)}>
      <figcaption className="sr-only">
        {title}. {valueLabel}.
      </figcaption>
      <div className="flex items-end gap-1.5" style={{ height }} aria-hidden>
        {data.map((point) => {
          const ratio = point.value / max;
          return (
            <div key={point.label} className="group flex h-full flex-1 flex-col justify-end">
              <div
                className={cn(
                  'w-full rounded-t-sm transition-colors',
                  tone === 'danger' ? 'bg-danger/70 group-hover:bg-danger' : 'bg-accent/70 group-hover:bg-accent'
                )}
                style={{ height: `${Math.max(ratio * 100, 3)}%` }}
                title={`${point.label}: ${point.value}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-ink-muted">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Bucket</th>
            <th scope="col">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              <td>{point.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
};

export const DistributionBar: React.FC<{
  items: Array<{ label: string; value: number }>;
  total: number;
  emptyMessage?: string;
}> = ({ items, total, emptyMessage }) => {
  if (total === 0 || items.length === 0) {
    return <p className="px-5 py-8 text-center text-xs text-ink-muted">{emptyMessage ?? 'No data.'}</p>;
  }

  return (
    <ul className="space-y-2.5 px-5 pb-5 pt-2">
      {items.map((item) => {
        const percent = Math.round((item.value / total) * 100);
        return (
          <li key={item.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className="truncate font-mono text-ink-secondary">{item.label}</span>
              <span className="shrink-0 font-mono text-ink-muted">
                {item.value} · {percent}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-overlay" aria-hidden>
              <div className="h-full rounded-full bg-accent/80" style={{ width: `${percent}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
};
