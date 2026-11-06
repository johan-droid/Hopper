-- 0006_fix_rls_security_definer.sql — Fix RLS Circular Recursion & Harden Tenant Isolation
-- Replaces recursive subquery policies with SECURITY DEFINER helper functions

-- ==============================================================================
-- 1. SECURITY DEFINER Helper Functions
-- These execute with elevated privileges to check memberships without RLS loops
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_user_workspace_ids(p_auth_uid UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT wm.workspace_id
  FROM workspace_members wm
  JOIN user_profiles up ON wm.user_id = up.id
  WHERE up.user_id = p_auth_uid;
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id UUID, p_auth_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_members wm
    JOIN user_profiles up ON wm.user_id = up.id
    WHERE wm.workspace_id = p_workspace_id
      AND up.user_id = p_auth_uid
  );
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_admin_or_owner(p_workspace_id UUID, p_auth_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_members wm
    JOIN user_profiles up ON wm.user_id = up.id
    WHERE wm.workspace_id = p_workspace_id
      AND up.user_id = p_auth_uid
      AND wm.role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_owner(p_workspace_id UUID, p_auth_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspaces w
    JOIN user_profiles up ON w.owner_id = up.id
    WHERE w.id = p_workspace_id
      AND up.user_id = p_auth_uid
  );
$$;

-- Grant execute to authenticated users and service roles
GRANT EXECUTE ON FUNCTION public.get_user_workspace_ids(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(UUID, UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_admin_or_owner(UUID, UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_owner(UUID, UUID) TO PUBLIC;

-- ==============================================================================
-- 2. Drop Insecure & Recursive Policies from 0005
-- ==============================================================================

DROP POLICY IF EXISTS workspace_members_select_policy ON workspace_members;
DROP POLICY IF EXISTS workspace_members_write_policy ON workspace_members;
DROP POLICY IF EXISTS workspaces_select_policy ON workspaces;
DROP POLICY IF EXISTS workspaces_insert_policy ON workspaces;
DROP POLICY IF EXISTS workspaces_update_policy ON workspaces;
DROP POLICY IF EXISTS workspaces_delete_policy ON workspaces;
DROP POLICY IF EXISTS user_profiles_select_policy ON user_profiles;
DROP POLICY IF EXISTS user_profiles_insert_policy ON user_profiles;
DROP POLICY IF EXISTS user_profiles_update_policy ON user_profiles;
DROP POLICY IF EXISTS repositories_select_policy ON repositories;
DROP POLICY IF EXISTS failure_signatures_select_policy ON failure_signatures;
DROP POLICY IF EXISTS workflow_failures_select_policy ON workflow_failures;
DROP POLICY IF EXISTS diagnostic_reports_select_policy ON diagnostic_reports;

-- ==============================================================================
-- 3. Non-Recursive, Hardened Row-Level Security Policies
-- ==============================================================================

-- A. workspace_members
CREATE POLICY workspace_members_select_policy ON workspace_members
  FOR SELECT
  USING (
    workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
  );

CREATE POLICY workspace_members_write_policy ON workspace_members
  FOR ALL
  USING (
    public.is_workspace_admin_or_owner(workspace_id, auth.uid())
  );

-- B. workspaces
CREATE POLICY workspaces_select_policy ON workspaces
  FOR SELECT
  USING (
    is_public = TRUE OR
    id IN (SELECT public.get_user_workspace_ids(auth.uid()))
  );

CREATE POLICY workspaces_insert_policy ON workspaces
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = workspaces.owner_id AND up.user_id = auth.uid()
    )
  );

CREATE POLICY workspaces_update_policy ON workspaces
  FOR UPDATE
  USING (
    public.is_workspace_admin_or_owner(id, auth.uid())
  );

CREATE POLICY workspaces_delete_policy ON workspaces
  FOR DELETE
  USING (
    public.is_workspace_owner(id, auth.uid())
  );

-- C. user_profiles
CREATE POLICY user_profiles_select_policy ON user_profiles
  FOR SELECT
  USING (
    user_id = auth.uid() OR
    id IN (
      SELECT wm.user_id
      FROM workspace_members wm
      WHERE wm.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
    )
  );

CREATE POLICY user_profiles_insert_policy ON user_profiles
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
  );

CREATE POLICY user_profiles_update_policy ON user_profiles
  FOR UPDATE
  USING (
    user_id = auth.uid()
  );

-- D. repositories
CREATE POLICY repositories_select_policy ON repositories
  FOR SELECT
  USING (
    workspace_id IS NULL OR
    workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
  );

-- E. failure_signatures, workflow_failures, diagnostic_reports
CREATE POLICY failure_signatures_select_policy ON failure_signatures
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM repositories r
      WHERE r.id = failure_signatures.repo_id
        AND (r.workspace_id IS NULL OR r.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))
    )
  );

CREATE POLICY workflow_failures_select_policy ON workflow_failures
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM repositories r
      WHERE r.id = workflow_failures.repo_id
        AND (r.workspace_id IS NULL OR r.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))
    )
  );

CREATE POLICY diagnostic_reports_select_policy ON diagnostic_reports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM workflow_failures wf
      JOIN repositories r ON wf.repo_id = r.id
      WHERE wf.id = diagnostic_reports.failure_id
        AND (r.workspace_id IS NULL OR r.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))
    )
  );

