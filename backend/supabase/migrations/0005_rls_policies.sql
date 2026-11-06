-- 0005_rls_policies.sql — Row-Level Security (RLS) Policies
-- Enforces multi-tenant data isolation and role-based permissions

-- Ensure auth schema and auth.uid() helper exist for local / non-Supabase environments
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- ==============================================================================
-- 1. Enable RLS on core Hopper tables
-- ==============================================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE failure_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_reports ENABLE ROW LEVEL SECURITY;

-- Note: user_profiles, workspaces, workspace_members, workspace_invitations
-- had RLS enabled in 0004_workspace_tables.sql

-- ==============================================================================
-- 2. User Profiles Policies
-- ==============================================================================

-- Public/authenticated profile read
DROP POLICY IF EXISTS user_profiles_select_policy ON user_profiles;
CREATE POLICY user_profiles_select_policy ON user_profiles
  FOR SELECT
  USING (
    auth.uid() IS NULL OR -- Service role / direct connection
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM workspace_members wm1
      JOIN user_profiles up1 ON wm1.user_id = up1.id
      JOIN workspace_members wm2 ON wm1.workspace_id = wm2.workspace_id
      JOIN user_profiles up2 ON wm2.user_id = up2.id
      WHERE up1.user_id = auth.uid() AND up2.id = user_profiles.id
    )
  );

-- Profile creation (own identity)
DROP POLICY IF EXISTS user_profiles_insert_policy ON user_profiles;
CREATE POLICY user_profiles_insert_policy ON user_profiles
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NULL OR -- Service role
    user_id = auth.uid()
  );

-- Profile updates (own identity only)
DROP POLICY IF EXISTS user_profiles_update_policy ON user_profiles;
CREATE POLICY user_profiles_update_policy ON user_profiles
  FOR UPDATE
  USING (
    auth.uid() IS NULL OR -- Service role
    user_id = auth.uid()
  );

-- ==============================================================================
-- 3. Workspaces Policies
-- ==============================================================================

-- Workspaces read: public or user is an active member
DROP POLICY IF EXISTS workspaces_select_policy ON workspaces;
CREATE POLICY workspaces_select_policy ON workspaces
  FOR SELECT
  USING (
    auth.uid() IS NULL OR -- Service role
    is_public = TRUE OR
    EXISTS (
      SELECT 1 FROM workspace_members wm
      JOIN user_profiles up ON wm.user_id = up.id
      WHERE wm.workspace_id = workspaces.id AND up.user_id = auth.uid()
    )
  );

-- Workspace creation: Any authenticated user
DROP POLICY IF EXISTS workspaces_insert_policy ON workspaces;
CREATE POLICY workspaces_insert_policy ON workspaces
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NULL OR -- Service role
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = workspaces.owner_id AND up.user_id = auth.uid()
    )
  );

-- Workspace update: Owner or Admin
DROP POLICY IF EXISTS workspaces_update_policy ON workspaces;
CREATE POLICY workspaces_update_policy ON workspaces
  FOR UPDATE
  USING (
    auth.uid() IS NULL OR -- Service role
    EXISTS (
      SELECT 1 FROM workspace_members wm
      JOIN user_profiles up ON wm.user_id = up.id
      WHERE wm.workspace_id = workspaces.id
        AND up.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- Workspace deletion: Owner only
DROP POLICY IF EXISTS workspaces_delete_policy ON workspaces;
CREATE POLICY workspaces_delete_policy ON workspaces
  FOR DELETE
  USING (
    auth.uid() IS NULL OR -- Service role
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = workspaces.owner_id AND up.user_id = auth.uid()
    )
  );

-- ==============================================================================
-- 4. Workspace Members Policies
-- ==============================================================================

-- Read members: If user belongs to the workspace
DROP POLICY IF EXISTS workspace_members_select_policy ON workspace_members;
CREATE POLICY workspace_members_select_policy ON workspace_members
  FOR SELECT
  USING (
    auth.uid() IS NULL OR -- Service role
    EXISTS (
      SELECT 1 FROM workspace_members my_wm
      JOIN user_profiles up ON my_wm.user_id = up.id
      WHERE my_wm.workspace_id = workspace_members.workspace_id
        AND up.user_id = auth.uid()
    )
  );

-- Modify members: Owner or Admin of the workspace
DROP POLICY IF EXISTS workspace_members_write_policy ON workspace_members;
CREATE POLICY workspace_members_write_policy ON workspace_members
  FOR ALL
  USING (
    auth.uid() IS NULL OR -- Service role
    EXISTS (
      SELECT 1 FROM workspace_members my_wm
      JOIN user_profiles up ON my_wm.user_id = up.id
      WHERE my_wm.workspace_id = workspace_members.workspace_id
        AND up.user_id = auth.uid()
        AND my_wm.role IN ('owner', 'admin')
    )
  );

-- ==============================================================================
-- 5. Diagnostic & CI Failure Data Isolation
-- ==============================================================================

-- Organizations read
DROP POLICY IF EXISTS organizations_select_policy ON organizations;
CREATE POLICY organizations_select_policy ON organizations
  FOR SELECT
  USING (TRUE); -- Readable for dashboard/metrics, mutations restricted to system/stripe

-- Repositories read: Accessible if user has workspace access or public
DROP POLICY IF EXISTS repositories_select_policy ON repositories;
CREATE POLICY repositories_select_policy ON repositories
  FOR SELECT
  USING (
    auth.uid() IS NULL OR -- Service role
    workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM workspace_members wm
      JOIN user_profiles up ON wm.user_id = up.id
      WHERE wm.workspace_id = repositories.workspace_id
        AND up.user_id = auth.uid()
    )
  );

-- Failure Signatures, Workflow Failures, Diagnostic Reports:
-- Accessible if user has access to the parent repository
DROP POLICY IF EXISTS failure_signatures_select_policy ON failure_signatures;
CREATE POLICY failure_signatures_select_policy ON failure_signatures
  FOR SELECT
  USING (
    auth.uid() IS NULL OR
    EXISTS (
      SELECT 1 FROM repositories r
      WHERE r.id = failure_signatures.repo_id
        AND (
          r.workspace_id IS NULL OR
          EXISTS (
            SELECT 1 FROM workspace_members wm
            JOIN user_profiles up ON wm.user_id = up.id
            WHERE wm.workspace_id = r.workspace_id AND up.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS workflow_failures_select_policy ON workflow_failures;
CREATE POLICY workflow_failures_select_policy ON workflow_failures
  FOR SELECT
  USING (
    auth.uid() IS NULL OR
    EXISTS (
      SELECT 1 FROM repositories r
      WHERE r.id = workflow_failures.repo_id
        AND (
          r.workspace_id IS NULL OR
          EXISTS (
            SELECT 1 FROM workspace_members wm
            JOIN user_profiles up ON wm.user_id = up.id
            WHERE wm.workspace_id = r.workspace_id AND up.user_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS diagnostic_reports_select_policy ON diagnostic_reports;
CREATE POLICY diagnostic_reports_select_policy ON diagnostic_reports
  FOR SELECT
  USING (
    auth.uid() IS NULL OR
    EXISTS (
      SELECT 1 FROM workflow_failures wf
      JOIN repositories r ON wf.repo_id = r.id
      WHERE wf.id = diagnostic_reports.failure_id
        AND (
          r.workspace_id IS NULL OR
          EXISTS (
            SELECT 1 FROM workspace_members wm
            JOIN user_profiles up ON wm.user_id = up.id
            WHERE wm.workspace_id = r.workspace_id AND up.user_id = auth.uid()
          )
        )
    )
  );
