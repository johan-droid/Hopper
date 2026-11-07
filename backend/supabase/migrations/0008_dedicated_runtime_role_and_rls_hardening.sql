-- 0008_dedicated_runtime_role_and_rls_hardening.sql
-- Enforces Kernel-Level PostgreSQL Row-Level Security (RLS) & Dedicated Runtime Role
-- 
-- Objectives:
-- 1. Create/Harden unprivileged application runtime role 'hopper_app' (NOSUPERUSER, NOBYPASSRLS)
-- 2. Force Row-Level Security on all tenant tables (FORCE ROW LEVEL SECURITY)
-- 3. Add explicit INSERT, UPDATE, DELETE policies with WITH CHECK constraints
-- 4. Eliminate reliance on application middleware alone for data isolation

-- ==============================================================================
-- 1. Configure Dedicated Unprivileged Runtime Role: hopper_app
-- ==============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hopper_app') THEN
    CREATE ROLE hopper_app WITH LOGIN PASSWORD 'hopper_app_secure_runtime_password' NOCREATEDB NOCREATEROLE NOINHERIT;
  ELSE
    ALTER ROLE hopper_app WITH LOGIN PASSWORD 'hopper_app_secure_runtime_password';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Role configuration notice: %', SQLERRM;
END $$;

-- Grant schema usage
DO $$
BEGIN
  GRANT USAGE ON SCHEMA public TO hopper_app;
  BEGIN
    GRANT USAGE ON SCHEMA auth TO hopper_app;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ==============================================================================
-- 2. Force Row-Level Security on All Core Tenant Tables
-- ==============================================================================
ALTER TABLE user_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_members FORCE ROW LEVEL SECURITY;
ALTER TABLE workspace_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE repositories FORCE ROW LEVEL SECURITY;
ALTER TABLE failure_signatures FORCE ROW LEVEL SECURITY;
ALTER TABLE workflow_failures FORCE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_reports FORCE ROW LEVEL SECURITY;

-- ==============================================================================
-- 3. Comprehensive RLS Policies for Tenant Write/Delete Isolation
-- ==============================================================================

-- A. Repositories
DROP POLICY IF EXISTS repositories_insert_policy ON repositories;
CREATE POLICY repositories_insert_policy ON repositories
  FOR INSERT
  WITH CHECK (
    workspace_id IS NULL OR
    workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
  );

DROP POLICY IF EXISTS repositories_update_policy ON repositories;
CREATE POLICY repositories_update_policy ON repositories
  FOR UPDATE
  USING (
    workspace_id IS NULL OR
    public.is_workspace_admin_or_owner(workspace_id, auth.uid())
  )
  WITH CHECK (
    workspace_id IS NULL OR
    public.is_workspace_admin_or_owner(workspace_id, auth.uid())
  );

DROP POLICY IF EXISTS repositories_delete_policy ON repositories;
CREATE POLICY repositories_delete_policy ON repositories
  FOR DELETE
  USING (
    workspace_id IS NOT NULL AND
    public.is_workspace_owner(workspace_id, auth.uid())
  );

-- B. Workflow Failures
DROP POLICY IF EXISTS workflow_failures_insert_policy ON workflow_failures;
CREATE POLICY workflow_failures_insert_policy ON workflow_failures
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM repositories r
      WHERE r.id = workflow_failures.repo_id
        AND (r.workspace_id IS NULL OR r.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))
    )
  );

DROP POLICY IF EXISTS workflow_failures_update_policy ON workflow_failures;
CREATE POLICY workflow_failures_update_policy ON workflow_failures
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM repositories r
      WHERE r.id = workflow_failures.repo_id
        AND (r.workspace_id IS NULL OR public.is_workspace_admin_or_owner(r.workspace_id, auth.uid()))
    )
  );

DROP POLICY IF EXISTS workflow_failures_delete_policy ON workflow_failures;
CREATE POLICY workflow_failures_delete_policy ON workflow_failures
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM repositories r
      WHERE r.id = workflow_failures.repo_id
        AND (r.workspace_id IS NOT NULL AND public.is_workspace_admin_or_owner(r.workspace_id, auth.uid()))
    )
  );

-- C. Diagnostic Reports
DROP POLICY IF EXISTS diagnostic_reports_insert_policy ON diagnostic_reports;
CREATE POLICY diagnostic_reports_insert_policy ON diagnostic_reports
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workflow_failures wf
      JOIN repositories r ON wf.repo_id = r.id
      WHERE wf.id = diagnostic_reports.failure_id
        AND (r.workspace_id IS NULL OR r.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))
    )
  );

DROP POLICY IF EXISTS diagnostic_reports_update_policy ON diagnostic_reports;
CREATE POLICY diagnostic_reports_update_policy ON diagnostic_reports
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workflow_failures wf
      JOIN repositories r ON wf.repo_id = r.id
      WHERE wf.id = diagnostic_reports.failure_id
        AND (r.workspace_id IS NULL OR public.is_workspace_admin_or_owner(r.workspace_id, auth.uid()))
    )
  );

DROP POLICY IF EXISTS diagnostic_reports_delete_policy ON diagnostic_reports;
CREATE POLICY diagnostic_reports_delete_policy ON diagnostic_reports
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workflow_failures wf
      JOIN repositories r ON wf.repo_id = r.id
      WHERE wf.id = diagnostic_reports.failure_id
        AND (r.workspace_id IS NOT NULL AND public.is_workspace_admin_or_owner(r.workspace_id, auth.uid()))
    )
  );

-- D. Failure Signatures
DROP POLICY IF EXISTS failure_signatures_insert_policy ON failure_signatures;
CREATE POLICY failure_signatures_insert_policy ON failure_signatures
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM repositories r
      WHERE r.id = failure_signatures.repo_id
        AND (r.workspace_id IS NULL OR r.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid())))
    )
  );

DROP POLICY IF EXISTS failure_signatures_update_policy ON failure_signatures;
CREATE POLICY failure_signatures_update_policy ON failure_signatures
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM repositories r
      WHERE r.id = failure_signatures.repo_id
        AND (r.workspace_id IS NULL OR public.is_workspace_admin_or_owner(r.workspace_id, auth.uid()))
    )
  );

-- ==============================================================================
-- 4. Grant DML Permissions to Runtime Role (No DDL)
-- ==============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hopper_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hopper_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO hopper_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO hopper_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hopper_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO hopper_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO hopper_app;

