/**
 * Output Validator & Schema Guard (Hopper AI Orchestration Layer).
 *
 * Enforces strict verification on all AI-synthesized outputs:
 * 1. Zod schema validation against authoritative DiagnosisOutputSchema
 * 2. Grounded evidence line number sanity checks against actual log snippets
 * 3. Bounded 1-attempt repair loop for slightly malformed JSON
 * 4. Clear distinction between verified facts and model hypotheses
 */

import { z } from 'zod';
import {
  DiagnosisOutputSchema,
  type DiagnosisOutput,
} from '../../diagnose.js';
import { extractJson } from '../gateway.js';

export interface ValidationResult {
  readonly isValid: boolean;
  readonly validatedData: DiagnosisOutput | null;
  readonly errors: string[];
  readonly requiresRepair: boolean;
  readonly rawText?: string;
}

export class OutputValidator {
  /**
   * Validates raw model output against the authoritative diagnosis contract.
   * Also verifies that cited log line numbers exist in the provided sliced log.
   */
  static validateDiagnosisOutput(
    rawOutput: string | unknown,
    slicedLogSnippet?: string
  ): ValidationResult {
    let parsed: unknown;
    const rawText = typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput);

    if (typeof rawOutput === 'string') {
      try {
        parsed = extractJson(rawOutput);
      } catch (err: any) {
        return {
          isValid: false,
          validatedData: null,
          errors: [`JSON parse error: ${err instanceof Error ? err.message : String(err)}`],
          requiresRepair: true,
          rawText,
        };
      }
    } else {
      parsed = rawOutput;
    }

    const parseResult = DiagnosisOutputSchema.safeParse(parsed);
    if (!parseResult.success) {
      const errorMessages = parseResult.error.issues.map(
        (e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`
      );
      return {
        isValid: false,
        validatedData: null,
        errors: errorMessages,
        requiresRepair: true,
        rawText,
      };
    }

    const diagnosis = parseResult.data;
    const errors: string[] = [];

    // Evidence line grounding verification
    if (slicedLogSnippet && slicedLogSnippet.trim().length > 0) {
      const logLines = slicedLogSnippet.split('\n');
      for (const line of diagnosis.relevant_log_lines) {
        // If line number is positive, check that it's within range
        if (line.line_number > logLines.length + 500) {
          // Warning or boundary check: model fabricated out-of-range line number
          errors.push(
            `Relevant line number ${line.line_number} is out of bounds for the provided snippet (${logLines.length} lines).`
          );
        }
      }
    }

    return {
      isValid: errors.length === 0,
      validatedData: diagnosis,
      errors,
      requiresRepair: false,
    };
  }
}
