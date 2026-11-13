-- 0013_github_integration_and_rate_limiting.sql
-- GitHub Integration Architecture: Distributed Rate Limiting, Lifecycle Tracking, Integration Auditing & Publication Reliability

-- ==============================================================================
-- 1. Create GitHub API Rate Limits Coordination Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS github_api_rate_limits (
  installation_id BIGINT NOT NULL,
  resource TEXT NOT NULL DEFAULT 'core',
  limit_count INT NOT NULL DEFAULT 5000,
  remaining INT NOT NULL DEFAULT 5000,
  reset_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
  used INT NOT NULL DEFAULT 0,
  secondary_cooldown_until TIMESTAMPTZ,
  consecutive_403_429 INT NOT NULL DEFAULT 0,
  last_request_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_response_status INT,
  PRIMARY KEY (installation_id, resource)
);

CREATE INDEX IF NOT EXISTS idx_gh_rate_limits_cooldown 
  ON github_api_rate_limits(secondary_cooldown_until) 
  WHERE secondary_cooldown_until IS NOT NULL;

-- ==============================================================================
-- 2. Create GitHub Integration Audit Events Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS github_integration_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  installation_id BIGINT,
  event_type TEXT NOT NULL,
  actor_login TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gh_audit_org_created 
  ON github_integration_audit_events(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gh_audit_inst_created 
  ON github_integration_audit_events(installation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gh_audit_event_type 
  ON github_integration_audit_events(event_type);

-- ==============================================================================
-- 3. Create GitHub Publication Attempts Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS github_publication_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES diagnostic_reports(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('pr_comment', 'check_run', 'rerun')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'retryable_failure', 'permanent_failure')),
  github_comment_id BIGINT,
  check_run_id BIGINT,
  attempt_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_gh_pub_report_target 
  ON github_publication_attempts(report_id, target_type);

CREATE INDEX IF NOT EXISTS idx_gh_pub_status 
  ON github_publication_attempts(status);

-- ==============================================================================
-- 4. Alter organizations to add installation lifecycle metadata
-- ==============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'installation_status'
  ) THEN
    ALTER TABLE organizations
    ADD COLUMN installation_status TEXT NOT NULL DEFAULT 'active'
    CHECK (installation_status IN ('active', 'suspended', 'deleted', 'pending'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'permissions'
  ) THEN
    ALTER TABLE organizations
    ADD COLUMN permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'repository_selection'
  ) THEN
    ALTER TABLE organizations
    ADD COLUMN repository_selection TEXT NOT NULL DEFAULT 'all'
    CHECK (repository_selection IN ('all', 'selected'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'installed_at'
  ) THEN
    ALTER TABLE organizations
    ADD COLUMN installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'suspended_at'
  ) THEN
    ALTER TABLE organizations
    ADD COLUMN suspended_at TIMESTAMPTZ;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_organizations_installation_status 
  ON organizations(installation_status);

-- ==============================================================================
-- 5. Alter repositories to add sync metadata
-- ==============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'repositories' AND column_name = 'visibility'
  ) THEN
    ALTER TABLE repositories
    ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private', 'internal'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'repositories' AND column_name = 'is_archived'
  ) THEN
    ALTER TABLE repositories
    ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'repositories' AND column_name = 'last_synced_at'
  ) THEN
    ALTER TABLE repositories
    ADD COLUMN last_synced_at TIMESTAMPTZ;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_repositories_visibility 
  ON repositories(visibility);

-- ==============================================================================
-- 6. Row-Level Security (RLS) Policies
-- ==============================================================================
ALTER TABLE github_api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_integration_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_publication_attempts ENABLE ROW LEVEL SECURITY;

-- Rate limits: system coordination table
DROP POLICY IF EXISTS gh_rate_limits_isolation ON github_api_rate_limits;
CREATE POLICY gh_rate_limits_isolation ON github_api_rate_limits
  FOR ALL
  USING (
    auth.uid() IS NULL OR
    installation_id IN (
      SELECT o.github_installation_id FROM organizations o
      WHERE o.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
    )
  );

-- Audit events: visible to members of the workspace
DROP POLICY IF EXISTS gh_audit_events_select ON github_integration_audit_events;
CREATE POLICY gh_audit_events_select ON github_integration_audit_events
  FOR SELECT
  USING (
    auth.uid() IS NULL OR
    organization_id IS NULL OR
    organization_id IN (
      SELECT o.id FROM organizations o
      WHERE o.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
    )
  );

DROP POLICY IF EXISTS gh_audit_events_modify ON github_integration_audit_events;
CREATE POLICY gh_audit_events_modify ON github_integration_audit_events
  FOR ALL
  USING (
    auth.uid() IS NULL OR
    organization_id IS NULL OR
    organization_id IN (
      SELECT o.id FROM organizations o
      WHERE public.is_workspace_admin_or_owner(o.workspace_id, auth.uid())
    )
  );

-- Publication attempts: visible to workspace members
DROP POLICY IF EXISTS gh_pub_attempts_select ON github_publication_attempts;
CREATE POLICY gh_pub_attempts_select ON github_publication_attempts
  FOR SELECT
  USING (
    auth.uid() IS NULL OR
    report_id IN (
      SELECT dr.id FROM diagnostic_reports dr
      JOIN workflow_failures wf ON wf.id = dr.failure_id
      JOIN repositories r ON r.id = wf.repo_id
      WHERE r.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
    )
  );

DROP POLICY IF EXISTS gh_pub_attempts_modify ON github_publication_attempts;
CREATE POLICY gh_pub_attempts_modify ON github_publication_attempts
  FOR ALL
  USING (
    auth.uid() IS NULL OR
    report_id IN (
      SELECT dr.id FROM diagnostic_reports dr
      JOIN workflow_failures wf ON wf.id = dr.failure_id
      JOIN repositories r ON r.id = wf.repo_id
      WHERE r.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
    )
  );

-- ==============================================================================
-- 7. Grants for hopper_app runtime role
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hopper_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON github_api_rate_limits TO hopper_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON github_integration_audit_events TO hopper_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON github_publication_attempts TO hopper_app;
  END IF;
END $$;
