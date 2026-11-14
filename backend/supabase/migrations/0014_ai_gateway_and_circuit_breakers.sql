-- 0014_ai_gateway_and_circuit_breakers.sql
-- AI Gateway: Request Telemetry, Circuit Breaker Coordination, and Provider Health State

-- ==============================================================================
-- 1. Create AI Gateway Requests Telemetry Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS ai_gateway_requests (
  request_id UUID PRIMARY KEY,
  task_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL, -- 'success', 'failed', 'exhausted', 'budget_rejected'
  error_class TEXT,
  error_kind TEXT,
  latency_ms INT NOT NULL DEFAULT 0,
  prompt_tokens INT,
  completion_tokens INT,
  estimated_usage BOOLEAN NOT NULL DEFAULT false,
  attempts INT NOT NULL DEFAULT 1,
  failover_path JSONB NOT NULL DEFAULT '[]'::jsonb,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_gw_req_task_created
  ON ai_gateway_requests(task_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_gw_req_provider_model
  ON ai_gateway_requests(provider_id, model, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_gw_req_status
  ON ai_gateway_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_gw_req_org
  ON ai_gateway_requests(organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;

-- Enable RLS
ALTER TABLE ai_gateway_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_gateway_requests_select_policy ON ai_gateway_requests
  FOR SELECT
  USING (
    organization_id IS NULL OR
    organization_id IN (
      SELECT organization_id FROM workspace_organizations
      WHERE workspace_id IN (
        SELECT workspace_id FROM workspace_members
        WHERE user_id = current_setting('app.current_user_id', true)::uuid
      )
    )
  );

-- ==============================================================================
-- 2. Create AI Circuit Breaker Coordination Table
-- ==============================================================================
CREATE TABLE IF NOT EXISTS ai_circuit_breakers (
  provider_id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'closed', -- 'closed', 'open', 'half_open'
  consecutive_failures INT NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE ai_circuit_breakers ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_circuit_breakers_select_policy ON ai_circuit_breakers
  FOR SELECT
  USING (true); -- Read-only inspection for system health
