import { z } from 'zod';
import type { TaskComplexity, TaskPriority, TaskType } from './contracts.js';
import {
  DiagnosisOutputSchema,
  type DiagnosisContext,
  buildDiagnosisSystemPrompt,
  buildDiagnosisUserPrompt,
} from '../diagnose.js';

/**
 * Task registry — the single source of truth for what Hopper asks models to do.
 *
 * Every AI call in Hopper is expressed as a named task with:
 *  - a task type (drives model routing / complexity classification)
 *  - a JSON Schema for structured output validation
 *  - a prompt builder that produces the user/system messages
 *
 * App services never build ad-hoc prompts against a provider; they call
 * `aiGateway.execute(task, input, context)` with a task name from this registry.
 */

export interface TaskSpec<I = unknown, O = unknown> {
  readonly name: string;
  readonly type: TaskType;
  readonly description: string;
  /** Preferred complexity tier for routing; actual tier may be overridden per call. */
  readonly complexity: TaskComplexity;
  readonly priority: TaskPriority;
  /** Zod schema for validating the model's structured output. */
  readonly outputSchema: z.ZodType<O>;
  /**
   * Build chat messages from validated input. Implementations must be pure and
   * must not embed secrets (the gateway scrubs messages before transit anyway).
   */
  readonly buildMessages: (input: I) => ChatMessage[];
  /**
   * Whether the provider must return JSON conforming to `outputSchema`.
   * When true the gateway requests JSON mode and validates the response.
   */
  readonly structuredOutput: boolean;
}

export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

const failureEvidenceSchema = z.object({
  summary: z.string(),
  evidence: z.array(z.object({ type: z.string(), detail: z.string(), severity: z.enum(['low', 'medium', 'high']) })),
  failingStep: z.string().optional(),
});

const failureClassifySchema = z.object({
  classification: z.enum(['test_failure', 'build_failure', 'infrastructure', 'flaky', 'timeout', 'unknown']),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

const diagnosisSchema = z.object({
  rootCause: z.string(),
  confidence: z.number().min(0).max(1),
  affectedFiles: z.array(z.string()),
  suggestedFix: z.string(),
  remediation: z.array(z.object({ action: z.string(), rationale: z.string(), risk: z.enum(['low', 'medium', 'high']) })),
});

const remediationSchema = z.object({
  steps: z.array(z.object({ title: z.string(), detail: z.string(), command: z.string().optional() })),
});

const comparisonSchema = z.object({
  differences: z.array(z.object({ aspect: z.string(), first: z.string(), second: z.string(), likelyRelevant: z.boolean() })),
  conclusion: z.string(),
});

const flakinessSchema = z.object({
  isFlaky: z.boolean(),
  score: z.number().min(0).max(1),
  explanation: z.string(),
  suggestedAction: z.string(),
});

const logSummarySchema = z.object({
  summary: z.string(),
  keyEvents: z.array(z.string()),
  suspiciousPatterns: z.array(z.string()),
});

const securityReviewSchema = z.object({
  findings: z.array(z.object({ severity: z.enum(['low', 'medium', 'high', 'critical']), detail: z.string(), recommendation: z.string() })),
  safeToShare: z.boolean(),
});

const prReportSchema = z.object({
  title: z.string(),
  summary: z.string(),
  highlights: z.array(z.string()),
  risks: z.array(z.string()),
});

const repairSchema = z.object({
  repairedJson: z.string(),
  notes: z.string(),
});

/**
 * Register of all Hopper AI tasks. Adding a new capability = add an entry here;
 * routing, validation, budgeting, and telemetry pick it up automatically.
 *
 * `TaskSpec<never, unknown>` is used for the satisfies check because input
 * parameters are contravariant: every concrete input type accepts `never`.
 */
export const TASK_REGISTRY = {
  'failure.classify': {
    name: 'failure.classify',
    type: 'failure.classify',
    description: 'Classify a CI failure from log excerpt and metadata.',
    complexity: 'light',
    priority: 'high',
    outputSchema: failureClassifySchema,
    structuredOutput: true,
    buildMessages: (input: { logExcerpt: string; metadata?: string }) => [
      { role: 'system', content: 'You are a CI failure classifier. Respond ONLY with JSON matching the requested schema.' },
      { role: 'user', content: `Classify this CI failure.\n\nMetadata:\n${input.metadata ?? '(none)'}\n\nLog excerpt:\n${input.logExcerpt}` },
    ],
  },
  'failure.extract_evidence': {
    name: 'failure.extract_evidence',
    type: 'failure.extract_evidence',
    description: 'Extract structured evidence from a failure log.',
    complexity: 'light',
    priority: 'high',
    outputSchema: failureEvidenceSchema,
    structuredOutput: true,
    buildMessages: (input: { logExcerpt: string }) => [
      { role: 'system', content: 'You extract failure evidence from CI logs. Respond ONLY with JSON matching the requested schema.' },
      { role: 'user', content: `Extract evidence from this log:\n\n${input.logExcerpt}` },
    ],
  },
  'failure.diagnose': {
    name: 'failure.diagnose',
    type: 'failure.diagnose',
    description: 'Root-cause a CI failure and propose a fix.',
    complexity: 'heavy',
    priority: 'high',
    outputSchema: z.union([DiagnosisOutputSchema, diagnosisSchema]),
    structuredOutput: true,
    buildMessages: (input: any) => {
      if (input && typeof input === 'object' && 'workflowName' in input) {
        return [
          { role: 'system', content: buildDiagnosisSystemPrompt() },
          { role: 'user', content: buildDiagnosisUserPrompt(input as DiagnosisContext) },
        ];
      }
      return [
        { role: 'system', content: 'You are an expert CI/CD failure diagnostician. Respond ONLY with JSON matching the requested schema.' },
        { role: 'user', content: `Diagnose this failure.\n\nContext:\n${input?.context ?? '(none)'}\n\nPrior evidence:\n${input?.priorEvidence ?? '(none)'}\n\nLog excerpt:\n${input?.logExcerpt ?? ''}` },
      ];
    },
  },
  'failure.suggest_remediation': {
    name: 'failure.suggest_remediation',
    type: 'failure.suggest_remediation',
    description: 'Turn a diagnosis into concrete remediation steps.',
    complexity: 'medium',
    priority: 'medium',
    outputSchema: remediationSchema,
    structuredOutput: true,
    buildMessages: (input: { diagnosis: string }) => [
      { role: 'system', content: 'You propose concrete, safe remediation steps. Respond ONLY with JSON matching the requested schema.' },
      { role: 'user', content: `Propose remediation for this diagnosis:\n\n${input.diagnosis}` },
    ],
  },
  'failure.compare_occurrences': {
    name: 'failure.compare_occurrences',
    type: 'failure.compare_occurrences',
    description: 'Compare two failure occurrences to find what changed.',
    complexity: 'medium',
    priority: 'medium',
    outputSchema: comparisonSchema,
    structuredOutput: true,
    buildMessages: (input: { first: string; second: string }) => [
      { role: 'system', content: 'You compare CI failure occurrences. Respond ONLY with JSON matching the requested schema.' },
      { role: 'user', content: `First occurrence:\n${input.first}\n\nSecond occurrence:\n${input.second}` },
    ],
  },
  'flakiness.explain': {
    name: 'flakiness.explain',
    type: 'flakiness.explain',
    description: 'Explain a flakiness score and recommend action.',
    complexity: 'medium',
    priority: 'low',
    outputSchema: flakinessSchema,
    structuredOutput: true,
    buildMessages: (input: { score: number; history: string }) => [
      { role: 'system', content: 'You explain test flakiness. Respond ONLY with JSON matching the requested schema.' },
      { role: 'user', content: `Flakiness score: ${input.score}\nHistory:\n${input.history}` },
    ],
  },
  'log.summarize': {
    name: 'log.summarize',
    type: 'log.summarize',
    description: 'Summarize a large CI log.',
    complexity: 'light',
    priority: 'medium',
    outputSchema: logSummarySchema,
    structuredOutput: true,
    buildMessages: (input: { logExcerpt: string }) => [
      { role: 'system', content: 'You summarize CI logs. Respond ONLY with JSON matching the requested schema.' },
      { role: 'user', content: `Summarize this log:\n\n${input.logExcerpt}` },
    ],
  },
  'log.security_review': {
    name: 'log.security_review',
    type: 'log.security_review',
    description: 'Scan a log for leaked secrets and security issues.',
    complexity: 'medium',
    priority: 'high',
    outputSchema: securityReviewSchema,
    structuredOutput: true,
    buildMessages: (input: { logExcerpt: string }) => [
      { role: 'system', content: 'You scan CI logs for security issues. Respond ONLY with JSON matching the requested schema.' },
      { role: 'user', content: `Review this log:\n\n${input.logExcerpt}` },
    ],
  },
  'pr.report': {
    name: 'pr.report',
    type: 'pr.report',
    description: 'Generate a PR diagnostic report.',
    complexity: 'medium',
    priority: 'medium',
    outputSchema: prReportSchema,
    structuredOutput: true,
    buildMessages: (input: { findings: string }) => [
      { role: 'system', content: 'You write concise PR reports. Respond ONLY with JSON matching the requested schema.' },
      { role: 'user', content: `Write a PR report from these findings:\n\n${input.findings}` },
    ],
  },
  'ai.repair_output': {
    name: 'ai.repair_output',
    type: 'ai.repair_output',
    description: 'Repair malformed model output back into valid JSON.',
    complexity: 'light',
    priority: 'high',
    outputSchema: repairSchema,
    structuredOutput: true,
    buildMessages: (input: { malformed: string; expectedSchema: string }) => [
      { role: 'system', content: 'You repair malformed JSON. Respond ONLY with JSON matching the requested schema.' },
      { role: 'user', content: `Expected schema:\n${input.expectedSchema}\n\nMalformed output:\n${input.malformed}` },
    ],
  },
} satisfies Record<string, TaskSpec<never, unknown>>;

export type TaskName = keyof typeof TASK_REGISTRY;

export function getTask(name: string): TaskSpec | undefined {
  return (TASK_REGISTRY as Record<string, TaskSpec>)[name];
}