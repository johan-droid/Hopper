import { describe, it, expect } from 'vitest';
import {
  flakinessLabel,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  shortSha,
  truncate,
} from './format';

describe('formatting', () => {
  it('renders durations across unit boundaries', () => {
    expect(formatDuration(480)).toBe('480ms');
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(95_000)).toBe('1m 35s');
    expect(formatDuration(3_900_000)).toBe('1h 5m');
  });

  it('never invents a value for missing data', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(undefined)).toBe('—');
    expect(formatNumber(null)).toBe('—');
    expect(formatPercent(undefined)).toBe('—');
    expect(shortSha(null)).toBe('—');
  });

  it('formats numbers and percentages', () => {
    expect(formatNumber(1248)).toBe('1,248');
    expect(formatPercent(42.6, 1)).toBe('42.6%');
  });

  it('truncates short SHAs to seven characters by default', () => {
    expect(shortSha('0123456789abcdef')).toBe('0123456');
    expect(shortSha('0123456789abcdef', 12)).toBe('0123456789ab');
  });

  it('describes relative time in both directions', () => {
    const now = new Date('2026-11-06T12:00:00Z');
    expect(formatRelativeTime('2026-11-06T11:59:40Z', now)).toBe('just now');
    expect(formatRelativeTime('2026-11-06T11:00:00Z', now)).toBe('1h ago');
    expect(formatRelativeTime('2026-11-01T12:00:00Z', now)).toBe('5d ago');
    expect(formatRelativeTime('2026-11-06T14:00:00Z', now)).toBe('in 2h');
  });

  it('returns the original string when a timestamp cannot be parsed', () => {
    expect(formatRelativeTime('not a date')).toBe('not a date');
  });

  it('maps flakiness scores to descriptive labels, not accuracy claims', () => {
    expect(flakinessLabel(80).label).toBe('Likely flaky');
    expect(flakinessLabel(50).label).toBe('Intermittent');
    expect(flakinessLabel(10).label).toBe('Deterministic');
    expect(flakinessLabel(80).tone).toBe('danger');
  });

  it('truncates long strings with an ellipsis', () => {
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('abc', 4)).toBe('abc');
  });
});
