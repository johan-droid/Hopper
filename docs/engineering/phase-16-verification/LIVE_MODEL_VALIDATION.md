# HOPPER PHASE 16V — LIVE API MODEL VALIDATION & ACCESS AUDIT

## Executive Summary

**Evaluation Scope:** Live external LLM integration and inference benchmark claims  
**Audit Finding:** **BLOCKED BY MISSING / INVALID CREDENTIALS (AUDIT LIMITATION)**

Phase 16 claims included references to live model capabilities:
> "Root-Cause Specificity: 34.2% (100% with live LLM)"  
> "Anthropic Claude 3.5 Haiku: $0.80 / 1M prompt, $4.00 / 1M completion"

This audit performed an empirical verification of the live AI model execution path, checking environment credentials, connectivity, model parameters, and actual execution records.

---

## 1. Provider Configuration & Environment Audit

The Hopper backend implementation in [`backend/src/lib/ai/diagnose.ts`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/src/lib/ai/diagnose.ts) supports two live external providers:

| Attribute | Primary Provider (Anthropic) | Secondary Provider (OpenAI) |
| :--- | :--- | :--- |
| **Model Identifier** | `claude-3-5-haiku-20241022` (or `process.env.AI_MODEL`) | `gpt-4o-mini` (or `process.env.AI_MODEL`) |
| **Environment Variable** | `ANTHROPIC_API_KEY` (or `AI_API_KEY`) | `OPENAI_API_KEY` |
| **Target Endpoint** | `https://api.anthropic.com/v1/messages` | `https://api.openai.com/v1/chat/completions` |
| **Output Format** | System prompt instructions + Zod validation | `response_format: { type: "json_object" }` |
| **Inference Timeout** | `AbortSignal.timeout(15000)` (15 seconds) | `AbortSignal.timeout(15000)` (15 seconds) |
| **Max Tokens** | 1500 tokens | Default |

### Credential Status Check:
An audit probe of the environment was conducted (preserving secret redaction rules):
1. `OPENAI_API_KEY`: **NOT SET** (`undefined` / `false`).
2. `AI_API_KEY`: **NOT SET** (`undefined` / `false`).
3. `ANTHROPIC_API_KEY`: Present in the execution environment, but when queried against `https://api.anthropic.com/v1/messages`, the API responds with:
   ```json
   {
     "status": 401,
     "error": {
       "type": "authentication_error",
       "message": "invalid x-api-key"
     }
   }
   ```

---

## 2. Live Request Execution Audit Across 50 Cases

Because valid credentials for Anthropic and OpenAI are not available in this environment:
- **Total Cases Attempted Against Live API:** 0
- **Successful Live Model Inferences:** 0
- **Failed Live Model Inferences:** 0 (All live attempts immediately hit 401 or fall back)
- **Fallback Trigger Rate:** 100% (When `synthesizeDiagnosis()` is invoked in `tests/ai.test.ts`, it catches the 401 and falls back to `synthesizeDeterministicDiagnosis()`)
- **Actual Tokens Consumed from Model Providers:** **0 tokens**
- **Actual USD Billed by Model Providers:** **\$0.00**

---

## 3. Disproof of the "100% with Live LLM" Claim

The previous Phase 16 executive report asserted:
> `Root-Cause Specificity: 1.3% (Baseline) | 34.2% (100% with live LLM)`

The auditor conducted a codebase-wide search for any scripts, test logs, or artifacts recording a 50-case run against a live LLM:
1. `backend/src/lib/ai/evaluation/run-baseline.ts`: Only executes `synthesizeDeterministicDiagnosis(ctx)`.
2. There is no `run-live-llm.ts` or similar script anywhere in the repository.
3. No persisted logs or token consumption invoices exist confirming that 50 live API requests were ever dispatched.

### Auditor Finding:
The claim of **"100% with live LLM"** was an unsubstantiated conjecture based on an assumption that Claude 3.5 Haiku would identify all errors if given the logs. In accordance with rigorous evaluation standards, **unverified projections must never be reported as benchmark results**.

---

## 4. Verification of Live Provider Code Structure

Although live credentials could not be exercised, the code structure for live model invocation in `backend/src/lib/ai/diagnose.ts` was audited:
- **Anthropic Payload Construction (lines 206-224):** Correct headers (`x-api-key`, `anthropic-version: 2023-06-01`, `Content-Type: application/json`), payload contains `system` prompt and `messages` array with sanitized and wrapped log snippet.
- **OpenAI Payload Construction (lines 285-300):** Correct `Bearer` header, `response_format: { type: "json_object" }`, messages containing system and user prompts.
- **Zod Schema Parsing (lines 255 & 330):** Enforces that the model's raw JSON matches `DiagnosisOutputSchema`. If the model hallucinates non-compliant fields or omits mandatory keys, the engine throws and cleanly triggers fallback.

**Conclusion:** The live API client implementation is structurally sound and ready for production, but live model performance metrics are **BLOCKED BY MISSING CREDENTIALS** and cannot be verified in this audit environment.

