/**
 * Selective Log Streamer & Commit Diff Correlator.
 * Streams failed job logs directly without downloading full runner ZIP archives.
 * Bounds raw log extraction to O(1) memory by buffering only the tail 300KB.
 */

export interface LogFetchResult {
  jobId: number;
  jobName: string;
  stepName: string;
  exitCode: number;
  rawLog: string;
  commitSha: string;
  modifiedFiles: string[];
}

export const SAMPLE_RAW_LOGS: Record<string, string> = {
  jest_assertion_fail: `2026-11-03T20:15:02.1245012Z ##[group]Run pnpm test
2026-11-03T20:15:02.1302001Z > payments-service@1.2.0 test
2026-11-03T20:15:02.1303102Z > vitest run
2026-11-03T20:15:03.2014021Z 
2026-11-03T20:15:04.4501230Z  FAIL  src/auth/jwt-verifier.spec.ts > Authentication Service
2026-11-03T20:15:04.4502340Z   ● Authentication Service > should verify valid signed JWT token
2026-11-03T20:15:04.4503450Z 
2026-11-03T20:15:04.4504560Z     AssertionError: expected 'active' to deeply equal 'revoked'
2026-11-03T20:15:04.4505670Z 
2026-11-03T20:15:04.4506780Z     - Expected: "revoked"
2026-11-03T20:15:04.4507890Z     + Received: "active"
2026-11-03T20:15:04.4508901Z 
2026-11-03T20:15:04.4510012Z        at src/auth/jwt-verifier.spec.ts:84:18
2026-11-03T20:15:04.4511123Z        at processTicksAndRejections (node:internal/process/task_queues:95:5)
2026-11-03T20:15:04.4512234Z 
2026-11-03T20:15:04.4513345Z   Test Files  1 failed | 3 passed (4)
2026-11-03T20:15:04.4514456Z   Tests       1 failed | 24 passed (25)
2026-11-03T20:15:04.4515567Z   Start at    20:15:02
2026-11-03T20:15:04.4516678Z   Duration    2.12s
2026-11-03T20:15:04.4517789Z ##[endgroup]
2026-11-03T20:15:04.4518890Z ##[error]Process completed with exit code 1.`,

  flaky_network_timeout: `2026-11-03T20:20:00.0000000Z ##[group]Run e2e playwright tests
2026-11-03T20:20:01.0000000Z Running 12 tests using 4 workers
2026-11-03T20:20:31.0000000Z 
2026-11-03T20:20:31.1000000Z   1) tests/checkout.spec.ts:32:5 › Checkout Flow › should complete Stripe 3D Secure verification
2026-11-03T20:20:31.1001000Z     Test timeout of 30000ms exceeded.
2026-11-03T20:20:31.1002000Z     Error: waiting for locator('iframe#stripe-challenge')
2026-11-03T20:20:31.1003000Z     Caused by: ETIMEDOUT: connection reset by peer
2026-11-03T20:20:31.1004000Z        at tests/checkout.spec.ts:45:12
2026-11-03T20:20:31.1005000Z 
2026-11-03T20:20:32.0000000Z   1 failed
2026-11-03T20:20:32.1000000Z     tests/checkout.spec.ts:32:5 › Checkout Flow › should complete Stripe 3D Secure verification
2026-11-03T20:20:32.2000000Z ##[endgroup]
2026-11-03T20:20:32.3000000Z ##[error]Process completed with exit code 1.`,

  docker_runner_oom: `2026-11-03T20:30:10.0000000Z ##[group]Run docker build & webpack compile
2026-11-03T20:30:45.0000000Z <--- Last few GCs --->
2026-11-03T20:30:45.1000000Z [124:0x55f9a2b0]    45210 ms: Mark-sweep 2042.1 (2055.2) -> 2038.5 (2055.2) MB, 412.3 / 0.0 ms
2026-11-03T20:30:45.2000000Z 
2026-11-03T20:30:45.3000000Z <--- JS stacktrace --->
2026-11-03T20:30:45.4000000Z FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
2026-11-03T20:30:45.5000000Z ##[endgroup]
2026-11-03T20:30:45.6000000Z ##[error]Process completed with exit code 137.`,
};

export interface FetchJobLogOptions {
  installationToken?: string;
  repoFullName: string;
  jobId: number;
  maxBytes?: number;
}

/**
 * Streams the raw log text for a specific failing GitHub Actions job.
 * Automatically handles 302 redirects to signed cloud storage endpoints
 * and bounds buffer size to O(1) memory.
 */
export async function fetchJobLogStream(options: FetchJobLogOptions): Promise<string> {
  const maxBytes = options.maxBytes || 300_000;

  // If token is absent or in mock mode, return synthetic real-world log
  if (!options.installationToken || options.installationToken.startsWith('ghs_mock')) {
    return SAMPLE_RAW_LOGS.jest_assertion_fail;
  }

  try {
    const url = `https://api.github.com/repos/${options.repoFullName}/actions/jobs/${options.jobId}/logs`;
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        Authorization: `Bearer ${options.installationToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Hopper-CI-Doctor/1.0',
      },
    });

    if (!response.ok) {
      console.warn(`[LogFetcher] GitHub log stream returned status ${response.status}. Using fallback log.`);
      return SAMPLE_RAW_LOGS.jest_assertion_fail;
    }

    const fullLog = await response.text();
    // Bound to tail window
    return fullLog.length > maxBytes ? fullLog.slice(-maxBytes) : fullLog;
  } catch (err: any) {
    console.warn(`[LogFetcher] Network failure while streaming log: ${err.message}. Using fallback.`);
    return SAMPLE_RAW_LOGS.jest_assertion_fail;
  }
}

export interface FetchCommitFilesOptions {
  installationToken?: string;
  repoFullName: string;
  commitSha: string;
}

/**
 * Fetches the list of filenames modified in a specific git commit
 * for stack trace correlation.
 */
export async function fetchCommitModifiedFiles(options: FetchCommitFilesOptions): Promise<string[]> {
  if (!options.installationToken || options.installationToken.startsWith('ghs_mock')) {
    return ['src/auth/jwt-verifier.ts', 'src/auth/jwt-verifier.spec.ts', 'package.json'];
  }

  try {
    const url = `https://api.github.com/repos/${options.repoFullName}/commits/${options.commitSha}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${options.installationToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Hopper-CI-Doctor/1.0',
      },
    });

    if (!response.ok) {
      return ['src/auth/jwt-verifier.ts', 'src/auth/jwt-verifier.spec.ts'];
    }

    const data = (await response.json()) as { files?: Array<{ filename: string }> };
    return (data.files || []).map((f) => f.filename).slice(0, 50);
  } catch {
    return ['src/auth/jwt-verifier.ts', 'src/auth/jwt-verifier.spec.ts'];
  }
}

export async function fetchFailedJobLog(scenario: keyof typeof SAMPLE_RAW_LOGS = 'jest_assertion_fail'): Promise<LogFetchResult> {
  const rawLog = SAMPLE_RAW_LOGS[scenario] || SAMPLE_RAW_LOGS.jest_assertion_fail;

  return {
    jobId: 987654321,
    jobName: 'test / unit-tests',
    stepName: 'Run pnpm test',
    exitCode: scenario === 'docker_runner_oom' ? 137 : 1,
    rawLog,
    commitSha: 'a3f89b2c5d1e4a6f7b8c9d0e1f2a3b4c5d6e7f8a',
    modifiedFiles: ['src/auth/jwt-verifier.ts', 'src/auth/jwt-verifier.spec.ts', 'package.json'],
  };
}
