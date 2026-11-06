/**
 * Formatting helpers. Every function is null-safe and returns an em dash for
 * genuinely unavailable data — the UI must never invent a plausible number.
 */

const EMPTY = '—';

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY;
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY;
  return `${value.toFixed(digits)}%`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms) || ms < 0) return EMPTY;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes < 60) return `${minutes}m ${rest}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function shortSha(sha: string | null | undefined, length = 7): string {
  if (!sha) return EMPTY;
  return sha.slice(0, length);
}

/** Accepts ISO strings and the relative strings some endpoints return. */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return EMPTY;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return EMPTY;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export function formatRelativeTime(
  value: string | null | undefined,
  now: Date = new Date()
): string {
  if (!value) return EMPTY;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const diffMs = now.getTime() - parsed.getTime();
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return future ? `in ${minutes}m` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return future ? `in ${days}d` : `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return future ? `in ${months}mo` : `${months}mo ago`;
  const years = Math.round(months / 12);
  return future ? `in ${years}y` : `${years}y ago`;
}

/**
 * Flakiness is expressed as a 0-100 confidence score by the backend. The label
 * describes the score; it never claims a measured accuracy.
 */
export function flakinessLabel(score: number): {
  label: string;
  tone: 'danger' | 'warning' | 'neutral';
} {
  if (score >= 65) return { label: 'Likely flaky', tone: 'danger' };
  if (score >= 35) return { label: 'Intermittent', tone: 'warning' };
  return { label: 'Deterministic', tone: 'neutral' };
}

export function truncate(value: string, max = 80): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}
