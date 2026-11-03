/**
 * Structured LLM Diagnostic Engine.
 * Enforces strict JSON Schema for failure diagnosis:
 * 1. Root-Cause Clues
 * 2. Likely Flaky Test
 * 3. Relevant Log Lines
 * 4. Suggested Next Check
 * 5. Local Repro Command
 *
 * Supports live LLM providers (Anthropic Claude 3.5 Haiku / OpenAI)
 * with robust deterministic offline heuristic fallback.
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
 * Calls live Anthropic Claude 3.5 Haiku API.
 */
async function callAnthropicLlm(params: DiagnosisContext, apiKey: string): Promise<DiagnosisOutput> {
  const model = process.env.AI_MODEL || 'claude-3-5-haiku-20241022';
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: buildDiagnosisSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: buildDiagnosisUserPrompt(params),
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API returned status ${response.status}: ${err}`);
  }

  const data = (await response.json()) as any;
  const rawText = data.content?.[0]?.text || '';
  const parsedJson = JSON.parse(rawText);
  return DiagnosisOutputSchema.parse(parsedJson);
}

/**
 * Calls live OpenAI GPT-4o-mini API with structured JSON output.
 */
async function callOpenAiLlm(params: DiagnosisContext, apiKey: string): Promise<DiagnosisOutput> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildDiagnosisSystemPrompt() },
        { role: 'user', content: buildDiagnosisUserPrompt(params) },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API returned status ${response.status}: ${err}`);
  }

  const data = (await response.json()) as any;
  const rawText = data.choices?.[0]?.message?.content || '{}';
  const parsedJson = JSON.parse(rawText);
  return DiagnosisOutputSchema.parse(parsedJson);
}

/**
 * Deterministic rule-based synthesizer used for offline development and fallback.
 */
export function synthesizeDeterministicDiagnosis(params: DiagnosisContext): DiagnosisOutput {
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

  while (extractedLines.length < 3) {
    extractedLines.push({
      line_number: 100 + extractedLines.length,
      content: `Process failed during step "${params.stepName}" with exit code ${params.exitCode ?? 1}`,
      explanation: 'Exit code termination confirmation',
    });
  }

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

  return DiagnosisOutputSchema.parse(result);
}

/**
 * Intelligent diagnostic synthesizer.
 * Calls Anthropic or OpenAI when API keys are available, with seamless
 * fallback to deterministic heuristic synthesis.
 */
export async function synthesizeDiagnosis(params: DiagnosisContext): Promise<DiagnosisOutput> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  if (process.env.AI_PROVIDER !== 'mock') {
    if (anthropicKey && !anthropicKey.includes('mock')) {
      try {
        return await callAnthropicLlm(params, anthropicKey);
      } catch (err: any) {
        console.warn(`[AI] Anthropic diagnosis failed: ${err.message}. Falling back to deterministic analysis.`);
      }
    } else if (openAiKey && !openAiKey.includes('mock')) {
      try {
        return await callOpenAiLlm(params, openAiKey);
      } catch (err: any) {
        console.warn(`[AI] OpenAI diagnosis failed: ${err.message}. Falling back to deterministic analysis.`);
      }
    }
  }

  return synthesizeDeterministicDiagnosis(params);
}
