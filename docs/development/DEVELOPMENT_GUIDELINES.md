# Hopper — Engineering & Development Guidelines (DEVELOPMENT_GUIDELINES.md)

---

## 1. Core Engineering Principles

1. **Reliability First:** CI failure diagnostics must never silently fail, hang indefinitely, or report false data. If a diagnostic routine cannot extract root causes with high confidence, it must fail closed and report its status truthfully.
2. **Evidence-Based Completion:** Never consider a task done simply because a file was written. Features must be proven through unit tests, integration suites, or typecheck passes.
3. **Single Source of Truth:** Every subsystem, contract, or architecture decision must live in exactly one authoritative location. Do not maintain competing specifications or duplicate task lists.
4. **No Legacy Reintroduction:** Do not reintroduce retired tools or architectures (Cloudflare Workers, Redis, BullMQ). If a dependency is not in `package.json`, do not import it.

---

## 2. TypeScript & Coding Standards

### 2.1 ESM & Import Conventions
- Hopper uses native Node.js ECMAScript Modules (`"type": "module"` in `package.json`).
- In the backend (`backend/src/`), relative imports **must** include the `.js` extension:
  ```typescript
  // CORRECT
  import { createApp } from './server/app.js';
  import { ApiError } from './server/middleware/error-handler.js';

  // INCORRECT (will fail at runtime)
  import { createApp } from './server/app';
  ```
- In the frontend (`frontend/src/`), Vite handles module resolution; standard extensionless imports or `.tsx` imports are permitted.

### 2.2 Strict Typing & Schema Validation
- Strict TypeScript configuration (`noImplicitAny`, `strictNullChecks`) is mandatory. Avoid using the `any` type; use `unknown` with type guards or define explicit interfaces.
- Validate all untrusted input (HTTP request bodies, query params, webhook payloads, LLM responses) using **Zod** schemas:
  - Backend schemas: `backend/src/engine/types.ts`
  - Frontend schemas: `frontend/src/api/schema.ts`

---

## 3. API Design & Error Handling

### 3.1 Standardized Error Envelope
All error responses from the Express API must throw or return `ApiError` (`backend/src/server/middleware/error-handler.ts`). Never send ad-hoc `{ error: "message" }` strings.

Standard error response format:
```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid webhook signature",
    "details": []
  },
  "requestId": "hopper-1731570000000-abc123"
}
```

Standard Error Codes:
- `BAD_REQUEST` (400)
- `UNAUTHORIZED` (401)
- `FORBIDDEN` (403)
- `NOT_FOUND` (404)
- `RATE_LIMIT_EXCEEDED` (429)
- `INTERNAL_SERVER_ERROR` (500)
- `SERVICE_UNAVAILABLE` (503)

### 3.2 Correlation IDs
Every incoming HTTP request receives an `x-request-id` header (either forwarded from upstream or generated via `hopper-${Date.now()}-${random}`). This ID is echoed in response headers and logged with all error events.

---

## 4. Database Migration Policy

Database migrations must adhere to an **Expand-Contract** methodology to support zero-downtime deployments:

1. **Forward-Only Migrations:** Never modify an existing migration file that has already been applied. Create a new sequential migration file in `backend/supabase/migrations/` (e.g. `0014_new_feature.sql`).
2. **Idempotency:** Every SQL statement must be idempotent:
   ```sql
   CREATE TABLE IF NOT EXISTS ...
   CREATE INDEX IF NOT EXISTS ...
   ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...
   ```
3. **Expand Phase First:** When modifying or renaming columns, add the new column first, write to both, backfill data, and only remove the deprecated column in a subsequent release.
4. **Mandatory Row-Level Security (RLS):** Every new table containing multi-tenant or workspace data must immediately enable RLS:
   ```sql
   ALTER TABLE my_new_table ENABLE ROW LEVEL SECURITY;
   ALTER TABLE my_new_table FORCE ROW LEVEL SECURITY;
   ```
5. **No Long Locks:** Avoid `ALTER TABLE ... DEFAULT <expensive_function>` on large existing tables without careful locking considerations.

---

## 5. Security & Privacy Guidelines

1. **Untrusted Data Isolation:** All CI/CD logs ingested from external repositories must be treated as untrusted and potentially malicious.
2. **Secret Scrubbing:** Raw logs must pass through `SecretScrubber` before being stored in the database or passed to an LLM prompt. Never store plain AWS keys, GitHub tokens, or private credentials.
3. **Prompt Injection Defense:** Always wrap user or log data in boundary tags (`<UNTRUSTED_CI_LOG>...</UNTRUSTED_CI_LOG>`) and instruct the model to treat the content purely as passive analytical data.
4. **No Secrets in Frontend:** Never commit API keys or private tokens to `frontend/`. Any variable accessible in Vite must be prefixed with `VITE_` and must be public by definition.
5. **Constant-Time Verification:** Webhook signatures (GitHub `X-Hub-Signature-256` and Stripe signatures) must always be compared using constant-time algorithms (`crypto.timingSafeEqual`) to prevent timing attacks.

---

## 6. Documentation Maintenance Policy

1. **One Canonical Home:** Every topic has one home. Update existing docs instead of creating new ones.
2. **No Ephemeral Logs:** Do not leave temporary progress notes, meeting summaries, or conversational logs in the repository.
3. **Immediate Sync:** When an architectural change, database migration, or defect resolution is completed, update the corresponding documentation:
   - Schema change -> `docs/architecture/DATA_MODEL.md`
   - External integration -> `docs/architecture/INTEGRATIONS.md`
   - Defect resolved -> `docs/project/KNOWN_ISSUES.md`
   - Milestone achieved -> `docs/project/CURRENT_STATE.md`
