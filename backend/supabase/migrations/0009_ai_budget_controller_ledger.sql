-- 0009_ai_budget_controller_ledger.sql
-- Durable PostgreSQL ACID Ledger for $500.00 USD Monthly AI Budget Controller
-- Enforces application-side spending cap, pre-flight cost reservations, and settlement tracking

-- ==============================================================================
-- 1. Monthly Budget Ledger Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS ai_budget_ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  budget_limit_usd NUMERIC(10, 4) NOT NULL DEFAULT 500.0000,
  nominal_cap_usd NUMERIC(10, 4) NOT NULL DEFAULT 475.0000,
  settled_spend_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  reserved_spend_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  uncertain_spend_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.0000,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ai_budget_bounds CHECK (
    settled_spend_usd >= 0 AND
    reserved_spend_usd >= 0 AND
    uncertain_spend_usd >= 0 AND
    budget_limit_usd = 500.0000
  )
);

CREATE INDEX IF NOT EXISTS idx_ai_budget_ledgers_active 
  ON ai_budget_ledgers(is_active, period_start, period_end);

-- ==============================================================================
-- 2. Cost Reservations Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS ai_cost_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_id UUID NOT NULL REFERENCES ai_budget_ledgers(id) ON DELETE CASCADE,
  idempotency_key TEXT UNIQUE NOT NULL,
  job_id TEXT,
  failure_id UUID,
  repo_id UUID,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  pricing_version TEXT NOT NULL DEFAULT '2024-10-pricing-v1',
  status TEXT NOT NULL CHECK (status IN (
    'reserved',
    'submitted',
    'settled',
    'failed_confirmed_zero',
    'usage_unknown'
  )),
  estimated_cost_usd NUMERIC(10, 6) NOT NULL,
  safety_margin_usd NUMERIC(10, 6) NOT NULL DEFAULT 0.000000,
  total_reserved_usd NUMERIC(10, 6) NOT NULL,
  actual_cost_usd NUMERIC(10, 6),
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cache_write_tokens INTEGER,
  cache_read_tokens INTEGER,
  latency_ms INTEGER,
  expires_at TIMESTAMPTZ NOT NULL,
  error_details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_cost_reservations_ledger_status 
  ON ai_cost_reservations(ledger_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_cost_reservations_expires 
  ON ai_cost_reservations(status, expires_at);

-- ==============================================================================
-- 3. Seed Current Month Ledger if none exists
-- ==============================================================================
DO $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_start TIMESTAMPTZ := date_trunc('month', v_now);
  v_end TIMESTAMPTZ := date_trunc('month', v_now) + INTERVAL '1 month';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ai_budget_ledgers 
    WHERE period_start <= v_now AND period_end > v_now AND is_active = TRUE
  ) THEN
    INSERT INTO ai_budget_ledgers (period_start, period_end, budget_limit_usd, nominal_cap_usd)
    VALUES (v_start, v_end, 500.0000, 475.0000);
  END IF;
END $$;

-- Enable RLS and Grant Permissions
ALTER TABLE ai_budget_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_cost_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_budget_ledgers FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_cost_reservations FORCE ROW LEVEL SECURITY;

-- Allow system/runtime access
DROP POLICY IF EXISTS ai_budget_ledgers_all ON ai_budget_ledgers;
CREATE POLICY ai_budget_ledgers_all ON ai_budget_ledgers FOR ALL USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS ai_cost_reservations_all ON ai_cost_reservations;
CREATE POLICY ai_cost_reservations_all ON ai_cost_reservations FOR ALL USING (TRUE) WITH CHECK (TRUE);

GRANT SELECT, INSERT, UPDATE, DELETE ON ai_budget_ledgers TO hopper_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_cost_reservations TO hopper_app;

