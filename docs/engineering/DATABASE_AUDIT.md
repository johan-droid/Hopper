# Hopper — Database Schema & Data Integrity Audit

## 1. Migration History & Schema Evolution

Hopper's database layer uses PostgreSQL 16 with the `pgvector` extension for vector similarity search. Migrations are located in `backend/supabase/migrations/` and executed in alphanumeric order by `backend/src/db/migrator.ts`.

| Migration File | Tables & Structures Added | Status | Verification |
|---|---|---|---|
| `0001_initial_schema.sql` | `organizations`, `repositories`, `failure_signatures`, `workflow_failures`, `diagnostic_reports` | APPLIED | Verified in PostgreSQL container; idempotent `IF NOT EXISTS`. |
| `0002_hnsw_index.sql` | HNSW vector index on `failure_signatures(embedding vector_cosine_ops)` with `m = 16, ef_construction = 64` | APPLIED | Enables sub-10ms approximate nearest neighbor search over 1536d error embeddings. |
| `0004_workspace_tables.sql` | `user_profiles`, `workspaces`, `workspace_members`, `workspace_invitations` | APPLIED | Multi-tenant workspace foundation linked to Supabase Auth UUIDs. |
| `0005_rls_policies.sql` | Row-Level Security policies across all tables | PLANNED | Required for full multi-tenant isolation. |

---

## 2. Relational Schema & Entity Relationships

```text
  auth.users (Supabase Auth)
       │
       ▼ (1:1 ON DELETE CASCADE)
  user_profiles
       │
       ├─────────► workspaces (owner_id 1:N)
       │                │
       ▼                ▼
  workspace_members (workspace_id + user_id composite unique)
       │
       ▼
  organizations (GitHub Account / Tenant)
       │
       ├─────────► repositories (org_id 1:N)
       │                │
       │                ▼
       ├─────────► failure_signatures (repo_id 1:N, embedding vector(1536))
       │                │
       │                ▼
       └─────────► workflow_failures (signature_id N:1)
                        │
                        ▼
                   diagnostic_reports (failure_id 1:1)
```

---

## 3. Detailed Table Specifications

### `organizations`
- **Primary Key:** `id UUID DEFAULT gen_random_uuid()`
- **Unique Columns:** `github_account_login`, `stripe_customer_id`, `stripe_subscription_id`
- **Quota Enforced:** `monthly_run_limit INT` (Free: 30, Pro: 250, Team: 1000), `runs_used_this_period INT`
- **Billing Period:** `billing_period_reset_at TIMESTAMPTZ` (30-day reset cycles)

### `repositories`
- **Primary Key:** `id UUID DEFAULT gen_random_uuid()`
- **Foreign Key:** `org_id UUID REFERENCES organizations(id) ON DELETE CASCADE`
- **Unique Key:** `github_repo_id BIGINT UNIQUE`

### `failure_signatures` (The Historical Moat)
- **Primary Key:** `id UUID DEFAULT gen_random_uuid()`
- **Foreign Key:** `repo_id UUID REFERENCES repositories(id) ON DELETE CASCADE`
- **Unique Key:** `(repo_id, signature_hash)`
- **Key Columns:**
  - `signature_hash TEXT NOT NULL` (SHA-256 hash of normalized error template)
  - `normalized_template TEXT NOT NULL`
  - `embedding vector(1536)` (Vector embedding of error semantics)
  - `flakiness_score NUMERIC(5,2) DEFAULT 0.00`
  - `same_sha_retry_passes INT DEFAULT 0`
  - `total_occurrences INT DEFAULT 1`
  - `main_branch_occurrences INT DEFAULT 0`
  - `unique_prs_affected INT DEFAULT 1`

### `workflow_failures`
- **Primary Key:** `id UUID DEFAULT gen_random_uuid()`
- **Foreign Keys:**
  - `repo_id UUID REFERENCES repositories(id) ON DELETE CASCADE`
  - `signature_id UUID REFERENCES failure_signatures(id) ON DELETE SET NULL`
- **Index:** `(signature_id, failed_at DESC)` for fast cross-run timeline retrieval

### `diagnostic_reports`
- **Primary Key:** `id UUID DEFAULT gen_random_uuid()`
- **Foreign Key:** `workflow_failure_id UUID UNIQUE REFERENCES workflow_failures(id) ON DELETE CASCADE`
- **Content:** `structured_diagnosis JSONB` (validated against Zod `DiagnosisOutputSchema`)

### `user_profiles`, `workspaces`, `workspace_members`
- User identities linked to `auth.users(id)`.
- Workspace types: `personal` and `organization`.
- Roles: `owner`, `admin`, `developer`, `viewer`.

---

## 4. Indexing & Vector Search Performance

1. **Vector Index:**
   ```sql
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_failure_signatures_embedding_hnsw
     ON failure_signatures
     USING hnsw (embedding vector_cosine_ops)
     WITH (m = 16, ef_construction = 64);
   ```
   Provides sub-10ms approximate nearest neighbor queries for semantic cluster deduplication (`cosine_similarity > 0.92`).

2. **B-Tree Indexes:**
   - `idx_organizations_login ON organizations(github_account_login)`
   - `idx_repositories_org_id ON repositories(org_id)`
   - `idx_workflow_failures_sig_date ON workflow_failures(signature_id, failed_at DESC)`
   - `idx_workflow_failures_commit ON workflow_failures(commit_sha)`

---

## 5. Row-Level Security (RLS) Status & Migration 0005 Plan

- **Current State:** Migration 0004 enabled RLS on `user_profiles`, `workspaces`, `workspace_members`, and `workspace_invitations`, but left individual policy rules to be defined.
- **Required Action in Phase 3:** Create `0005_rls_policies.sql` establishing:
  1. `user_profiles`: Users can select/update only their own profile (`auth.uid() = user_id`).
  2. `workspaces`: Accessible only by members with active records in `workspace_members`.
  3. `workspace_members`: Viewable by workspace members; manageable only by `owner` or `admin`.
  4. Core diagnosis tables: Accessible only when user belongs to an associated workspace.

