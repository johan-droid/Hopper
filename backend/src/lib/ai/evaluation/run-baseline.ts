/**
 * Baseline Evaluation Runner for Hopper AI Diagnostic Engine
 */

import { runEvaluation } from './evaluator.js';
import { synthesizeDeterministicDiagnosis } from '../diagnose.js';

async function main() {
  console.log('================================================================');
  console.log('   HOPPER PHASE 16: BASELINE AI DIAGNOSTIC EVALUATION (50 CASES)');
  console.log('================================================================\n');

  const summary = await runEvaluation(async (ctx) => {
    return synthesizeDeterministicDiagnosis(ctx);
  });

  console.log(`Total Cases Evaluated:           ${summary.totalCases}`);
  console.log(`Category Accuracy:               ${summary.categoryAccuracy}%`);
  console.log(`Root Cause Accuracy:             ${summary.rootCauseAccuracy}%`);
  console.log(`Average Evidence Precision:      ${summary.averageEvidencePrecision}%`);
  console.log(`Average Evidence Recall:         ${summary.averageEvidenceRecall}%`);
  console.log(`Unsupported Claim Rate:          ${summary.unsupportedClaimRate}%`);
  console.log(`False Confidence Rate:           ${summary.falseConfidenceRate}%`);
  console.log(`Remediation Usefulness Rate:     ${summary.remediationUsefulnessRate}%`);
  console.log(`Structured Output Validity:      ${summary.structuredValidityRate}%`);
  console.log(`Average Latency:                 ${summary.averageLatencyMs} ms`);
  console.log(`Estimated Total Tokens:          ${summary.totalTokens}`);
  console.log(`Estimated Total Cost:            $${summary.totalCostUsd}\n`);

  console.log('Category Breakdown:');
  console.table(summary.categoryBreakdown);

  // Return JSON summary
  return summary;
}

main().catch((err) => {
  console.error('Evaluation run failed:', err);
  process.exit(1);
});

