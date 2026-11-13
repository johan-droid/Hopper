import { describe, it } from 'vitest';
import { createServer } from '../src/server/index.js';
import { verifyGitHubWebhookSignature, generateWebhookSignature } from '../src/lib/github/app-auth.js';
import { sliceFailedStepLog } from '../src/lib/parser/log-slicer.js';
import { scrubSecrets } from '../src/lib/parser/secret-scrubber.js';
import { computeFailureSignature } from '../src/lib/parser/fingerprinter.js';
import { getDatabaseExecutor } from '../src/db/client.js';

describe('Phase 12: Performance & Scalability Baseline Benchmarks', () => {
  it('measures real microbenchmarks across core algorithms', async () => {
    console.log('\n--- PERFORMANCE BENCHMARKS ---');

    // 1. HMAC Verification Throughput
    const hmacSecret = 'test_webhook_secret_key_123';
    const payload = JSON.stringify({ action: 'completed', workflow_job: { conclusion: 'failure' } });
    const signature = generateWebhookSignature(payload, hmacSecret);

    const hmacIterations = 1000;
    const hmacStart = performance.now();
    for (let i = 0; i < hmacIterations; i++) {
      verifyGitHubWebhookSignature(payload, signature, hmacSecret);
    }
    const hmacTotalMs = performance.now() - hmacStart;
    const hmacAvgMs = hmacTotalMs / hmacIterations;
    console.log(`[HMAC Verification] ${hmacIterations} iterations in ${hmacTotalMs.toFixed(2)}ms (${hmacAvgMs.toFixed(4)}ms/op, ${(1000 / hmacAvgMs).toFixed(0)} ops/sec)`);

    // 2. Secret Redaction (10,000 lines)
    const sampleLogLines = [
      '2026-11-06T10:00:00Z Running Jest test suite...',
      'AWS_SECRET_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE in runner environment',
      'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.do_not_leak',
      'Connecting to postgresql://postgres:SuperSecretP@ss@db.prod.internal:5432/app',
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEowIBAAKCAQEA0Y14Z2...',
      '-----END RSA PRIVATE KEY-----',
      'FAIL tests/unit/auth.spec.ts: Assertion error at line 42',
    ];
    const largeLog = Array.from({ length: 1250 }, () => sampleLogLines.join('\n')).join('\n'); // 10,000 lines
    const logByteSize = Buffer.byteLength(largeLog, 'utf8');

    const redactStart = performance.now();
    scrubSecrets(largeLog);
    const redactMs = performance.now() - redactStart;
    console.log(`[Secret Scrubber] 10,000 lines (${(logByteSize / 1024).toFixed(1)} KB) scrubbed in ${redactMs.toFixed(2)}ms`);

    // 3. Slicer Context Extraction
    const slicerStart = performance.now();
    const sliced = sliceFailedStepLog(largeLog);
    const slicerMs = performance.now() - slicerStart;
    console.log(`[Log Slicer] 10,000 lines sliced in ${slicerMs.toFixed(2)}ms (Window: ${sliced.cleanedSnippet.split('\n').length} lines)`);

    // 4. Deterministic SHA-256 Fingerprinting
    const fpIterations = 5000;
    const fpStart = performance.now();
    for (let i = 0; i < fpIterations; i++) {
      computeFailureSignature('build-job', 'test-step', 'tests/auth.spec.ts', sliced.cleanedSnippet);
    }
    const fpTotalMs = performance.now() - fpStart;
    const fpAvgMs = fpTotalMs / fpIterations;
    console.log(`[Fingerprinting] ${fpIterations} iterations in ${fpTotalMs.toFixed(2)}ms (${fpAvgMs.toFixed(4)}ms/op)`);

    // 5. Live Database Query Latency
    const db = getDatabaseExecutor();
    const dbSelectStart = performance.now();
    await db.query('SELECT 1 AS num');
    const dbSelectMs = performance.now() - dbSelectStart;
    console.log(`[Database Query] Ping SELECT 1 in ${dbSelectMs.toFixed(2)}ms`);

    // 6. HTTP API Gateway Latency & Concurrency
    const app = createServer();
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const concurrency = 20;
      const apiStart = performance.now();
      const promises = Array.from({ length: concurrency }, () =>
        fetch(`http://127.0.0.1:${port}/api/health`).then((r) => r.json())
      );
      await Promise.all(promises);
      const apiTotalMs = performance.now() - apiStart;
      console.log(`[API Gateway] ${concurrency} concurrent /api/health requests completed in ${apiTotalMs.toFixed(2)}ms (${(apiTotalMs / concurrency).toFixed(2)}ms/req)`);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    console.log('-------------------------------\n');
  });
});
