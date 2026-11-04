/**
 * Log Slicer: Extracts a high-signal 15-45 line context window around the actual failure anchor.
 * GitHub Actions logs frequently exceed 20MB-100MB; this algorithm operates in O(1) CPU/memory bounds.
 */

import { stripAnsiAndRunnerNoise } from './ansi-stripper.js';
import { scrubSecrets } from './secret-scrubber.js';

export interface HighlightedLine {
  lineNo: number;
  text: string;
  isErrorAnchor: boolean;
}

export interface SlicedLogResult {
  cleanedSnippet: string;
  highlightedLines: HighlightedLine[];
  detectedExitCode: number | null;
  detectedTestIdentifier: string | null;
  detectedFramework: 'jest' | 'vitest' | 'pytest' | 'go' | 'rspec' | 'cargo' | 'playwright' | 'generic';
}

// High-signal error anchor patterns across languages & test runners
export const ERROR_ANCHOR_PATTERNS: RegExp[] = [
  /^\s*●\s+(.+)$/,                                 // Jest / Vitest test failure header
  /^\s*FAIL\s+([^\s]+\.(?:test|spec)\.[jt]sx?)/,   // Jest / Vitest / Playwright suite fail
  /^_{3,}\s+(.+?)\s+_{3,}$/,                       // Pytest failure section header
  /^E\s+(AssertionError|.*Error|.*Exception):/,    // Pytest assertion line
  /^--- FAIL:\s+([^\s]+)\s+\(/,                    // Go test failure
  /^thread '([^']+)' panicked at/,                 // Rust / Cargo panic
  /^\s*\d+\)\s+(.+?)\s+FAILED$/,                   // RSpec / Cypress failure
  /##\[error\](.+)$/,                              // GitHub Actions explicit step error
  /(?:FATAL|Error|Exception|panic|Segmentation fault|Out of memory|Killed|ELIFECYCLE|ERR!)(?:\b|:)/i,
  /Process completed with exit code (\d+)/i,
];

export function sliceFailedStepLog(rawLog: string, maxLines = 45): SlicedLogResult {
  // Only inspect the last 300KB of the failed step log to bound memory & CPU
  const boundedRaw = rawLog.length > 300_000 ? rawLog.slice(-300_000) : rawLog;

  const cleanText = scrubSecrets(stripAnsiAndRunnerNoise(boundedRaw));

  const lines = cleanText
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  let detectedExitCode: number | null = null;
  let detectedTestIdentifier: string | null = null;
  let detectedFramework: SlicedLogResult['detectedFramework'] = 'generic';
  const anchorIndices: number[] = [];

  // Bottom-up scan to prioritize the final fatal error over earlier warnings
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];

    const exitMatch = line.match(/Process completed with exit code (\d+)/i);
    if (exitMatch && detectedExitCode === null) {
      detectedExitCode = parseInt(exitMatch[1], 10);
    }

    // Detect framework & test identifier
    const jestMatch = line.match(/^\s*●\s+(.+)$/);
    if (jestMatch && !detectedTestIdentifier) {
      detectedTestIdentifier = jestMatch[1].trim();
      detectedFramework = 'jest';
    }

    const pytestMatch = line.match(/^FAILED\s+([^\s]+::[^\s]+)/);
    if (pytestMatch && !detectedTestIdentifier) {
      detectedTestIdentifier = pytestMatch[1].trim();
      detectedFramework = 'pytest';
    }

    const goMatch = line.match(/^--- FAIL:\s+([^\s]+)/);
    if (goMatch && !detectedTestIdentifier) {
      detectedTestIdentifier = goMatch[1].trim();
      detectedFramework = 'go';
    }

    if (ERROR_ANCHOR_PATTERNS.some((rx) => rx.test(line))) {
      anchorIndices.push(i);
      if (anchorIndices.length >= 3) break; // Capture up to 3 primary error clusters
    }
  }

  // Build a merged window around anchor indices (20 lines before, 15 lines after)
  const selectedLineNumbers = new Set<number>();
  const anchorSet = new Set<number>(anchorIndices);

  if (anchorIndices.length > 0) {
    for (const anchorIdx of anchorIndices) {
      const start = Math.max(0, anchorIdx - 20);
      const end = Math.min(lines.length - 1, anchorIdx + 15);
      for (let idx = start; idx <= end; idx++) {
        selectedLineNumbers.add(idx);
      }
    }
  }

  // Always include the final 15 tail lines for exit summary context
  for (let idx = Math.max(0, lines.length - 15); idx < lines.length; idx++) {
    selectedLineNumbers.add(idx);
  }

  const sortedIndices = Array.from(selectedLineNumbers)
    .sort((a, b) => a - b)
    .slice(-maxLines);

  const highlightedLines: HighlightedLine[] = sortedIndices.map((idx) => ({
    lineNo: idx + 1,
    text: lines[idx].slice(0, 300), // Guard against minified single-line dumps
    isErrorAnchor: anchorSet.has(idx),
  }));

  return {
    cleanedSnippet: highlightedLines.map((l) => `[L${l.lineNo}] ${l.text}`).join('\n'),
    highlightedLines,
    detectedExitCode,
    detectedTestIdentifier,
    detectedFramework,
  };
}
