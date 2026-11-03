// src/lib/github/log-fetcher.ts
var SAMPLE_RAW_LOGS = {
  jest_assertion_fail: `2026-11-03T20:15:02.1245012Z ##[group]Run pnpm test
2026-11-03T20:15:02.1302001Z > payments-service@1.2.0 test
2026-11-03T20:15:02.1303102Z > vitest run
2026-11-03T20:15:03.2014021Z 
2026-11-03T20:15:04.4501230Z  FAIL  src/auth/jwt-verifier.spec.ts > Authentication Service
2026-11-03T20:15:04.4502340Z   \u25CF Authentication Service > should verify valid signed JWT token
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
2026-11-03T20:20:31.1000000Z   1) tests/checkout.spec.ts:32:5 \u203A Checkout Flow \u203A should complete Stripe 3D Secure verification
2026-11-03T20:20:31.1001000Z     Test timeout of 30000ms exceeded.
2026-11-03T20:20:31.1002000Z     Error: waiting for locator('iframe#stripe-challenge')
2026-11-03T20:20:31.1003000Z     Caused by: ETIMEDOUT: connection reset by peer
2026-11-03T20:20:31.1004000Z        at tests/checkout.spec.ts:45:12
2026-11-03T20:20:31.1005000Z 
2026-11-03T20:20:32.0000000Z   1 failed
2026-11-03T20:20:32.1000000Z     tests/checkout.spec.ts:32:5 \u203A Checkout Flow \u203A should complete Stripe 3D Secure verification
2026-11-03T20:20:32.2000000Z ##[endgroup]
2026-11-03T20:20:32.3000000Z ##[error]Process completed with exit code 1.`,
  docker_runner_oom: `2026-11-03T20:30:10.0000000Z ##[group]Run docker build & webpack compile
2026-11-03T20:30:45.0000000Z <--- Last few GCs --->
2026-11-03T20:30:45.1000000Z [124:0x55f9a2b0]    45210 ms: Mark-sweep 2042.1 (2055.2) -> 2038.5 (2055.2) MB, 412.3 / 0.0 ms
2026-11-03T20:30:45.2000000Z 
2026-11-03T20:30:45.3000000Z <--- JS stacktrace --->
2026-11-03T20:30:45.4000000Z FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
2026-11-03T20:30:45.5000000Z ##[endgroup]
2026-11-03T20:30:45.6000000Z ##[error]Process completed with exit code 137.`
};
async function fetchFailedJobLog(scenario = "jest_assertion_fail") {
  const rawLog = SAMPLE_RAW_LOGS[scenario] || SAMPLE_RAW_LOGS.jest_assertion_fail;
  return {
    jobId: 987654321,
    jobName: "test / unit-tests",
    stepName: "Run pnpm test",
    exitCode: scenario === "docker_runner_oom" ? 137 : 1,
    rawLog,
    commitSha: "a3f89b2c5d1e4a6f7b8c9d0e1f2a3b4c5d6e7f8a",
    modifiedFiles: ["src/auth/jwt-verifier.ts", "src/auth/jwt-verifier.spec.ts", "package.json"]
  };
}

export {
  SAMPLE_RAW_LOGS,
  fetchFailedJobLog
};
//# sourceMappingURL=chunk-MCQB2HZ2.js.map