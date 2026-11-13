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
  structuralHash?: string;
  topFrames?: string[];
  failureCategory?: string;
}

/**
 * Extracts normalized stack frames (file path and function name), explicitly
 * stripping line numbers, column numbers, durations, and environment paths.
 */
export function extractNormalizedStackFrames(cleanedLogSnippet: string, limit = 3): string[] {
  const frames: string[] = [];
  const lines = cleanedLogSnippet.split('\n');

  // Match JavaScript / TypeScript stack traces:
  // e.g., "at verifyToken (/app/src/auth/jwt.ts:42:15)" or "at src/auth/jwt.ts:42:15"
  const jsFrameRx = /^\s*at\s+(?:async\s+)?(?:([a-zA-Z0-9_$.<>]+)\s+\((?:.*[/\\])?([^:)]+):\d+(?::\d+)?\)|(?:.*[/\\])?([^:)]+):\d+(?::\d+)?)/;
  // Match Python stack traces:
  // e.g., 'File "/app/auth/verifier.py", line 42, in verify_token'
  const pyFrameRx = /^\s*File\s+"(?:.*[/\\])?([^"]+)",\s+line\s+\d+,\s+in\s+([a-zA-Z0-9_]+)/;
  // Match generic Go / Rust / C++ stack traces
  const genericFrameRx = /(?:.*[/\\])?([a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+):\d+/;

  for (const line of lines) {
    if (frames.length >= limit) break;

    const jsMatch = line.match(jsFrameRx);
    if (jsMatch) {
      const func = jsMatch[1] || 'anonymous';
      const file = jsMatch[2] || jsMatch[3];
      if (file && !file.includes('node_modules')) {
        frames.push(`${file}#${func}`);
        continue;
      }
    }

    const pyMatch = line.match(pyFrameRx);
    if (pyMatch) {
      frames.push(`${pyMatch[1]}#${pyMatch[2]}`);
      continue;
    }

    const genMatch = line.match(genericFrameRx);
    if (genMatch && !genMatch[1].includes('node_modules')) {
      frames.push(`${genMatch[1]}#frame`);
    }
  }

  return frames.slice(0, limit);
}

/**
 * Computes the Tier-1 Structural Frame Hash based on failure category, step name,
 * exit code, and top 3 normalized stack frames.
 */
export function computeStructuralFrameHash(
  stepName: string,
  exitCode: number | null,
  category = 'test_assertion',
  topFrames: string[] = []
): string {
  const normalizedStep = stepName.toLowerCase().trim();
  const normalizedCategory = category.toLowerCase().trim();
  const frameString = topFrames.length > 0 ? topFrames.join('>') : 'no_frames';
  const canonical = `cat:${normalizedCategory}|step:${normalizedStep}|exit:${exitCode ?? 1}|frames:${frameString}`;
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function computeFailureSignature(
  jobName: string,
  stepName: string,
  testIdentifier: string | null,
  cleanedLogSnippet: string,
  options?: { category?: string; exitCode?: number | null }
): ErrorSignature {
  const topFrames = extractNormalizedStackFrames(cleanedLogSnippet, 3);
  const structuralHash = computeStructuralFrameHash(
    stepName,
    options?.exitCode ?? null,
    options?.category ?? 'test_assertion',
    topFrames
  );

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
    structuralHash,
    topFrames,
    failureCategory: options?.category ?? 'test_assertion',
  };
}
