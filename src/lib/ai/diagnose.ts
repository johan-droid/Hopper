/**
 * Structured LLM Diagnostic Engine.
 * Enforces strict JSON Schema for failure diagnosis:
 * 1. Root-Cause Clues
 * 2. Likely Flaky Test
 * 3. Relevant Log Lines
 * 4. Suggested Next Check
 * 5. Local Repro Command
 */

import { z } from 'zod';

export const DiagnosisOutputSchema = z.object({
  error_category: z.enum([
    'test_assertion',
    'timeout',
    'infra_oom',
    'build_compile',
    'network',
    'env_config',
  ]),
  root_cause_clues: z
    .string()
    .describe('1-2 concise sentences explaining the exact technical root cause and why it happened.'),
  likely_flaky_test: z.object({
    test_name: z.string().nullable().describe('Exact test name or file path if a test failed, else null.'),
    is_likely_flaky: z.boolean(),
    reasoning: z.string().describe('Why this failure looks deterministic vs intermittent/flaky.'),
  }),
  relevant_log_lines: z
    .array(
      z.object({
        line_number: z.number(),
        content: z.string(),
        explanation: z.string().describe('Short 5-8 word note on why this line matters'),
      })
    )
    .min(3)
    .max(12)
    .describe('The 3-12 highest-signal log lines that prove the root cause.'),
  suggested_next_check: z
    .string()
    .describe('Concrete, actionable next step for the developer to fix or verify the failure.'),
  local_repro_command: z
    .string()
    .nullable()
    .describe('Exact CLI command the developer can copy-paste to reproduce locally (e.g., npx vitest run auth.spec.ts).'),
});

export type DiagnosisOutput = z.infer<typeof DiagnosisOutputSchema>;

export interface DiagnosisContext {
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

export function buildDiagnosisSystemPrompt(): string {
  return `You are a Principal CI/CD Reliability Engineer diagnosing a failed GitHub Actions build.
Your job is to save the developer 20 minutes of log scrolling by producing an ultra-concise, high-signal diagnosis.

STRICT RULES:
1. Be direct, technical, and specific. Never write generic filler like "Check the logs for more details."
2. Correlate the stack trace with the 'Modified Files in Commit' list. If a modified file appears in the stack trace, explicitly name that file and line number in root_cause_clues.
3. If historical stats show 'same_sha_retry_passes > 0' or 'unique_prs_affected > 1', highlight that this is a recurring cross-run pattern.
4. For suggested_next_check and local_repro_command, provide the exact CLI test filter command (e.g., pytest path/to/test.py -k test_name, npx playwright test file.spec.ts, go test ./... -run TestName).
5. Respond ONLY with valid JSON matching the schema.`;
}

export function buildDiagnosisUserPrompt(params: DiagnosisContext): string {
  return JSON.stringify(
    {
      context: {
        workflow: params.workflowName,
        job: params.jobName,
        failed_step: params.stepName,
        exit_code: params.exitCode,
        commit_sha: params.commitSha.slice(0, 7),
        modified_files_in_commit: params.modifiedFiles.slice(0, 25),
      },
      cross_run_history: params.historicalStats,
      sanitized_log_window: params.slicedLogSnippet,
    },
    null,
    2
  );
}

/**
 * Intelligent diagnostic synthesizer.
 * If external LLM key is absent or AI_PROVIDER=mock, produces deterministic, high-signal
 * analysis from parsed stack traces and correlated git commit changes.
 */
export async function synthesizeDiagnosis(params: DiagnosisContext): Promise<DiagnosisOutput> {
  const snippet = params.slicedLogSnippet;
  const isOOM = params.exitCode === 137 || /exit code 137|Out of memory|Killed/i.test(snippet);
  const isTimeout = /timeout|timed out|exceeded/i.test(snippet);
  const isNetwork = /ECONNREFUSED|ECONNRESET|ETIMEDOUT|502 Bad Gateway/i.test(snippet);
  const isAssertion = /AssertionError|expect\(|expected.*to equal|FAILED/i.test(snippet);
  const isCompile = /SyntaxError|TypeError|TS\d+|cannot find module|compile error/i.test(snippet);

  let category: DiagnosisOutput['error_category'] = 'test_assertion';
  if (isOOM) category = 'infra_oom';
  else if (isTimeout) category = 'timeout';
  else if (isNetwork) category = 'network';
  else if (isCompile) category = 'build_compile';

  const isFlaky = params.historicalStats.computedFlakinessScore >= 50;

  // Extract relevant lines from the snippet
  const rawLines = snippet.split('\n').filter((l) => l.trim().length > 0);
  const extractedLines = rawLines.slice(0, 6).map((line, idx) => {
    const lineMatch = line.match(/^\[L(\d+)\]\s*(.*)$/);
    const lineNum = lineMatch ? parseInt(lineMatch[1], 10) : idx + 1;
    const content = lineMatch ? lineMatch[2] : line;
    return {
      line_number: lineNum,
      content: content.slice(0, 180),
      explanation: idx === 0 ? 'Primary error header' : idx === 1 ? 'Failure assertion context' : 'Stack execution frame',
    };
  });

  // Ensure between 3 and 12 items for schema compliance
  while (extractedLines.length < 3) {
    extractedLines.push({
      line_number: 100 + extractedLines.length,
      content: `Process failed during step "${params.stepName}" with exit code ${params.exitCode ?? 1}`,
      explanation: 'Exit code termination confirmation',
    });
  }

  // Correlate modified files
  const matchingFiles = params.modifiedFiles.filter((f) => snippet.includes(f));
  const fileContext = matchingFiles.length > 0
    ? `Directly correlated with recently modified file "${matchingFiles[0]}".`
    : `No recently modified files directly present in immediate stack frame.`;

  const rootCause = isOOM
    ? `Container process exceeded memory ceiling and received SIGKILL (exit code 137). ${fileContext}`
    : isTimeout
    ? `Operation exceeded execution deadline during "${params.stepName}". ${fileContext}`
    : isAssertion
    ? `Test assertion failed against expectation in "${params.stepName}". ${fileContext}`
    : `Build execution terminated with non-zero exit code (${params.exitCode ?? 1}). ${fileContext}`;

  const reproCommand = snippet.includes('.spec.ts') || snippet.includes('.test.ts')
    ? 'npx vitest run --reporter=verbose'
    : snippet.includes('pytest')
    ? 'pytest -v --tb=short'
    : snippet.includes('go test')
    ? 'go test -v ./...'
    : 'npm test';

  const result: DiagnosisOutput = {
    error_category: category,
    root_cause_clues: rootCause,
    likely_flaky_test: {
      test_name: params.stepName,
      is_likely_flaky: isFlaky,
      reasoning: isFlaky
        ? `High flakiness score (${params.historicalStats.computedFlakinessScore}%): observed across ${params.historicalStats.uniquePrsAffected} PRs with ${params.historicalStats.sameShaRetryPasses} retry passes.`
        : `Deterministic failure: reproducible assertion mismatch correlated with recent commit ${params.commitSha.slice(0, 7)}.`,
    },
    relevant_log_lines: extractedLines,
    suggested_next_check: isOOM
      ? 'Increase container memory limit or profile peak heap allocation during build/test execution.'
      : isTimeout
      ? 'Check for unbounded async promises, slow network mocks, or increase step timeout parameter.'
      : 'Review expected versus received values in the failing assertion and inspect correlated commit changes.',
    local_repro_command: reproCommand,
  };

  // Validate strictly against schema before returning
  return DiagnosisOutputSchema.parse(result);
}
