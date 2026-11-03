# Engineering Specification & SDLC Blueprint: CI Failure Diagnosis SaaS

**Target MVP Timeline:** 3–7 Days (Prototype) $\rightarrow$ 6 Weeks (Multi-Tenant Commercial SaaS)  
**Target Buyer:** Engineering teams with slow CI pipelines ($20\text{--}60+$ minutes) and large, flaky test suites.  
**Core Value Prop:** 1-click GitHub App installation, zero YAML configuration, sub-15-second root-cause diagnosis on every failed build.

---

## 1. System Architecture & Data Flow

### 1.1 High-Level Component Architecture

```
+-------------------------------------------------------------------------+
|                              GitHub Cloud                               |
|  1. Webhook (`workflow_job` / `workflow_run` completed: failure/success)|
|  4. REST API (`GET /actions/jobs/{job_id}/logs` & `GET /commits/{sha}`) |
|  8. REST API (`POST /issues/{pr}/comments` & `PATCH /comments/{id}`)    |
+--------------------+-------------------------------+--------------------+
                     | (1) HMAC-SHA256               ^ (4, 8) Installation
                     v                               |        Token Auth
+----------------------------------------------------+--------------------+
|                      API & Webhook Gateway (Next.js / Fastify)          |
|  - Validates `X-Hub-Signature-256` in < 50ms                            |
|  - Checks Redis tenant rate-limit / monthly quota                       |
|  - Pushes event payload to BullMQ (`ci-events` queue)                   |
+--------------------+----------------------------------------------------+
                     | (2) Enqueue Job
                     v
+-------------------------------------------------------------------------+
|                    Async Worker Pipeline (BullMQ + Redis)               |
|                                                                         |
|  [Step A: Pass/Fail Tracker]                                            |
|   - If `conclusion == success` on previously failed `commit_sha`:       |
|     -> Increment `flaky_pass_on_retry_count` on matching signature!     |
|                                                                         |
|  [Step B: Selective Log Streamer & Slicer]                              |
|   - Fetches only the failed job log stream (avoids 100MB+ ZIP archives) |
|   - Strips ANSI codes, runner timestamps, and GitHub `##[group]` noise  |
|   - Extracts 40-line sliding windows around test failures / exit codes  |
|   - Scrubs secrets (AWS keys, Bearer tokens, PEM blocks, high entropy)  |
|                                                                         |
|  [Step C: Fingerprinting & Cloud Moat Lookup]                           |
|   - Normalizes stack trace (masks UUIDs, line numbers, memory addrs)    |
|   - Computes `signature_hash = SHA256(step_name + normalized_trace)`    |
|   - Queries PostgreSQL + `pgvector` for exact or semantic (>0.92) match |
|                                                                         |
|  [Step D: LLM Structured Diagnosis (or Cache Hit)]                      |
|   - Calls Claude 3.5 Haiku / GPT-4o-mini with strict JSON Schema        |
|   - Correlates stack trace filenames with `commit_sha` modified files   |
|                                                                         |
|  [Step E: Multi-Channel Delivery & Paywall Gate]                        |
|   - Upserts sticky PR comment with <!-- ci-doctor-sticky-comment -->    |
|   - Appends blurred/locked historical moat teaser if on Free Tier       |
|   - Dispatches Slack/Discord webhook if Team Tier ($29/mo)              |
+--------------------+----------------------------------------------------+
                     |
                     v
+-------------------------------------------------------------------------+
|                PostgreSQL 16 + `pgvector` (Supabase / Neon)             |
|  - Tables: `organizations`, `repositories`, `failure_signatures`,       |
|            `workflow_failures`, `diagnostic_reports`                    |
+-------------------------------------------------------------------------+
```

---

## 2. Repository Directory Structure (Monorepo / Next.js + Workers)

```text
ci-doctor-saas/
├── .env.example
├── package.json
├── tsconfig.json
├── docker-compose.yml              # Local Postgres (pgvector) + Redis
├── supabase/
│   └── migrations/
│       └── 0001_initial_schema.sql # Full DDL + pgvector indexes
├── src/
│   ├── app/                        # Next.js 15 App Router
│   │   ├── api/
│   │   │   ├── webhooks/
│   │   │   │   ├── github/route.ts # GitHub App webhook ingress
│   │   │   │   └── stripe/route.ts # Stripe subscription lifecycle
│   │   │   └── trpc/[trpc]/route.ts
│   │   ├── (dashboard)/
│   │   │   ├── [orgSlug]/
│   │   │   │   ├── page.tsx        # Failure history & flaky test leaderboard
│   │   │   │   ├── signatures/[id]/page.tsx # Cross-run pattern moat view
│   │   │   │   └── settings/billing/page.tsx
│   ├── lib/
│   │   ├── github/
│   │   │   ├── app-auth.ts         # GitHub App JWT & Installation Octokit
│   │   │   ├── log-fetcher.ts      # Streams failed job logs & commit diffs
│   │   │   └── pr-reporter.ts      # Sticky PR comment & Check Run renderer
│   │   ├── parser/
│   │   │   ├── ansi-stripper.ts    # Strips ANSI, timestamps, runner noise
│   │   │   ├── log-slicer.ts       # Bottom-up sliding window & framework regex
│   │   │   ├── secret-scrubber.ts  # Redacts tokens, keys, credentials
│   │   │   └── fingerprinter.ts    # Stack trace normalizer & SHA-256 hasher
│   │   ├── ai/
│   │   │   ├── diagnose.ts         # Structured JSON LLM diagnosis + schema
│   │   │   └── embeddings.ts       # OpenAI text-embedding-3-small wrapper
│   │   ├── moat/
│   │   │   └── flakiness-engine.ts # Bayesian/heuristic flakiness calculator
│   │   └── billing/
│   │       └── quota-guard.ts      # Enforces Free/Pro/Team run & feature limits
│   └── workers/
│       ├── index.ts                # BullMQ worker entrypoint
│       └── processors/
│           ├── workflow-job.processor.ts
│           └── slack-alert.processor.ts
```

---

## 3. Database Schema & Cloud Moat DDL (`PostgreSQL` + `pgvector`)

Run this migration in PostgreSQL (Supabase, Neon, or RDS). It establishes the multi-tenant hierarchy, quota tracking, and the `failure_signatures` table that forms the core historical moat.

```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Subscription tiers
CREATE TYPE plan_tier AS ENUM ('free', 'pro_dev', 'team');

-- 1. Organizations (Tenants mapped to GitHub App Installations)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    github_installation_id BIGINT UNIQUE NOT NULL,
    github_account_login TEXT NOT NULL,
    github_account_type TEXT NOT NULL CHECK (github_account_type IN ('Organization', 'User')),
    plan plan_tier NOT NULL DEFAULT 'free',
    stripe_customer_id TEXT UNIQUE,
    stripe_subscription_id TEXT UNIQUE,
    monthly_run_limit INT NOT NULL DEFAULT 30, -- Free: 30, Pro ($9): 250, Team ($29): 1000
    runs_used_this_period INT NOT NULL DEFAULT 0,
    billing_period_reset_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    slack_webhook_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Repositories
CREATE TABLE repositories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    github_repo_id BIGINT UNIQUE NOT NULL,
    full_name TEXT NOT NULL, -- e.g. "acme/payments-service"
    default_branch TEXT NOT NULL DEFAULT 'main',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_repos_org_id ON repositories(org_id);

-- 3. Failure Signatures (THE CLOUD MOAT TABLE)
-- Deduplicates errors across runs, branches, and PRs.
CREATE TABLE failure_signatures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repo_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    signature_hash CHAR(64) NOT NULL, -- SHA-256 of (job_name + step_name + normalized_error_pattern)
    normalized_template TEXT NOT NULL, -- Stack trace with dynamic tokens masked
    test_identifier TEXT,              -- e.g. "src/auth/login.spec.ts > should refresh token"
    error_category TEXT NOT NULL,      -- 'test_assertion', 'timeout', 'infra_oom', 'build_compile', 'network', 'env_config'
    embedding vector(1536),            -- text-embedding-3-small vector for fuzzy cross-run clustering
    
    -- Historical Counters for Flakiness Calculation
    total_occurrences INT NOT NULL DEFAULT 1,
    main_branch_occurrences INT NOT NULL DEFAULT 0,
    unique_prs_affected INT NOT NULL DEFAULT 1,
    same_sha_retry_passes INT NOT NULL DEFAULT 0, -- How many times this exact commit SHA failed then passed on re-run
    flakiness_score NUMERIC(5,2) NOT NULL DEFAULT 0.00, -- 0.00 to 100.00
    
    -- Cached Diagnosis (Saves LLM costs on repeat failures)
    cached_root_cause TEXT,
    cached_next_check TEXT,
    
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(repo_id, signature_hash)
);

CREATE INDEX idx_signatures_repo_hash ON failure_signatures(repo_id, signature_hash);
CREATE INDEX idx_signatures_flakiness ON failure_signatures(repo_id, flakiness_score DESC);
CREATE INDEX idx_signatures_embedding ON failure_signatures USING hnsw (embedding vector_cosine_ops);

-- 4. Workflow Failures (Individual CI Run/Job Executions)
CREATE TABLE workflow_failures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repo_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    signature_id UUID REFERENCES failure_signatures(id) ON DELETE SET NULL,
    github_run_id BIGINT NOT NULL,
    github_job_id BIGINT UNIQUE NOT NULL,
    github_run_attempt INT NOT NULL DEFAULT 1,
    workflow_name TEXT NOT NULL,
    job_name TEXT NOT NULL,
    failed_step_name TEXT,
    commit_sha CHAR(40) NOT NULL,
    branch TEXT NOT NULL,
    pr_number INT,
    actor_login TEXT,
    exit_code INT,
    duration_ms INT,
    sanitized_log_snippet TEXT NOT NULL, -- Only the 15-35 relevant lines (scrubbed)
    failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_failures_repo_sha ON workflow_failures(repo_id, commit_sha);
CREATE INDEX idx_failures_signature_id ON workflow_failures(signature_id, failed_at DESC);
CREATE INDEX idx_failures_repo_date ON workflow_failures(repo_id, failed_at DESC);

-- 5. Diagnostic Reports (Rendered Outputs & Audit Trail)
CREATE TABLE diagnostic_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    failure_id UUID UNIQUE NOT NULL REFERENCES workflow_failures(id) ON DELETE CASCADE,
    root_cause_clues TEXT NOT NULL,
    likely_flaky_test TEXT,
    flaky_confidence NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    relevant_log_lines JSONB NOT NULL, -- Array of { lineNumber, content, isHighlight }
    suggested_next_check TEXT NOT NULL,
    local_repro_command TEXT,
    correlating_commit_files JSONB,    -- Array of modified files matching stack trace
    github_comment_id BIGINT,          -- Used to update sticky PR comment in place
    llm_model_used TEXT NOT NULL,
    prompt_tokens INT NOT NULL DEFAULT 0,
    completion_tokens INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Core Backend Modules (Production TypeScript Implementation)

### 4.1 Log Slicer, ANSI Stripper & Secret Scrubber (`src/lib/parser/log-slicer.ts`)

GitHub Actions logs frequently exceed $20\text{--}100\text{ MB}$, while the actual failure sits in a $40$-line window. This module strips timestamps/ANSI sequences, detects the failure anchor, extracts high-signal context lines, and scrubs leaked credentials before any external API call.

```typescript
// src/lib/parser/log-slicer.ts

export interface SlicedLogResult {
  cleanedSnippet: string;
  highlightedLines: Array<{ lineNo: number; text: string; isErrorAnchor: boolean }>;
  detectedExitCode: number | null;
  detectedTestIdentifier: string | null;
  detectedFramework: 'jest' | 'vitest' | 'pytest' | 'go' | 'rspec' | 'cargo' | 'playwright' | 'generic';
}

// 1. Strip GitHub Actions timestamps, ANSI escape codes, and internal runner markers
const ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
const GH_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s?/gm;
const GH_RUNNER_NOISE_REGEX = /^##\[(group|endgroup|command|debug)\].*$/gm;

// 2. High-signal error anchor patterns across popular languages & test runners
const ERROR_ANCHOR_PATTERNS: RegExp[] = [
  /^\s*●\s+(.+)$/,                                 // Jest / Vitest test failure header
  /^\s*FAIL\s+([^\s]+\.(?:test|spec)\.[jt]sx?)/,   // Jest / Vitest / Playwright suite fail
  /^_{3,}\s+(.+?)\s+_{3,}$/,                       // Pytest failure section header
  /^E\s+(AssertionError|.*Error|.*Exception):/,    // Pytest assertion line
  /^--- FAIL:\s+([^\s]+)\s+\(/,                    // Go test failure
  /^thread '([^']+)' panicked at/,                 // Rust / Cargo panic
  /^\s*\d+\)\s+(.+?)\s+FAILED$/,                   // RSpec / Cypress failure
  /##\[error\](.+)$/,                              // GitHub Actions explicit step error
  /(?:FATAL|Error|Exception|panic|Segmentation fault|Out of memory|Killed|ELIFECYCLE|ERR!)(?:\b|:)/i,
  /Process completed with exit code (\d+)/i,
];

// 3. Secret Scrubbing Regexes (Zero-leakage guarantee before LLM or DB storage)
const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /(gh[pousr]_[A-Za-z0-9_]{36,255})/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  { pattern: /(sk-[A-Za-z0-9]{20,})/g, replacement: '[REDACTED_API_KEY]' },
  { pattern: /(AKIA[0-9A-Z]{16})/g, replacement: '[REDACTED_AWS_KEY]' },
  { pattern: /(Bearer\s+[A-Za-z0-9\-._~+/]+=*)/gi, replacement: 'Bearer [REDACTED_JWT]' },
  { pattern: /(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"']+/gi, replacement: '$1://[REDACTED_DB_URI]' },
  { pattern: /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g, replacement: '[REDACTED_PRIVATE_KEY]' },
];

export function scrubSecrets(input: string): string {
  let scrubbed = input;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, replacement);
  }
  return scrubbed;
}

export function sliceFailedStepLog(rawLog: string, maxLines = 45): SlicedLogResult {
  // Only inspect the last 300KB of the failed step log to bound CPU/Memory to O(1)
  const boundedRaw = rawLog.length > 300_000 ? rawLog.slice(-300_000) : rawLog;

  const cleanText = scrubSecrets(
    boundedRaw
      .replace(ANSI_REGEX, '')
      .replace(GH_TIMESTAMP_REGEX, '')
      .replace(GH_RUNNER_NOISE_REGEX, '')
  );

  const lines = cleanText
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  let detectedExitCode: number | null = null;
  let detectedTestIdentifier: string | null = null;
  let detectedFramework: SlicedLogResult['detectedFramework'] = 'generic';
  const anchorIndices: number[] = [];

  // Bottom-up scan to prioritize the final fatal error over earlier warnings
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];

    const exitMatch = line.match(/Process completed with exit code (\d+)/i);
    if (exitMatch && detectedExitCode === null) {
      detectedExitCode = parseInt(exitMatch[1], 10);
    }

    // Detect framework & test identifier
    const jestMatch = line.match(/^\s*●\s+(.+)$/);
    if (jestMatch && !detectedTestIdentifier) {
      detectedTestIdentifier = jestMatch[1].trim();
      detectedFramework = 'jest';
    }

    const pytestMatch = line.match(/^FAILED\s+([^\s]+::[^\s]+)/);
    if (pytestMatch && !detectedTestIdentifier) {
      detectedTestIdentifier = pytestMatch[1].trim();
      detectedFramework = 'pytest';
    }

    const goMatch = line.match(/^--- FAIL:\s+([^\s]+)/);
    if (goMatch && !detectedTestIdentifier) {
      detectedTestIdentifier = goMatch[1].trim();
      detectedFramework = 'go';
    }

    if (ERROR_ANCHOR_PATTERNS.some((rx) => rx.test(line))) {
      anchorIndices.push(i);
      if (anchorIndices.length >= 3) break; // Capture up to 3 primary error clusters
    }
  }

  // Build a merged window around anchor indices (20 lines before, 15 lines after)
  const selectedLineNumbers = new Set<number>();
  const anchorSet = new Set<number>(anchorIndices);

  if (anchorIndices.length > 0) {
    for (const anchorIdx of anchorIndices) {
      const start = Math.max(0, anchorIdx - 20);
      const end = Math.min(lines.length - 1, anchorIdx + 15);
      for (let idx = start; idx <= end; idx++) {
        selectedLineNumbers.add(idx);
      }
    }
  }

  // Always include the final 15 tail lines for exit summary context
  for (let idx = Math.max(0, lines.length - 15); idx < lines.length; idx++) {
    selectedLineNumbers.add(idx);
  }

  const sortedIndices = Array.from(selectedLineNumbers)
    .sort((a, b) => a - b)
    .slice(-maxLines);

  const highlightedLines = sortedIndices.map((idx) => ({
    lineNo: idx + 1,
    text: lines[idx].slice(0, 300), // Guard against minified single-line dumps
    isErrorAnchor: anchorSet.has(idx),
  }));

  return {
    cleanedSnippet: highlightedLines.map((l) => `[L${l.lineNo}] ${l.text}`).join('\n'),
    highlightedLines,
    detectedExitCode,
    detectedTestIdentifier,
    detectedFramework,
  };
}
```

---

### 4.2 Stack Trace Normalizer & Signature Fingerprinter (`src/lib/parser/fingerprinter.ts`)

To build the **Cloud Moat**, the system must recognize that two failures on Monday and Thursday are the *exact same underlying issue*, even if memory addresses, port numbers, durations, or line numbers shifted slightly.

```typescript
// src/lib/parser/fingerprinter.ts
import crypto from 'crypto';

export interface ErrorSignature {
  signatureHash: string;
  normalizedTemplate: string;
}

/**
 * Strips volatile values (UUIDs, hex addresses, line/col numbers, durations, timestamps, ports)
 * so recurring failures produce an identical deterministic SHA-256 fingerprint.
 */
export function computeFailureSignature(
  jobName: string,
  stepName: string,
  testIdentifier: string | null,
  cleanedLogSnippet: string
): ErrorSignature {
  const normalizedLog = cleanedLogSnippet
    // Strip our [L123] line prefixes
    .replace(/^\[L\d+\]\s*/gm, '')
    // Replace UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    // Replace memory addresses & hex hashes (7+ chars)
    .replace(/\b0x[0-9a-fA-F]+\b/g, '<HEX>')
    .replace(/\b[0-9a-f]{7,40}\b/g, '<HASH>')
    // Normalize file line:column numbers in stack traces (e.g., auth.ts:142:18 -> auth.ts:<LN>:<COL>)
    .replace(/:(\d+):(\d+)/g, ':<LN>:<COL>')
    // Normalize durations (e.g., "5002 ms", "30.4s")
    .replace(/\b\d+(?:\.\d+)?\s*(?:ms|s|sec|seconds|minutes)\b/gi, '<DURATION>')
    // Normalize dynamic port numbers or PIDs
    .replace(/\b(?:port|pid)\s+\d+\b/gi, 'port <NUM>')
    // Collapse multiple whitespace
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);

  const canonicalKey = [
    `job:${jobName.toLowerCase().trim()}`,
    `step:${stepName.toLowerCase().trim()}`,
    `test:${(testIdentifier || 'none').toLowerCase().trim()}`,
    `trace:${normalizedLog}`,
  ].join('|');

  const signatureHash = crypto.createHash('sha256').update(canonicalKey).digest('hex');

  return {
    signatureHash,
    normalizedTemplate: canonicalKey,
  };
}
```

---

### 4.3 Flakiness Score Calculator (`src/lib/moat/flakiness-engine.ts`)

Calculates a $0\text{--}100\%$ flakiness probability using three concrete signals:
1. **Same-SHA Retry Passes:** Did this exact commit SHA fail on Attempt 1 and pass on Attempt 2? (Strongest possible signal).
2. **Cross-PR Spread:** Has this exact error signature appeared across multiple unrelated Pull Requests in the last 14 days?
3. **Transient Error Heuristics:** Does the failure involve network timeouts, `ECONNRESET`, Playwright/Cypress element detachments, or runner OOM (`exit code 137`)?

```typescript
// src/lib/moat/flakiness-engine.ts

export interface FlakinessInput {
  sameShaRetryPasses: number;
  uniquePrsAffected: number;
  totalOccurrences: number;
  mainBranchOccurrences: number;
  cleanedSnippet: string;
}

const TRANSIENT_PATTERNS = [
  /timeout\s+of\s+\d+ms\s+exceeded/i,
  /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i,
  /Test timeout of \d+ms exceeded/i,
  /waiting for (?:selector|locator|navigation)/i,
  /exit code 137/i, // SIGKILL / Docker OOM
  /Deadlock found when trying to get lock/i,
  /rate limit exceeded|429 Too Many Requests/i,
];

export function calculateFlakinessScore(input: FlakinessInput): number {
  let score = 0;

  // Signal 1: Confirmed pass-on-retry on the exact same commit SHA (instant high confidence)
  if (input.sameShaRetryPasses >= 2) {
    score += 75;
  } else if (input.sameShaRetryPasses === 1) {
    score += 55;
  }

  // Signal 2: Appears across multiple unrelated PRs (indicates pre-existing instability)
  if (input.uniquePrsAffected >= 4) {
    score += 25;
  } else if (input.uniquePrsAffected >= 2) {
    score += 15;
  }

  // Signal 3: Failing intermittently on default branch (`main`)
  if (input.mainBranchOccurrences >= 2) {
    score += 10;
  }

  // Signal 4: Known transient timing/network/infra markers in the log
  const matchesTransient = TRANSIENT_PATTERNS.some((rx) => rx.test(input.cleanedSnippet));
  if (matchesTransient) {
    score += 20;
  }

  return Math.min(99, Math.max(2, score));
}
```

---

### 4.4 Structured LLM Diagnostic Engine (`src/lib/ai/diagnose.ts`)

Uses strict JSON Schema enforcement so the response is guaranteed to contain your 4 required sections: **Root-Cause Clues**, **Likely Flaky Test**, **Relevant Log Lines**, and **Suggested Next Check**.

```typescript
// src/lib/ai/diagnose.ts
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

export function buildDiagnosisUserPrompt(params: {
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
}): string {
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
```

---

### 4.5 Sticky GitHub PR Report Renderer & Paywall Hook (`src/lib/github/pr-reporter.ts`)

Posts a single sticky comment per PR (updating it in place on subsequent pushes so it never spams the PR thread). It also embeds the **Paywall Conversion Hook** directly inside the developer workflow.

```typescript
// src/lib/github/pr-reporter.ts
import { DiagnosisOutput } from '../ai/diagnose';

export const STICKY_COMMENT_MARKER = '<!-- ci-failure-diagnosis-sticky-marker -->';

export interface RenderReportParams {
  orgPlan: 'free' | 'pro_dev' | 'team';
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

export function renderGitHubPrComment(p: RenderReportParams): string {
  const shortSha = p.commitSha.slice(0, 7);
  const flakyBadge =
    p.flakinessScore >= 65
      ? `🟡 **Likely Flaky (${p.flakinessScore}% confidence)**`
      : p.flakinessScore >= 35
      ? `🟠 **Possible Intermittent (${p.flakinessScore}% confidence)**`
      : `🔴 **Deterministic Failure (${100 - p.flakinessScore}% confidence)**`;

  const logBlock = p.diagnosis.relevant_log_lines
    .map((l) => `L${l.line_number}: ${l.content}  # <-- ${l.explanation}`)
    .join('\n');

  // PAYWALL HOOK: Free users see a teaser when cross-run patterns exist; Paid users see full insights
  let crossRunSection = '';
  if (p.orgPlan === 'free') {
    crossRunSection =
      p.historicalStats.totalOccurrences > 1
        ? `> 🔒 **Cross-Run Pattern Detected:** This exact error signature has failed **${p.historicalStats.totalOccurrences} times** across **${p.historicalStats.uniquePrsAffected} PRs** recently. [Unlock 30-day failure history, flaky test matrices & Slack alerts ($9/mo) →](${p.billingUpgradeUrl})`
        : `> 💡 *Tip: [Upgrade to Pro ($9/mo)](${p.billingUpgradeUrl}) to track cross-run failure history, auto-detect flaky tests across branches, and route alerts to Slack.*`;
  } else {
    crossRunSection = `> 📊 **Cross-Run History:** Seen **${p.historicalStats.totalOccurrences}x** across **${p.historicalStats.uniquePrsAffected} PRs** (${p.historicalStats.sameShaRetryPasses} same-SHA retry passes). [View full timeline & branch breakdown →](${p.dashboardReportUrl})`;
  }

  return `${STICKY_COMMENT_MARKER}
### ⚡ CI Failure Report — \`${p.jobName}\` (${p.stepName})

| Commit | Status / Flakiness | Failed Test / Target | CI Run |
| :--- | :--- | :--- | :--- |
| \`${shortSha}\` | ${flakyBadge} | \`${p.diagnosis.likely_flaky_test.test_name ?? p.stepName}\` | [View GitHub Log ↗](${p.runUrl}) |

#### 1. Root-Cause Clues
${p.diagnosis.root_cause_clues}

#### 2. Flaky Test Assessment
${p.diagnosis.likely_flaky_test.reasoning}

#### 3. Relevant Log Lines
\`\`\`text
${logBlock}
\`\`\`

#### 4. Suggested Next Check
* **Action:** ${p.diagnosis.suggested_next_check}
${p.diagnosis.local_repro_command ? `* **Run Locally:** \`${p.diagnosis.local_repro_command}\`` : ''}

---
${crossRunSection}
`;
}
```

---

## 5. Paywall & Quota Enforcement Specification

To test the **$9/month per developer** and **$29/month per small team** price points cleanly, enforce quotas at two touchpoints:

### 5.1 Webhook Ingestion Quota Gate (`src/lib/billing/quota-guard.ts`)

1. **Free Tier (`free`):**
   * **Monthly Limit:** 30 diagnosed failed runs per organization.
   * **Behavior on Run #31:** Post a lightweight one-line comment on the PR:
     `⚠️ CI Doctor monthly free quota (30/30 failed builds diagnosed) reached for this repository. [Upgrade to Pro ($9/mo) for 250 runs + full flaky test history →]`
   * **Dashboard Gate:** Runs older than 24 hours return HTTP 402 / blurred UI rows in the web dashboard; the Cross-Run Flaky Leaderboard tab shows top 1 test unblurred and blurs the remaining rows.
2. **Solo / Pro Developer Tier (`pro_dev` — $9/month):**
   * **Monthly Limit:** 250 diagnosed failed runs.
   * **Unlocked Features:** 30-day failure history, full flaky test matrix per repo, signature deduplication timeline.
3. **Small Team Tier (`team` — $29/month):**
   * **Monthly Limit:** 1,000 diagnosed failed runs.
   * **Unlocked Features:** 90-day failure history, Slack & Discord channel alert routing, daily/weekly "Top 5 Flakiest Tests Slowing Down CI" digest, and automatic 1-click "Auto-retry known flaky jobs (>80% confidence)" policy toggle.

---

## 6. Environment Variables & Configuration (`.env.example`)

```ini
# App & Deployment
NODE_ENV="production"
NEXT_PUBLIC_APP_URL="https://cidoctor.dev"

# GitHub App Credentials
GITHUB_APP_ID="1029384"
GITHUB_APP_CLIENT_ID="Iv1.a1b2c3d4e5f6g7h8"
GITHUB_APP_CLIENT_SECRET="your_github_client_secret"
GITHUB_APP_WEBHOOK_SECRET="whsec_your_github_webhook_secret"
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"

# Database (Supabase / Neon PostgreSQL with pgvector)
DATABASE_URL="postgresql://postgres:password@db.project.supabase.co:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:password@db.project.supabase.co:5432/postgres"

# Queue & Rate Limiting (Upstash Redis)
REDIS_URL="rediss://default:password@us1-merry-cat-12345.upstash.io:6379"

# AI Diagnosis Engine
ANTHROPIC_API_KEY="sk-ant-api03-..."
OPENAI_API_KEY="sk-proj-..." # Used for text-embedding-3-small & fallback JSON schema

# Stripe Billing ($9 Pro / $29 Team Price Test)
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRICE_ID_PRO_DEV_9="price_1PxyzProDev9Monthly"
STRIPE_PRICE_ID_TEAM_29="price_1PxyzTeam29Monthly"
```

---

## 7. Day-by-Day Developer Sprint Plan (Days 1–7 Prototype)

* **Day 1 — GitHub App & Webhook Spine:**
  * Create GitHub App Manifest (`actions:read`, `checks:write`, `pull_requests:write`, `contents:read` for commit file list).
  * Stand up `/api/webhooks/github` route with `crypto.timingSafeEqual` HMAC-SHA256 verification and BullMQ producer.
* **Day 2 — Selective Job Log Fetcher:**
  * Implement `log-fetcher.ts`: given `workflow_run.id`, call `octokit.rest.actions.listJobsForWorkflowRun`, filter `job.conclusion === 'failure'`, and call `octokit.rest.actions.downloadJobLogsForWorkflowRun`.
  * Also call `octokit.rest.repos.getCommit` to extract `files.map(f => f.filename)` for commit diff correlation.
* **Day 3 — Log Slicer & Secret Scrubber:**
  * Integrate `log-slicer.ts` and `fingerprinter.ts`. Write unit tests against 5 real-world raw GitHub Actions failure logs (Jest, Pytest, Go, Next.js build error, Docker exit code 137).
* **Day 4 — Database Persistence & Flakiness Tracker:**
  * Run `0001_initial_schema.sql`.
  * Wire both `conclusion === 'failure'` and `conclusion === 'success'` webhooks so when a previously failed `commit_sha` passes on `run_attempt > 1`, `same_sha_retry_passes` increments automatically.
* **Day 5 — LLM Diagnostic Synthesis & Cache Layer:**
  * Wire `diagnose.ts` with Claude 3.5 Haiku / GPT-4o-mini Structured Outputs.
  * Add cache bypass: if `failure_signatures` already has a `cached_root_cause` updated within the last 6 hours and no commit files match the stack trace, reuse the cached diagnosis for $0 LLM cost.
* **Day 6 — Sticky PR Comment & Check Run Output:**
  * Wire `pr-reporter.ts` to query existing PR comments for `<!-- ci-failure-diagnosis-sticky-marker -->`, updating in place if found or creating a new comment if not.
* **Day 7 — Stripe Checkout & Production Smoke Test:**
  * Connect Stripe Checkout for the `$9/mo` and `$29/mo` plans, deploy Next.js + BullMQ worker, and install on 3 live repositories with failing PR checks.