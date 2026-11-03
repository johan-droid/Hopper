-- ==============================================================================
-- HOPPER SEED DATA (Organizations, Repos, Signatures & Reports)
-- ==============================================================================

-- Seed Free Organization (Acme Corp)
INSERT INTO organizations (
    id, github_installation_id, github_account_login, github_account_type, plan, monthly_run_limit, runs_used_this_period
) VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 1010101, 'acme-corp', 'Organization', 'free', 30, 29
) ON CONFLICT (github_installation_id) DO NOTHING;

-- Seed Pro Developer Organization (Grace Labs)
INSERT INTO organizations (
    id, github_installation_id, github_account_login, github_account_type, plan, monthly_run_limit, runs_used_this_period
) VALUES (
    'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b22', 2020202, 'grace-hopper-labs', 'User', 'pro_dev', 250, 42
) ON CONFLICT (github_installation_id) DO NOTHING;

-- Seed Repository
INSERT INTO repositories (
    id, org_id, github_repo_id, full_name, default_branch, is_active
) VALUES (
    'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380c33',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    555666777,
    'acme-corp/payments-service',
    'main',
    true
) ON CONFLICT (github_repo_id) DO NOTHING;

-- Seed Recurring Flaky Signature
INSERT INTO failure_signatures (
    id,
    repo_id,
    signature_hash,
    normalized_template,
    test_identifier,
    error_category,
    total_occurrences,
    main_branch_occurrences,
    unique_prs_affected,
    same_sha_retry_passes,
    flakiness_score,
    cached_root_cause,
    cached_next_check
) VALUES (
    'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380d44',
    'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380c33',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'job:unit-tests|step:run tests|test:auth/jwt-verifier.spec.ts|trace:AssertionError: expected active to deeply equal revoked',
    'src/auth/jwt-verifier.spec.ts > Authentication Service > should verify valid signed JWT token',
    'test_assertion',
    14,
    3,
    6,
    4,
    92.50,
    'Async race condition where revocation cache TTL expires intermittently during token verification assertion.',
    'Increase TTL cache buffer or mock the time source deterministically.'
) ON CONFLICT (repo_id, signature_hash) DO NOTHING;
