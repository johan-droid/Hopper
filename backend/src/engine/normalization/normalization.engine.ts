/**
 * B2. Normalization Engine — Log Slicing & Secret Scrubbing.
 * Responsibilities:
 * - Convert chaotic console logs into structured, normalized evidence frames.
 * - Strip ANSI color codes and non-printable control sequences.
 * - Scrub credentials, JWT tokens, AWS/Stripe keys, and connection strings.
 * - Extract test identifiers, exit codes, and targeted error windows.
 * - Preserve exact line numbers and source citations without hallucination.
 */

import { sliceFailedStepLog, SlicedLogResult, HighlightedLine } from '../../lib/parser/log-slicer.js';
import { scrubSecrets } from '../../lib/parser/secret-scrubber.js';
import { stripAnsiAndRunnerNoise } from '../../lib/parser/ansi-stripper.js';
import { NormalizedEvidence } from '../types.js';

export class NormalizationEngine {
  /**
   * Normalizes raw log output into scrubbed, framed failure evidence.
   */
  normalizeLogOutput(rawLog: string): NormalizedEvidence {
    if (!rawLog || typeof rawLog !== 'string') {
      return {
        cleanedSnippet: '',
        detectedTestIdentifier: null,
        detectedExitCode: null,
        highlightedLines: [],
        scrubbedSecretCount: 0,
      };
    }

    // 1. Strip ANSI formatting and runner noise
    const plainText = stripAnsiAndRunnerNoise(rawLog);

    // 2. Secret Scrubbing (High-entropy keys, passwords, bearer tokens)
    const scrubbedText = scrubSecrets(plainText);

    // 3. Selective Slicing & Error Frame Detection
    const sliced: SlicedLogResult = sliceFailedStepLog(scrubbedText);

    return {
      cleanedSnippet: sliced.cleanedSnippet,
      detectedTestIdentifier: sliced.detectedTestIdentifier,
      detectedExitCode: sliced.detectedExitCode,
      detectedFramework: sliced.detectedFramework,
      highlightedLines: sliced.highlightedLines.map((l: HighlightedLine) => ({
        lineNo: l.lineNo,
        text: l.text,
        isError: l.isErrorAnchor,
      })),
      scrubbedSecretCount: (plainText.length !== scrubbedText.length ? 1 : 0),
    };
  }
}
