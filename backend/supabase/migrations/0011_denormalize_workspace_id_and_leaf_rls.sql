-- 0011_denormalize_workspace_id_and_leaf_rls.sql — Workspace Denormalization & Coalescing Lock
-- Eliminates multi-hop subqueries in RLS on leaf tables and supports matrix diagnosis coalescing

-- ==============================================================================
-- 1. Denormalize workspace_id onto failure_signatures, workflow_failures, diagnostic_reports
-- ==============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'failure_signatures' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE failure_signatures
    ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workflow_failures' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE workflow_failures
    ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'diagnostic_reports' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE diagnostic_reports
    ADD COLUMN workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes for single-hop tenant lookup
CREATE INDEX IF NOT EXISTS idx_failure_signatures_workspace_id ON failure_signatures(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workflow_failures_workspace_id ON workflow_failures(workspace_id);
CREATE INDEX IF NOT EXISTS idx_diagnostic_reports_workspace_id ON diagnostic_reports(workspace_id);

-- ==============================================================================
-- 2. Backfill existing rows with workspace_id from parent relationships
-- ==============================================================================

UPDATE failure_signatures fs
SET workspace_id = r.workspace_id
FROM repositories r
WHERE fs.repo_id = r.id AND fs.workspace_id IS NULL AND r.workspace_id IS NOT NULL;

UPDATE workflow_failures wf
SET workspace_id = r.workspace_id
FROM repositories r
WHERE wf.repo_id = r.id AND wf.workspace_id IS NULL AND r.workspace_id IS NOT NULL;

UPDATE diagnostic_reports dr
SET workspace_id = wf.workspace_id
FROM workflow_failures wf
WHERE dr.failure_id = wf.id AND dr.workspace_id IS NULL AND wf.workspace_id IS NOT NULL;

-- ==============================================================================
-- 3. Automatic BEFORE INSERT triggers to populate workspace_id from parents
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.trg_populate_failure_signature_workspace_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.repo_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM repositories WHERE id = NEW.repo_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_populate_failure_signature_workspace_id ON failure_signatures;
CREATE TRIGGER trg_populate_failure_signature_workspace_id
BEFORE INSERT ON failure_signatures
FOR EACH ROW EXECUTE FUNCTION public.trg_populate_failure_signature_workspace_id();

CREATE OR REPLACE FUNCTION public.trg_populate_workflow_failure_workspace_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.repo_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM repositories WHERE id = NEW.repo_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_populate_workflow_failure_workspace_id ON workflow_failures;
CREATE TRIGGER trg_populate_workflow_failure_workspace_id
BEFORE INSERT ON workflow_failures
FOR EACH ROW EXECUTE FUNCTION public.trg_populate_workflow_failure_workspace_id();

CREATE OR REPLACE FUNCTION public.trg_populate_diagnostic_report_workspace_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.failure_id IS NOT NULL THEN
    SELECT workspace_id INTO NEW.workspace_id FROM workflow_failures WHERE id = NEW.failure_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_populate_diagnostic_report_workspace_id ON diagnostic_reports;
CREATE TRIGGER trg_populate_diagnostic_report_workspace_id
BEFORE INSERT ON diagnostic_reports
FOR EACH ROW EXECUTE FUNCTION public.trg_populate_diagnostic_report_workspace_id();

-- ==============================================================================
-- 4. Single-Hop Row-Level Security (RLS) Policies on Leaf Tables
-- ==============================================================================

DROP POLICY IF EXISTS failure_signatures_select_policy ON failure_signatures;
CREATE POLICY failure_signatures_select_policy ON failure_signatures
  FOR SELECT
  USING (
    workspace_id IS NULL OR
    workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
  );

DROP POLICY IF EXISTS workflow_failures_select_policy ON workflow_failures;
CREATE POLICY workflow_failures_select_policy ON workflow_failures
  FOR SELECT
  USING (
    workspace_id IS NULL OR
    workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
  );

DROP POLICY IF EXISTS diagnostic_reports_select_policy ON diagnostic_reports;
CREATE POLICY diagnostic_reports_select_policy ON diagnostic_reports
  FOR SELECT
  USING (
    workspace_id IS NULL OR
    workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
  );

-- ==============================================================================
-- 5. Matrix In-Flight Diagnosis Coalescing Extensions
-- ==============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hopper_diagnosis_locks' AND column_name = 'diagnostic_report_id'
  ) THEN
    ALTER TABLE hopper_diagnosis_locks
    ADD COLUMN diagnostic_report_id UUID REFERENCES diagnostic_reports(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION hopper_complete_diagnosis_lock(
  p_lock_key   TEXT,
  p_token      TEXT,
  p_report_id  UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE hopper_diagnosis_locks
  SET diagnostic_report_id = p_report_id,
      expires_at = NOW() + INTERVAL '5 minutes'
  WHERE lock_key = p_lock_key AND token = p_token;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

CREATE OR REPLACE FUNCTION hopper_get_coalesced_diagnosis(
  p_lock_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_report_id UUID;
BEGIN
  SELECT diagnostic_report_id INTO v_report_id
  FROM hopper_diagnosis_locks
  WHERE lock_key = p_lock_key
    AND diagnostic_report_id IS NOT NULL
    AND expires_at > NOW();

  RETURN v_report_id;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hopper_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON hopper_diagnosis_locks TO hopper_app;
    GRANT SELECT, INSERT, UPDATE ON failure_signatures, workflow_failures, diagnostic_reports TO hopper_app;
  END IF;
END $$;
