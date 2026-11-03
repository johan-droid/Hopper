import { z } from 'zod';
export { createServer } from './server/index.js';
import 'express-serve-static-core';

/**
 * Strips ANSI escape sequences, GitHub Actions timestamps, and internal runner noise.
 */
declare const ANSI_REGEX: RegExp;
declare const GH_TIMESTAMP_REGEX: RegExp;
declare const GH_RUNNER_NOISE_REGEX: RegExp;
declare function stripAnsiAndRunnerNoise(raw: string): string;

/**
 * Secret Scrubber: Zero-leakage guarantee before LLM transmission or database storage.
 * Scrubs tokens, private keys, cloud credentials, database URLs, and bearer tokens.
 */
interface SecretPattern {
    name: string;
    pattern: RegExp;
    replacement: string;
}
declare const SECRET_PATTERNS: SecretPattern[];
declare function scrubSecrets(input: string): string;

/**
 * Log Slicer: Extracts a high-signal 15-45 line context window around the actual failure anchor.
 * GitHub Actions logs frequently exceed 20MB-100MB; this algorithm operates in O(1) CPU/memory bounds.
 */
interface HighlightedLine {
    lineNo: number;
    text: string;
    isErrorAnchor: boolean;
}
interface SlicedLogResult {
    cleanedSnippet: string;
    highlightedLines: HighlightedLine[];
    detectedExitCode: number | null;
    detectedTestIdentifier: string | null;
    detectedFramework: 'jest' | 'vitest' | 'pytest' | 'go' | 'rspec' | 'cargo' | 'playwright' | 'generic';
}
declare const ERROR_ANCHOR_PATTERNS: RegExp[];
declare function sliceFailedStepLog(rawLog: string, maxLines?: number): SlicedLogResult;

/**
 * Stack Trace Normalizer & Signature Fingerprinter.
 * Strips volatile components (UUIDs, hex addresses, line/col numbers, durations, ports)
 * so recurring failures produce an identical deterministic SHA-256 fingerprint.
 * This powers Hopper's cross-run historical failure moat.
 */
interface ErrorSignature {
    signatureHash: string;
    normalizedTemplate: string;
}
declare function computeFailureSignature(jobName: string, stepName: string, testIdentifier: string | null, cleanedLogSnippet: string): ErrorSignature;

/**
 * Flakiness Engine: Computes a 0-100% flakiness probability based on:
 * 1. Same-SHA Retry Passes (Commit failed on attempt 1, passed on attempt 2)
 * 2. Cross-PR Spread (Same error signature across unrelated PRs)
 * 3. Default branch failure frequency (Occurring on main)
 * 4. Transient error pattern recognition (Timeouts, network resets, docker OOM, race conditions)
 */
interface FlakinessInput {
    sameShaRetryPasses: number;
    uniquePrsAffected: number;
    totalOccurrences: number;
    mainBranchOccurrences: number;
    cleanedSnippet: string;
}
declare const TRANSIENT_PATTERNS: RegExp[];
declare function calculateFlakinessScore(input: FlakinessInput): number;

/**
 * Structured LLM Diagnostic Engine.
 * Enforces strict JSON Schema for failure diagnosis:
 * 1. Root-Cause Clues
 * 2. Likely Flaky Test
 * 3. Relevant Log Lines
 * 4. Suggested Next Check
 * 5. Local Repro Command
 */

declare const DiagnosisOutputSchema: z.ZodObject<{
    error_category: z.ZodEnum<["test_assertion", "timeout", "infra_oom", "build_compile", "network", "env_config"]>;
    root_cause_clues: z.ZodString;
    likely_flaky_test: z.ZodObject<{
        test_name: z.ZodNullable<z.ZodString>;
        is_likely_flaky: z.ZodBoolean;
        reasoning: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        test_name: string | null;
        is_likely_flaky: boolean;
        reasoning: string;
    }, {
        test_name: string | null;
        is_likely_flaky: boolean;
        reasoning: string;
    }>;
    relevant_log_lines: z.ZodArray<z.ZodObject<{
        line_number: z.ZodNumber;
        content: z.ZodString;
        explanation: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        line_number: number;
        content: string;
        explanation: string;
    }, {
        line_number: number;
        content: string;
        explanation: string;
    }>, "many">;
    suggested_next_check: z.ZodString;
    local_repro_command: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    error_category: "test_assertion" | "timeout" | "infra_oom" | "build_compile" | "network" | "env_config";
    root_cause_clues: string;
    likely_flaky_test: {
        test_name: string | null;
        is_likely_flaky: boolean;
        reasoning: string;
    };
    relevant_log_lines: {
        line_number: number;
        content: string;
        explanation: string;
    }[];
    suggested_next_check: string;
    local_repro_command: string | null;
}, {
    error_category: "test_assertion" | "timeout" | "infra_oom" | "build_compile" | "network" | "env_config";
    root_cause_clues: string;
    likely_flaky_test: {
        test_name: string | null;
        is_likely_flaky: boolean;
        reasoning: string;
    };
    relevant_log_lines: {
        line_number: number;
        content: string;
        explanation: string;
    }[];
    suggested_next_check: string;
    local_repro_command: string | null;
}>;
type DiagnosisOutput = z.infer<typeof DiagnosisOutputSchema>;
interface DiagnosisContext {
    workflowName: string;
    jobName: string;
    stepName: string;
    exitCode: number | null;
    commitSha: string;
    modifiedFiles: string[];
    historicalStats: {
        totalOccurrences: number;
        uniquePrsAffected: number;
        sameShaRetryPasses: number;
        computedFlakinessScore: number;
    };
    slicedLogSnippet: string;
}
declare function buildDiagnosisSystemPrompt(): string;
declare function buildDiagnosisUserPrompt(params: DiagnosisContext): string;
/**
 * Intelligent diagnostic synthesizer.
 * If external LLM key is absent or AI_PROVIDER=mock, produces deterministic, high-signal
 * analysis from parsed stack traces and correlated git commit changes.
 */
declare function synthesizeDiagnosis(params: DiagnosisContext): Promise<DiagnosisOutput>;

/**
 * Paywall & Quota Guard: Enforces monthly run limits and tier-based feature gates.
 *
 * Tier Matrix:
 * - Free: 30 runs/mo, 24h retention, basic sticky comment
 * - Pro ($9/mo): 250 runs/mo, 30d retention, cross-run pattern history, flaky test matrix
 * - Team ($29/mo): 1,000 runs/mo, 90d retention, Slack/Discord alerts, auto-retry policies
 */
type PlanTier = 'free' | 'pro_dev' | 'team';
interface PlanLimits {
    monthlyRuns: number;
    retentionDays: number;
    slackAlerts: boolean;
    crossRunMoatUnlocked: boolean;
    autoRetryFlaky: boolean;
}
declare const PLAN_LIMITS: Record<PlanTier, PlanLimits>;
interface QuotaCheckResult {
    allowed: boolean;
    plan: PlanTier;
    runsUsed: number;
    limit: number;
    remainingRuns: number;
    exhaustionNotice?: string;
}
declare function checkQuota(plan: PlanTier, runsUsed: number, billingUrl?: string): QuotaCheckResult;

/**
 * GitHub App Authentication & Webhook Signature Verification.
 * Uses crypto.timingSafeEqual to prevent timing attacks on HMAC-SHA256 digests.
 */
declare function verifyGitHubWebhookSignature(payloadRaw: string | Buffer, signatureHeader: string | undefined, secret: string): boolean;
declare function generateWebhookSignature(payloadRaw: string, secret: string): string;

/**
 * Log Fetcher & Diff Correlator.
 * Streams failed job logs directly without downloading entire runner zip archives.
 */
interface LogFetchResult {
    jobId: number;
    jobName: string;
    stepName: string;
    exitCode: number;
    rawLog: string;
    commitSha: string;
    modifiedFiles: string[];
}
declare const SAMPLE_RAW_LOGS: Record<string, string>;
declare function fetchFailedJobLog(scenario?: keyof typeof SAMPLE_RAW_LOGS): Promise<LogFetchResult>;

/**
 * Sticky GitHub PR Report Renderer & Paywall Conversion Hook.
 * Updates a single sticky comment per PR (using marker comment tag) so build failures never spam the PR conversation.
 */

declare const STICKY_COMMENT_MARKER = "<!-- ci-failure-diagnosis-sticky-marker -->";
interface RenderReportParams {
    orgPlan: PlanTier;
    repoFullName: string;
    workflowName: string;
    jobName: string;
    stepName: string;
    commitSha: string;
    runUrl: string;
    dashboardReportUrl: string;
    billingUpgradeUrl: string;
    flakinessScore: number;
    historicalStats: {
        totalOccurrences: number;
        uniquePrsAffected: number;
        sameShaRetryPasses: number;
    };
    diagnosis: DiagnosisOutput;
}
declare function renderGitHubPrComment(p: RenderReportParams): string;

export { ANSI_REGEX, type DiagnosisContext, type DiagnosisOutput, DiagnosisOutputSchema, ERROR_ANCHOR_PATTERNS, type ErrorSignature, type FlakinessInput, GH_RUNNER_NOISE_REGEX, GH_TIMESTAMP_REGEX, type HighlightedLine, type LogFetchResult, PLAN_LIMITS, type PlanLimits, type PlanTier, type QuotaCheckResult, type RenderReportParams, SAMPLE_RAW_LOGS, SECRET_PATTERNS, STICKY_COMMENT_MARKER, type SecretPattern, type SlicedLogResult, TRANSIENT_PATTERNS, buildDiagnosisSystemPrompt, buildDiagnosisUserPrompt, calculateFlakinessScore, checkQuota, computeFailureSignature, fetchFailedJobLog, generateWebhookSignature, renderGitHubPrComment, scrubSecrets, sliceFailedStepLog, stripAnsiAndRunnerNoise, synthesizeDiagnosis, verifyGitHubWebhookSignature };
