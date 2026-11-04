-- ==============================================================================
-- HOPPER CLOUD MOAT & FAILURE DIAGNOSIS DDL (PostgreSQL 16 + pgvector)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Subscription tiers
DO $$ BEGIN
    CREATE TYPE plan_tier AS ENUM ('free', 'pro_dev', 'team');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Organizations (Tenants mapped to GitHub App Installations)
CREATE TABLE IF NOT EXISTS organizations (
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
CREATE TABLE IF NOT EXISTS repositories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    github_repo_id BIGINT UNIQUE NOT NULL,
    full_name TEXT NOT NULL, -- e.g. "acme/payments-service"
    default_branch TEXT NOT NULL DEFAULT 'main',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repos_org_id ON repositories(org_id);

-- 3. Failure Signatures (THE CLOUD MOAT TABLE)
-- Deduplicates errors across runs, branches, and PRs.
CREATE TABLE IF NOT EXISTS failure_signatures (
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
    same_sha_retry_passes INT NOT NULL DEFAULT 0, -- Times this exact commit SHA failed then passed on re-run
    flakiness_score NUMERIC(5,2) NOT NULL DEFAULT 0.00, -- 0.00 to 100.00
    
    -- Cached Diagnosis (Saves LLM costs on repeat failures)
    cached_root_cause TEXT,
    cached_next_check TEXT,
    
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(repo_id, signature_hash)
);

CREATE INDEX IF NOT EXISTS idx_signatures_repo_hash ON failure_signatures(repo_id, signature_hash);
CREATE INDEX IF NOT EXISTS idx_signatures_flakiness ON failure_signatures(repo_id, flakiness_score DESC);

-- 4. Workflow Failures (Individual CI Run/Job Executions)
CREATE TABLE IF NOT EXISTS workflow_failures (
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
    sanitized_log_snippet TEXT NOT NULL,
    failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_failures_repo_sha ON workflow_failures(repo_id, commit_sha);
CREATE INDEX IF NOT EXISTS idx_failures_signature_id ON workflow_failures(signature_id, failed_at DESC);
CREATE INDEX IF NOT EXISTS idx_failures_repo_date ON workflow_failures(repo_id, failed_at DESC);

-- 5. Diagnostic Reports (Rendered Outputs & Audit Trail)
CREATE TABLE IF NOT EXISTS diagnostic_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    failure_id UUID UNIQUE NOT NULL REFERENCES workflow_failures(id) ON DELETE CASCADE,
    root_cause_clues TEXT NOT NULL,
    likely_flaky_test TEXT,
    flaky_confidence NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    relevant_log_lines JSONB NOT NULL,
    suggested_next_check TEXT NOT NULL,
    local_repro_command TEXT,
    correlating_commit_files JSONB,
    github_comment_id BIGINT,
    llm_model_used TEXT NOT NULL,
    prompt_tokens INT NOT NULL DEFAULT 0,
    completion_tokens INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
