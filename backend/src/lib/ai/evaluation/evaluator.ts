/**
 * Evaluation Engine for Hopper AI Diagnosis Quality & Reliability (Phase 16)
 *
 * Runs the evaluation dataset against a target diagnosis function
 * and calculates rigorous accuracy, relevance, confidence, and latency metrics.
 */

import { EVALUATION_DATASET, EvaluationCase } from './dataset.js';
import { DiagnosisOutput, DiagnosisContext, DiagnosisOutputSchema } from '../diagnose.js';

export interface CaseEvaluationResult {
  caseId: string;
  name: string;
  category: string;
  difficulty: string;
  predictedCategory: string;
  categoryCorrect: boolean;
  rootCauseAccuracy: number; // 0.0 to 1.0 score
  evidencePrecision: number;
  evidenceRecall: number;
  unsupportedClaim: boolean;
  falseConfidence: boolean;
  remediationActionable: boolean;
  structuredValid: boolean;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export interface EvaluationSummary {
  totalCases: number;
  categoryAccuracy: number; // %
  rootCauseAccuracy: number; // %
  averageEvidencePrecision: number; // %
  averageEvidenceRecall: number; // %
  unsupportedClaimRate: number; // %
  falseConfidenceRate: number; // %
  remediationUsefulnessRate: number; // %
  structuredValidityRate: number; // %
  averageLatencyMs: number;
  totalTokens: number;
  totalCostUsd: number;
  categoryBreakdown: Record<
    string,
    {
      total: number;
      correctCategory: number;
      averageRootCauseScore: number;
    }
  >;
  results: CaseEvaluationResult[];
}

export type DiagnosisFunction = (ctx: DiagnosisContext) => Promise<DiagnosisOutput>;

export async function runEvaluation(
  diagnoseFn: DiagnosisFunction,
  options: { dataset?: EvaluationCase[]; modelName?: string } = {}
): Promise<EvaluationSummary> {
  const dataset = options.dataset || EVALUATION_DATASET;
  const results: CaseEvaluationResult[] = [];

  const categoryBreakdown: Record<
    string,
    { total: number; correctCategory: number; averageRootCauseScore: number }
  > = {};

  for (const item of dataset) {
    if (!categoryBreakdown[item.category]) {
      categoryBreakdown[item.category] = {
        total: 0,
        correctCategory: 0,
        averageRootCauseScore: 0,
      };
    }
    categoryBreakdown[item.category].total++;

    const start = performance.now();
    let diagnosis: DiagnosisOutput;
    let structuredValid = true;

    const ctx: DiagnosisContext = {
      workflowName: 'CI Pipeline',
      jobName: 'Test & Build',
      stepName: item.stepName,
      exitCode: item.exitCode,
      commitSha: 'c0ffee112233445566778899aabbccddeeff0011',
      modifiedFiles: item.modifiedFiles,
      historicalStats: item.historicalStats,
      slicedLogSnippet: item.rawLog.trim(),
    };

    try {
      diagnosis = await diagnoseFn(ctx);
    } catch {
      structuredValid = false;
      diagnosis = DiagnosisOutputSchema.parse({
        error_category: 'test_assertion',
        root_cause_clues: 'Diagnostic execution failed.',
        likely_flaky_test: { test_name: null, is_likely_flaky: false, reasoning: 'Failure' },
        relevant_log_lines: [
          { line_number: 1, content: 'Error', explanation: 'Failed' },
          { line_number: 2, content: 'Error', explanation: 'Failed' },
          { line_number: 3, content: 'Error', explanation: 'Failed' },
        ],
        suggested_next_check: 'Check server error.',
        local_repro_command: null,
      });
    }
    const latencyMs = Math.round((performance.now() - start) * 10) / 10;

    // 1. Category Accuracy
    const categoryCorrect =
      diagnosis.error_category === item.category ||
      // Mapping for baseline 6-category engine
      (item.category === 'flaky_test' && diagnosis.likely_flaky_test.is_likely_flaky) ||
      (item.category === 'resource_exhaustion' && diagnosis.error_category === 'infra_oom') ||
      (item.category === 'network_infra' && diagnosis.error_category === 'network') ||
      (item.category === 'dependency_resolution' && diagnosis.error_category === 'build_compile') ||
      (item.category === 'database_connectivity' && (diagnosis.error_category === 'network' || diagnosis.error_category === 'env_config'));

    if (categoryCorrect) {
      categoryBreakdown[item.category].correctCategory++;
    }

    // 2. Root Cause Accuracy (Keyword & Concept Overlap)
    const lowerClues = (diagnosis.root_cause_clues || '').toLowerCase();
    let matchedKeywords = 0;
    for (const kw of item.relevantEvidenceKeywords) {
      if (lowerClues.includes(kw.toLowerCase())) {
        matchedKeywords++;
      }
    }
    const rootCauseScore = Math.min(
      1.0,
      matchedKeywords / Math.max(1, Math.min(3, item.relevantEvidenceKeywords.length))
    );
    categoryBreakdown[item.category].averageRootCauseScore += rootCauseScore;

    // 3. Evidence Relevance (Precision & Recall)
    const logText = item.rawLog.toLowerCase();
    let relevantLinesInLog = 0;
    let relevantMatches = 0;
    for (const line of diagnosis.relevant_log_lines) {
      const lineContent = line.content.toLowerCase().trim();
      if (logText.includes(lineContent.slice(0, 30))) {
        relevantLinesInLog++;
      }
      for (const kw of item.relevantEvidenceKeywords) {
        if (lineContent.includes(kw.toLowerCase())) {
          relevantMatches++;
          break;
        }
      }
    }
    const evidencePrecision =
      diagnosis.relevant_log_lines.length > 0
        ? Math.round((relevantLinesInLog / diagnosis.relevant_log_lines.length) * 100)
        : 0;
    const evidenceRecall =
      item.relevantEvidenceKeywords.length > 0
        ? Math.round(
            (Math.min(item.relevantEvidenceKeywords.length, relevantMatches) /
              item.relevantEvidenceKeywords.length) *
              100
          )
        : 0;

    // 4. Unsupported Claims
    let unsupportedClaim = false;
    for (const line of diagnosis.relevant_log_lines) {
      if (line.content.length > 10 && !logText.includes(line.content.toLowerCase().slice(0, 25))) {
        unsupportedClaim = true;
        break;
      }
    }

    // 5. False Confidence
    // If flakiness is 0 but diagnosis claims is_likely_flaky, or flakiness is high (>70) but claims deterministic
    const falseConfidence =
      (item.historicalStats.computedFlakinessScore === 0 && diagnosis.likely_flaky_test.is_likely_flaky && item.category !== 'flaky_test') ||
      (item.historicalStats.computedFlakinessScore >= 70 && !diagnosis.likely_flaky_test.is_likely_flaky && item.category === 'flaky_test');

    // 6. Remediation Actionable
    const remediationActionable =
      Boolean(diagnosis.suggested_next_check && diagnosis.suggested_next_check.length > 15) &&
      Boolean(diagnosis.local_repro_command && diagnosis.local_repro_command.length > 5);

    // 7. Token Consumption & Cost Estimation
    // ~4 chars per token rule of thumb for logs + prompt overhead
    const promptTokens = Math.round((item.rawLog.length + 800) / 4);
    const completionTokens = Math.round(JSON.stringify(diagnosis).length / 4);
    // Claude 3.5 Haiku pricing: $0.80 / 1M prompt, $4.00 / 1M completion
    const costUsd = Number(
      ((promptTokens * 0.0000008) + (completionTokens * 0.000004)).toFixed(6)
    );

    results.push({
      caseId: item.id,
      name: item.name,
      category: item.category,
      difficulty: item.difficulty,
      predictedCategory: diagnosis.error_category,
      categoryCorrect,
      rootCauseAccuracy: Math.round(rootCauseScore * 100) / 100,
      evidencePrecision,
      evidenceRecall,
      unsupportedClaim,
      falseConfidence,
      remediationActionable,
      structuredValid,
      latencyMs,
      promptTokens,
      completionTokens,
      costUsd,
    });
  }

  // Aggregate Metrics
  const totalCases = results.length;
  const correctCategories = results.filter((r) => r.categoryCorrect).length;
  const totalRootScore = results.reduce((acc, r) => acc + r.rootCauseAccuracy, 0);
  const totalPrecision = results.reduce((acc, r) => acc + r.evidencePrecision, 0);
  const totalRecall = results.reduce((acc, r) => acc + r.evidenceRecall, 0);
  const unsupportedCount = results.filter((r) => r.unsupportedClaim).length;
  const falseConfCount = results.filter((r) => r.falseConfidence).length;
  const usefulRemediationCount = results.filter((r) => r.remediationActionable).length;
  const validStructuredCount = results.filter((r) => r.structuredValid).length;
  const totalLatency = results.reduce((acc, r) => acc + r.latencyMs, 0);
  const totalTokens = results.reduce((acc, r) => acc + r.promptTokens + r.completionTokens, 0);
  const totalCostUsd = results.reduce((acc, r) => acc + r.costUsd, 0);

  for (const cat of Object.keys(categoryBreakdown)) {
    const b = categoryBreakdown[cat];
    b.averageRootCauseScore = Math.round((b.averageRootCauseScore / b.total) * 100) / 100;
  }

  return {
    totalCases,
    categoryAccuracy: Math.round((correctCategories / totalCases) * 1000) / 10,
    rootCauseAccuracy: Math.round((totalRootScore / totalCases) * 1000) / 10,
    averageEvidencePrecision: Math.round((totalPrecision / totalCases) * 10) / 10,
    averageEvidenceRecall: Math.round((totalRecall / totalCases) * 10) / 10,
    unsupportedClaimRate: Math.round((unsupportedCount / totalCases) * 1000) / 10,
    falseConfidenceRate: Math.round((falseConfCount / totalCases) * 1000) / 10,
    remediationUsefulnessRate: Math.round((usefulRemediationCount / totalCases) * 1000) / 10,
    structuredValidityRate: Math.round((validStructuredCount / totalCases) * 1000) / 10,
    averageLatencyMs: Math.round((totalLatency / totalCases) * 10) / 10,
    totalTokens,
    totalCostUsd: Number(totalCostUsd.toFixed(4)),
    categoryBreakdown,
    results,
  };
}

