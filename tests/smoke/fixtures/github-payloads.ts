import type { WorkflowJobEventData } from '../../../src/queue/types.ts';

export const WEBHOOK_SECRET = 'test_webhook_secret_abc123';

// Test payload: Valid failure webhook (Test 1C)
export const VALID_FAILURE_PAYLOAD: WorkflowJobEventData = {
  installationId: 554433,
  orgLogin: 'acme-corp',
  accountType: 'Organization',
  repoFullName: 'acme-corp/monorepo',
  githubRepoId: 123456,
  workflowName: 'CI Pipeline',
  jobName: 'e2e-playwright',
  stepName: 'Run Playwright suite',
  githubRunId: 88001122,
  githubJobId: 99001122,
  githubRunAttempt: 1,
  commitSha: '7f8e9d0c1b2a3f4e5d6c7b8a9f0e1d2c3b4a5f6e',
  branch: 'main',
  prNumber: null,
  actorLogin: 'dependabot[bot]',
  conclusion: 'failure' as const,
  rawLog: '', // Will be filled by tests
  modifiedFiles: ['src/auth/login.spec.ts'],
  runUrl: 'https://github.com/acme-corp/monorepo/actions/runs/88001122',
};

// Test payload: Invalid signature (Test 1A)
export const TAMPERED_PAYLOAD = {
  ...VALID_FAILURE_PAYLOAD,
  // Signature will be computed separately with wrong secret
};

// Test payload: In-progress event (Test 1B)
export const IN_PROGRESS_PAYLOAD = {
  action: 'in_progress' as const,
  workflow_job: {
    conclusion: 'failure',
    run_attempt: 1,
  },
};

// Test payload: Same SHA success webhook (Test 5)
export const SUCCESS_WEBHOOK_PAYLOAD = {
  installationId: 554433,
  orgLogin: 'acme-corp',
  accountType: 'Organization',
  repoFullName: 'acme-corp/monorepo',
  githubRepoId: 123456,
  workflowName: 'CI Pipeline',
  jobName: 'e2e-playwright',
  stepName: 'Run Playwright suite',
  githubRunId: 88001122,
  githubJobId: 99001122,
  githubRunAttempt: 2,
  commitSha: '7f8e9d0c1b2a3f4e5d6c7b8a9f0e1d2c3b4a5f6e',
  branch: 'main',
  prNumber: null,
  actorLogin: 'dependabot[bot]',
  conclusion: 'success' as const,
  rawLog: '',
  modifiedFiles: ['src/auth/login.spec.ts'],
  runUrl: 'https://github.com/acme-corp/monorepo/actions/runs/88001122',
};

// Noisy CI log with ANSI codes, timestamps, and leaked secrets
export const NOISY_CI_LOG = [
  // ANSI escape sequences at the top
  '\u001b[32m:: group ::Checkout\u001b[0m',
  '\u001b[32m:: endgroup ::\u001b[0m',
  '\u001b[1;3m2026-11-04T01:00:00.1234567Z\u001b[0m -- running node@v20',
  '\u001b[33m:: save-file :: writing module.cache\u001b[0m',
  // Secret leaks
  'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  '-----BEGIN RSA PRIVATE KEY-----',
  'postgres://admin:SuperSecretPass123@db.internal:5432/prod',
  'Authorization: Bearer ghp_1234567890abcdefghijklmnopqrstuvwx',
  // Noisy setup lines
  'Installing dependencies...',
  'Loading 256 packages...',
  // The actual failure
  '##[error]Process failed with exit code 1 (non-zero exit).',
  '##[error]Process exited with code 1.',
  'Tests:       1 failed, 99 passed',
  'tests/auth/login.spec.ts > Timeout 30000ms exceeded waiting for selector "#submit-btn"',
  'Error: Timeout of 30000ms exceeded waiting for selector "#submit-btn"',
  // More noisy lines
  ' at process.nextTick (.timers.js: node:internal)',
  ' at Window.wrap (.js: node:internal)',
  // Repeat noise
  ':: set-env :: some-key=some-value',
  ':: add-path :: some-path',
].join('\n');

// Expected cleaned output (secrets redacted, ANSI stripped, timestamps removed)
export const EXPECTED_CLEANED_SNIPPET = [
  '[L1] ##[error] Process failed with exit code 1 (non-zero exit).',
  '[L2] ##[error] Process exited with code 1.',
  '[L3] Tests:       1 failed, 99 passed',
  '[L4] tests/auth/login.spec.ts > Timeout 30000ms exceeded waiting for selector "#submit-btn"',
  '[L5] Error: Timeout of 30000ms exceeded waiting for selector "#submit-btn"',
  // Last 15 tail lines included
  '[L6] Process completed with exit code 1',
  '[L7]     at process.nextTick (.timers.js: node:internal)',
  '[L8] at Window.wrap (.js: node:internal)',
  '[L9] :: set-env :: some-key=some-value',
  '[L10] :: add-path :: some-path',
].join('\n');

// Two stack traces differing only in volatile values, should produce same fingerprint
export const STACK_TRACE_1 = `Error: Timeout of 30000ms exceeded waiting for selector "#submit-btn"
    at process.nextTick (.timers.js: node:internal)
    at Window.wrap (.js: node:internal)
    at tests/auth/login.spec.ts:42:18
    at process.nextTick (.timers.js: node:internal)`;

export const STACK_TRACE_2 = `Error: Timeout of 30000ms exceeded waiting for selector "#submit-btn"
    at process.nextTick (.timers.js: 0x7ffee3b4c8a0)
    at Window.wrap (.js: node:internal)
    at tests/auth/login.spec.ts:42:18
    at process.nextTick (.timers.js: node:internal)`;

export const DETERMINISTIC_SIGNATURE = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef12345678'; // Will be computed

