# HOPPER PHASE 16V — PERSISTENCE, TELEMETRY & TENANT ISOLATION AUDIT

## Executive Summary

**Target Table:** `diagnostic_reports` (PostgreSQL)  
**Worker Processor:** [`backend/src/workers/processors/workflow-job.processor.ts`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/src/workers/processors/workflow-job.processor.ts)  
**Data Access Layer:** [`backend/src/db/repositories/diagnostic-report.repository.ts`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/src/db/repositories/diagnostic-report.repository.ts)  
**Audit Finding:** **PARTIALLY VERIFIED (SCHEMA-TELEMETRY DISCONNECT IDENTIFIED)**

This audit evaluated how AI diagnoses and execution metrics are persisted into PostgreSQL, assessing model attribution, token metrics, retry idempotency, and tenant isolation.

---

## 1. Database Schema vs. Runtime Telemetry Disconnect

In [`backend/src/lib/ai/diagnose.ts`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/src/lib/ai/diagnose.ts), a rich runtime telemetry schema was defined:

```typescript
export const DiagnosisTelemetrySchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'deterministic']),
  model: z.string(),
  latencyMs: z.number(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  costUsd: z.number(),
  isFallback: z.boolean(),
  fallbackReason: z.string().optional(),
});
```

However, an audit of the underlying database table in `0001_initial_schema.sql` reveals that several critical telemetry fields **cannot be stored**:

| Telemetry Field | In Runtime `DiagnosisTelemetry`? | In DB Table `diagnostic_reports`? | Column Name / Type | Audit Finding |
| :--- | :---: | :---: | :---: | :--- |
| **Model Name** | Yes | **YES** | `llm_model_used TEXT NOT NULL` | **VERIFIED** |
| **Prompt Tokens** | Yes | **YES** | `prompt_tokens INT NOT NULL DEFAULT 0` | **VERIFIED** |
| **Completion Tokens**| Yes | **YES** | `completion_tokens INT NOT NULL DEFAULT 0` | **VERIFIED** |
| **Provider Name** | Yes | **NO** | *None* | Inferred from model string |
| **Latency (ms)** | Yes | **NO** | *None* | **DROPPED** (Not persisted in DB) |
| **Cost (USD)** | Yes | **NO** | *None* | **DROPPED** (Not persisted in DB) |
| **Is Fallback (Bool)**| Yes | **NO** | *None* | **DROPPED** (Not persisted in DB) |

### Persistence Mapping in `workflow-job.processor.ts`:
```typescript
  const report = await diagnosticReportRepo.create({
    failureId: failure.id,
    rootCauseClues: diagnosis.root_cause_clues,
    likelyFlakyTest: diagnosis.likely_flaky_test.test_name,
    flakyConfidence: currentFlakinessScore,
    relevantLogLines: diagnosis.relevant_log_lines,
    suggestedNextCheck: diagnosis.suggested_next_check,
    localReproCommand: diagnosis.local_repro_command,
    correlatingCommitFiles: modifiedFiles,
    llmModelUsed: diagnosis.telemetry?.model || (isCacheValid ? 'cache:signature_moat' : 'deterministic-pattern-matcher'),
    promptTokens: diagnosis.telemetry?.promptTokens ?? 0,
    completionTokens: diagnosis.telemetry?.completionTokens ?? 0,
  });
```

**Auditor Note:** While Phase 16 fixed the prior defect where `llmModelUsed` was hardcoded to `'claude-3-5-haiku-latest'`, the system drops `latencyMs`, `costUsd`, and `isFallback` during persistence. A production observability system should store these in `diagnostic_reports`.

---

## 2. Association & Tenant Isolation Verification

### 2.1 Diagnosis-to-Workflow Association
- Every diagnostic report is linked directly to a workflow failure via:
  `failure_id UUID UNIQUE NOT NULL REFERENCES workflow_failures(id) ON DELETE CASCADE`
- The `workflow_failures` table records:
  - `repo_id UUID REFERENCES repositories(id)`
  - `github_run_id BIGINT`
  - `github_job_id BIGINT`
  - `commit_sha TEXT`
  - `branch TEXT`

### 2.2 Row-Level Security (RLS) Tenant Isolation
The database enforces multi-tenant boundary isolation at the PostgreSQL layer via migrations `0005_rls_policies.sql` and `0006_fix_rls_security_definer.sql`:

```sql
CREATE POLICY diagnostic_reports_select_policy ON diagnostic_reports
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM workflow_failures wf
      JOIN repositories r ON r.id = wf.repo_id
      JOIN workspace_members wm ON wm.workspace_id = r.org_id
      WHERE wf.id = diagnostic_reports.failure_id
        AND wm.user_id = auth.uid()
    )
  );
```
**Verification Finding:** Authenticated users from Tenant A cannot read diagnostic reports belonging to Tenant B's repositories, even if they guess Tenant B's UUID. **VERIFIED**.

---

## 3. Duplicate Delivery & Retry Idempotency

When GitHub Actions retries a job or re-sends a `workflow_job.completed` webhook:
1. **Repository Layer Idempotency:**
   In [`backend/src/db/repositories/diagnostic-report.repository.ts`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/src/db/repositories/diagnostic-report.repository.ts) lines 49-59:
   ```sql
   INSERT INTO diagnostic_reports (failure_id, root_cause_clues, ...)
   VALUES ($1, $2, ...)
   ON CONFLICT (failure_id)
   DO UPDATE SET
     root_cause_clues = EXCLUDED.root_cause_clues,
     relevant_log_lines = EXCLUDED.relevant_log_lines,
     suggested_next_check = EXCLUDED.suggested_next_check,
     prompt_tokens = EXCLUDED.prompt_tokens,
     completion_tokens = EXCLUDED.completion_tokens,
     llm_model_used = EXCLUDED.llm_model_used;
   ```
2. **Matrix Burst Deduplication Lock:**
   Before invoking diagnosis, [`workflow-job.processor.ts`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/src/workers/processors/workflow-job.processor.ts) acquires a distributed Redis lock:
   `lockKey = "lock:diagnose:${repoId}:${fingerprintHash}"`
   If another worker is currently processing an identical failure signature in a parallel matrix job, subsequent jobs are delayed by 5 seconds (`moveToDelayed`) to reuse the cached diagnosis once written, preventing duplicate LLM calls.

**Verdict:** **VERIFIED**. Association, tenant boundaries, and idempotency are structurally robust.

