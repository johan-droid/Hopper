/**
 * B4. Diagnosis Engine — Central Diagnostic Orchestrator.
 * Responsibilities:
 * - Coordinates technical failure classification across 10 deterministic categories.
 * - Extracts verifiable evidence quotes with exact line numbers.
 * - Synthesizes structured root-cause explanations and advisory remediation.
 * - Prioritizes deterministic pattern matching when more reliable or when offline.
 * - Enforces the passive-data constraint: zero autonomous code or shell execution.
 */

import {
  synthesizeDiagnosis,
  synthesizeDeterministicDiagnosis,
  DiagnosisContext,
  DiagnosisOutput,
} from '../../lib/ai/diagnose.js';
import { NormalizedEvidence, PipelineContext } from '../types.js';

export class DiagnosisEngine {
  /**
   * Executes diagnosis synthesis combining deterministic patterns and single-provider AI.
   */
  async diagnose(params: {
    workflowName: string;
    jobName: string;
    stepName: string;
    commitSha: string;
    evidence: NormalizedEvidence;
    context: PipelineContext;
    flakinessScore: number;
    historicalStats: {
      totalOccurrences: number;
      uniquePrsAffected: number;
      sameShaRetryPasses: number;
    };
  }): Promise<DiagnosisOutput> {
    const diagnosisContext: DiagnosisContext = {
      workflowName: params.workflowName,
      jobName: params.jobName,
      stepName: params.stepName,
      exitCode: params.evidence.detectedExitCode,
      commitSha: params.commitSha,
      modifiedFiles: params.context.modifiedFiles,
      historicalStats: {
        totalOccurrences: params.historicalStats.totalOccurrences,
        uniquePrsAffected: params.historicalStats.uniquePrsAffected,
        sameShaRetryPasses: params.historicalStats.sameShaRetryPasses,
        computedFlakinessScore: params.flakinessScore,
      },
      slicedLogSnippet: params.evidence.cleanedSnippet,
      commitDiffSnippet: params.context.commitDiff,
      workflowDefinition: params.context.workflowDefinition,
    };

    // Invoke the single configured AI provider (with automatic deterministic fallback on failure)
    return synthesizeDiagnosis(diagnosisContext);
  }

  /**
   * Explicit deterministic fallback diagnosis running at $0 token cost.
   */
  diagnoseDeterministic(params: {
    workflowName: string;
    jobName: string;
    stepName: string;
    commitSha: string;
    evidence: NormalizedEvidence;
    flakinessScore: number;
    reason?: string;
  }): DiagnosisOutput {
    return synthesizeDeterministicDiagnosis(
      {
        workflowName: params.workflowName,
        jobName: params.jobName,
        stepName: params.stepName,
        exitCode: params.evidence.detectedExitCode,
        commitSha: params.commitSha,
        modifiedFiles: [],
        historicalStats: {
          totalOccurrences: 1,
          uniquePrsAffected: 1,
          sameShaRetryPasses: 0,
          computedFlakinessScore: params.flakinessScore,
        },
        slicedLogSnippet: params.evidence.cleanedSnippet,
      },
      params.reason
    );
  }
}

