-- 0012_organization_ai_budget_ledgers.sql
-- Enforces Organization-Level AI Budget Ledgers, Tenant Spending Limits, and RLS Isolation
-- Replaces global $500 ceiling with independently enforceable per-organization financial ledgers.

-- ==============================================================================
-- 1. Create Organization AI Budget Settings Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS organization_ai_budget_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  monthly_limit_usd NUMERIC(10, 4) NOT NULL DEFAULT 50.0000,
  nominal_cap_usd NUMERIC(10, 4) NOT NULL DEFAULT 47.5000,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_org_budget_limit_positive CHECK (monthly_limit_usd > 0 AND nominal_cap_usd > 0)
);

CREATE INDEX IF NOT EXISTS idx_org_ai_budget_settings_enabled 
  ON organization_ai_budget_settings(organization_id) WHERE enabled = TRUE;

-- Seed default settings for any existing organizations that don't have settings
INSERT INTO organization_ai_budget_settings (organization_id, monthly_limit_usd, nominal_cap_usd, enabled)
SELECT 
  id,
  CASE 
    WHEN plan = 'team' THEN 200.0000
    WHEN plan = 'pro_dev' THEN 50.0000
    ELSE 10.0000
  END,
  CASE 
    WHEN plan = 'team' THEN 190.0000
    WHEN plan = 'pro_dev' THEN 47.5000
    ELSE 9.5000
  END,
  TRUE
FROM organizations
ON CONFLICT (organization_id) DO NOTHING;

-- ==============================================================================
-- 2. Add organization_id to ai_budget_ledgers & ai_cost_reservations
-- ==============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_budget_ledgers' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE ai_budget_ledgers
    ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'ai_cost_reservations' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE ai_cost_reservations
    ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Drop obsolete check constraint that enforced budget_limit_usd = 500.0000
ALTER TABLE ai_budget_ledgers DROP CONSTRAINT IF EXISTS chk_ai_budget_bounds;

-- Recreate check constraint allowing variable per-organization budget limits
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_ai_budget_bounds_v2'
  ) THEN
    ALTER TABLE ai_budget_ledgers ADD CONSTRAINT chk_ai_budget_bounds_v2 CHECK (
      settled_spend_usd >= 0 AND
      reserved_spend_usd >= 0 AND
      uncertain_spend_usd >= 0 AND
      budget_limit_usd > 0
    );
  END IF;
END $$;

-- Partial unique index: one active ledger per organization per billing period
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_budget_ledgers_org_period 
  ON ai_budget_ledgers(organization_id, period_start, period_end) 
  WHERE organization_id IS NOT NULL;

-- Index for active organization ledger lookups
CREATE INDEX IF NOT EXISTS idx_ai_budget_ledgers_org_active 
  ON ai_budget_ledgers(organization_id, is_active, period_start, period_end) 
  WHERE organization_id IS NOT NULL;

-- Unique reservation idempotency per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_cost_reservations_org_idempotency 
  ON ai_cost_reservations(organization_id, idempotency_key) 
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_cost_reservations_org_status 
  ON ai_cost_reservations(organization_id, status);

-- Backfill organization_id onto ai_cost_reservations from repo -> org where possible
UPDATE ai_cost_reservations acr
SET organization_id = r.org_id
FROM repositories r
WHERE acr.repo_id = r.id AND acr.organization_id IS NULL AND r.org_id IS NOT NULL;

-- ==============================================================================
-- 3. Row Level Security Hardening for Budget Tables
-- ==============================================================================
ALTER TABLE organization_ai_budget_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_ai_budget_settings FORCE ROW LEVEL SECURITY;

-- Drop overly permissive USING (TRUE) policies
DROP POLICY IF EXISTS ai_budget_ledgers_all ON ai_budget_ledgers;
DROP POLICY IF EXISTS ai_cost_reservations_all ON ai_cost_reservations;

-- Tenant-scoped policies for organization_ai_budget_settings
DROP POLICY IF EXISTS org_ai_budget_settings_select ON organization_ai_budget_settings;
CREATE POLICY org_ai_budget_settings_select ON organization_ai_budget_settings
  FOR SELECT
  USING (
    auth.uid() IS NULL OR
    organization_id IN (
      SELECT o.id FROM organizations o
      WHERE o.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
    )
  );

DROP POLICY IF EXISTS org_ai_budget_settings_modify ON organization_ai_budget_settings;
CREATE POLICY org_ai_budget_settings_modify ON organization_ai_budget_settings
  FOR ALL
  USING (
    auth.uid() IS NULL OR
    organization_id IN (
      SELECT o.id FROM organizations o
      WHERE public.is_workspace_admin_or_owner(o.workspace_id, auth.uid())
    )
  )
  WITH CHECK (
    auth.uid() IS NULL OR
    organization_id IN (
      SELECT o.id FROM organizations o
      WHERE public.is_workspace_admin_or_owner(o.workspace_id, auth.uid())
    )
  );

-- Tenant-scoped policies for ai_budget_ledgers
DROP POLICY IF EXISTS ai_budget_ledgers_select ON ai_budget_ledgers;
CREATE POLICY ai_budget_ledgers_select ON ai_budget_ledgers
  FOR SELECT
  USING (
    auth.uid() IS NULL OR
    organization_id IS NULL OR
    organization_id IN (
      SELECT o.id FROM organizations o
      WHERE o.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
    )
  );

DROP POLICY IF EXISTS ai_budget_ledgers_modify ON ai_budget_ledgers;
CREATE POLICY ai_budget_ledgers_modify ON ai_budget_ledgers
  FOR ALL
  USING (
    auth.uid() IS NULL OR
    organization_id IS NULL OR
    organization_id IN (
      SELECT o.id FROM organizations o
      WHERE public.is_workspace_admin_or_owner(o.workspace_id, auth.uid())
    )
  )
  WITH CHECK (
    auth.uid() IS NULL OR
    organization_id IS NULL OR
    organization_id IN (
      SELECT o.id FROM organizations o
      WHERE public.is_workspace_admin_or_owner(o.workspace_id, auth.uid())
    )
  );

-- Tenant-scoped policies for ai_cost_reservations
DROP POLICY IF EXISTS ai_cost_reservations_select ON ai_cost_reservations;
CREATE POLICY ai_cost_reservations_select ON ai_cost_reservations
  FOR SELECT
  USING (
    auth.uid() IS NULL OR
    organization_id IS NULL OR
    organization_id IN (
      SELECT o.id FROM organizations o
      WHERE o.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
    )
  );

DROP POLICY IF EXISTS ai_cost_reservations_modify ON ai_cost_reservations;
CREATE POLICY ai_cost_reservations_modify ON ai_cost_reservations
  FOR ALL
  USING (
    auth.uid() IS NULL OR
    organization_id IS NULL OR
    organization_id IN (
      SELECT o.id FROM organizations o
      WHERE o.workspace_id IN (SELECT public.get_user_workspace_ids(auth.uid()))
    )
  )
  WITH CHECK (
    auth.uid() IS NULL OR
    organization_id IS NULL OR
    organization_id IN (
      SELECT o.id FROM organizations o
      WHERE public.is_workspace_admin_or_owner(o.workspace_id, auth.uid())
    )
  );

-- ==============================================================================
-- 4. Grants for hopper_app runtime role
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hopper_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON organization_ai_budget_settings TO hopper_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ai_budget_ledgers TO hopper_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ai_cost_reservations TO hopper_app;
  END IF;
END $$;

