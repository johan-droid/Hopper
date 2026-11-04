/**
 * Stack Trace Normalizer & Signature Fingerprinter.
 * Strips volatile components (UUIDs, hex addresses, line/col numbers, durations, ports)
 * so recurring failures produce an identical deterministic SHA-256 fingerprint.
 * This powers Hopper's cross-run historical failure moat.
 */

import crypto from 'node:crypto';

export interface ErrorSignature {
  signatureHash: string;
  normalizedTemplate: string;
}

export function computeFailureSignature(
  jobName: string,
  stepName: string,
  testIdentifier: string | null,
  cleanedLogSnippet: string
): ErrorSignature {
  const normalizedLog = cleanedLogSnippet
    // Strip line number annotations [L123]
    .replace(/^\[L\d+\]\s*/gm, '')
    // Replace UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    // Replace memory addresses & hex hashes (7+ chars)
    .replace(/\b0x[0-9a-fA-F]+\b/g, '<HEX>')
    .replace(/\b[0-9a-f]{7,40}\b/g, '<HASH>')
    // Normalize file line:column numbers in stack traces (e.g., auth.ts:142:18 -> auth.ts:<LN>:<COL>)
    .replace(/:(\d+):(\d+)/g, ':<LN>:<COL>')
    // Normalize line numbers without column (e.g. auth.ts:142)
    .replace(/:(\d+)\b/g, ':<LN>')
    // Normalize durations (e.g., "5002 ms", "30.4s")
    .replace(/\b\d+(?:\.\d+)?\s*(?:ms|s|sec|seconds|minutes)\b/gi, '<DURATION>')
    // Normalize dynamic port numbers or PIDs
    .replace(/\b(?:port|pid)\s+\d+\b/gi, 'port <NUM>')
    // Collapse multiple whitespace
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);

  const canonicalKey = [
    `job:${jobName.toLowerCase().trim()}`,
    `step:${stepName.toLowerCase().trim()}`,
    `test:${(testIdentifier || 'none').toLowerCase().trim()}`,
    `trace:${normalizedLog}`,
  ].join('|');

  const signatureHash = crypto.createHash('sha256').update(canonicalKey).digest('hex');

  return {
    signatureHash,
    normalizedTemplate: canonicalKey,
  };
}
