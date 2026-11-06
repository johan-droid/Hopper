-- 0010_durable_queue_and_coordination.sql
-- Replaces Redis + BullMQ with PostgreSQL-native durable primitives:
--   1. hopper_job_queue            — durable at-least-once job queue (SELECT ... FOR UPDATE SKIP LOCKED)
--   2. hopper_job_dead_letters     — explicit application-level dead-letter ledger
--   3. hopper_webhook_deliveries   — GitHub/Stripe webhook replay deduplication
--   4. hopper_rate_limits          — fixed-window tenant rate limiting
--   5. hopper_diagnosis_locks      — matrix-burst mutual exclusion with expiry
--   6. hopper_processed_events     — business-level consumer idempotency
--
-- Every statement is idempotent and forward-only.

-- ==============================================================================
-- 1. Durable job queue
-- ==============================================================================
CREATE TABLE IF NOT EXISTS hopper_job_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_name      TEXT NOT NULL DEFAULT 'ci-events',
  job_type        TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead')),
  priority        INTEGER NOT NULL DEFAULT 0,
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 5,
  available_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at       TIMESTAMPTZ,
  locked_by       TEXT,
  lock_expires_at TIMESTAMPTZ,
  last_error      TEXT,
  result          JSONB,
  org_login       TEXT,
  repo_full_name  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  CONSTRAINT uq_hopper_job_queue_idempotency UNIQUE (queue_name, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_hopper_job_queue_ready
  ON hopper_job_queue (queue_name, priority DESC, available_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_hopper_job_queue_lock_expiry
  ON hopper_job_queue (lock_expires_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_hopper_job_queue_status
  ON hopper_job_queue (status, updated_at DESC);

-- ==============================================================================
-- 2. Explicit dead-letter ledger (Vercel Queues has no built-in DLQ)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS hopper_job_dead_letters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID,
  queue_name      TEXT NOT NULL,
  job_type        TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload         JSONB NOT NULL,
  org_login       TEXT,
  repo_full_name  TEXT,
  attempts        INTEGER NOT NULL,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hopper_job_dead_letters_created
  ON hopper_job_dead_letters (created_at DESC);

-- ==============================================================================
-- 3. Webhook delivery claims (24h replay window)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS hopper_webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,
  source      TEXT NOT NULL DEFAULT 'github',
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hopper_webhook_deliveries_received
  ON hopper_webhook_deliveries (received_at);

-- ==============================================================================
-- 4. Tenant rate limiting (fixed window, atomic)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS hopper_rate_limits (
  tenant_key   TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_seconds INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_hopper_rate_limits_window
  ON hopper_rate_limits (window_start);

-- ==============================================================================
-- 5. Diagnosis locks (matrix-burst mutual exclusion)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS hopper_diagnosis_locks (
  lock_key    TEXT PRIMARY KEY,
  token       TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hopper_diagnosis_locks_expiry
  ON hopper_diagnosis_locks (expires_at);

-- ==============================================================================
-- 6. Consumer idempotency ledger
-- ==============================================================================
CREATE TABLE IF NOT EXISTS hopper_processed_events (
  event_key    TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result       JSONB
);

CREATE INDEX IF NOT EXISTS idx_hopper_processed_events_processed
  ON hopper_processed_events (processed_at);

-- ==============================================================================
-- 7. Atomic functions
-- ==============================================================================

-- Claim a batch of ready jobs for a worker. Locks rows without blocking peers.
CREATE OR REPLACE FUNCTION hopper_claim_jobs(
  p_queue_name    TEXT,
  p_limit         INTEGER,
  p_worker_id     TEXT,
  p_lock_seconds  INTEGER DEFAULT 300
)
RETURNS SETOF hopper_job_queue
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT id
    FROM hopper_job_queue
    WHERE queue_name = p_queue_name
      AND status IN ('pending', 'failed')
      AND available_at <= NOW()
      AND attempts < max_attempts
    ORDER BY priority DESC, available_at ASC
    LIMIT GREATEST(1, LEAST(p_limit, 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE hopper_job_queue j
  SET status          = 'processing',
      attempts        = j.attempts + 1,
      locked_at       = NOW(),
      locked_by       = p_worker_id,
      lock_expires_at = NOW() + make_interval(secs => GREATEST(30, p_lock_seconds)),
      updated_at      = NOW()
  FROM claimable c
  WHERE j.id = c.id
  RETURNING j.*;
END;
$$;

-- Return expired in-flight jobs to the queue so a crashed consumer cannot lose work.
CREATE OR REPLACE FUNCTION hopper_reap_expired_job_locks(p_limit INTEGER DEFAULT 100)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  reaped INTEGER;
BEGIN
  WITH expired AS (
    SELECT id FROM hopper_job_queue
    WHERE status = 'processing'
      AND lock_expires_at IS NOT NULL
      AND lock_expires_at < NOW()
    ORDER BY lock_expires_at ASC
    LIMIT GREATEST(1, LEAST(p_limit, 500))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE hopper_job_queue j
  SET status          = CASE WHEN j.attempts >= j.max_attempts THEN 'dead' ELSE 'failed' END,
      locked_at       = NULL,
      locked_by       = NULL,
      lock_expires_at = NULL,
      last_error      = COALESCE(j.last_error, 'lock expired: consumer did not complete the job'),
      available_at    = NOW(),
      updated_at      = NOW()
  FROM expired e
  WHERE j.id = e.id;

  GET DIAGNOSTICS reaped = ROW_COUNT;
  RETURN reaped;
END;
$$;

-- Atomically claim a webhook delivery ID. Returns TRUE when this caller owns it.
CREATE OR REPLACE FUNCTION hopper_claim_webhook_delivery(
  p_delivery_id TEXT,
  p_source      TEXT DEFAULT 'github'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  inserted INTEGER;
BEGIN
  INSERT INTO hopper_webhook_deliveries (delivery_id, source)
  VALUES (p_delivery_id, p_source)
  ON CONFLICT (delivery_id) DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted > 0;
END;
$$;

-- Atomically consume one unit of a tenant's fixed-window rate limit.
CREATE OR REPLACE FUNCTION hopper_consume_rate_limit(
  p_tenant_key     TEXT,
  p_max_requests   INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, current_count INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  v_window TIMESTAMPTZ;
  v_count  INTEGER;
BEGIN
  v_window := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / GREATEST(p_window_seconds, 1)) * GREATEST(p_window_seconds, 1)
  );

  INSERT INTO hopper_rate_limits (tenant_key, window_start, window_seconds, count)
  VALUES (p_tenant_key, v_window, p_window_seconds, 1)
  ON CONFLICT (tenant_key, window_start)
  DO UPDATE SET count = hopper_rate_limits.count + 1
  RETURNING count INTO v_count;

  RETURN QUERY SELECT
    v_count <= p_max_requests,
    GREATEST(0, p_max_requests - v_count),
    v_count;
END;
$$;

-- Acquire a time-bounded lock; succeeds when free or expired.
CREATE OR REPLACE FUNCTION hopper_acquire_diagnosis_lock(
  p_lock_key   TEXT,
  p_token      TEXT,
  p_ttl_seconds INTEGER DEFAULT 45
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  acquired BOOLEAN := FALSE;
BEGIN
  INSERT INTO hopper_diagnosis_locks (lock_key, token, expires_at)
  VALUES (p_lock_key, p_token, NOW() + make_interval(secs => GREATEST(5, p_ttl_seconds)))
  ON CONFLICT (lock_key) DO UPDATE
    SET token = EXCLUDED.token,
        acquired_at = NOW(),
        expires_at = EXCLUDED.expires_at
    WHERE hopper_diagnosis_locks.expires_at < NOW()
  RETURNING TRUE INTO acquired;

  RETURN COALESCE(acquired, FALSE);
END;
$$;

-- Release a lock only when the caller still owns the token.
CREATE OR REPLACE FUNCTION hopper_release_diagnosis_lock(
  p_lock_key TEXT,
  p_token    TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  deleted INTEGER;
BEGIN
  DELETE FROM hopper_diagnosis_locks
  WHERE lock_key = p_lock_key AND token = p_token;

  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted > 0;
END;
$$;

-- Claim a business event exactly once.
CREATE OR REPLACE FUNCTION hopper_claim_processed_event(p_event_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  inserted INTEGER;
BEGIN
  INSERT INTO hopper_processed_events (event_key)
  VALUES (p_event_key)
  ON CONFLICT (event_key) DO NOTHING;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted > 0;
END;
$$;

-- Release a failed attempt's idempotency claim so the retry can run.
CREATE OR REPLACE FUNCTION hopper_release_processed_event(p_event_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  deleted INTEGER;
BEGIN
  DELETE FROM hopper_processed_events WHERE event_key = p_event_key;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted > 0;
END;
$$;

-- Housekeeping: prune expired coordination rows.
CREATE OR REPLACE FUNCTION hopper_prune_queue_coordination(p_retention_hours INTEGER DEFAULT 24)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  total INTEGER := 0;
  affected INTEGER;
BEGIN
  DELETE FROM hopper_webhook_deliveries
  WHERE received_at < NOW() - make_interval(hours => GREATEST(1, p_retention_hours));
  GET DIAGNOSTICS affected = ROW_COUNT; total := total + affected;

  DELETE FROM hopper_rate_limits
  WHERE window_start < NOW() - make_interval(hours => GREATEST(1, p_retention_hours));
  GET DIAGNOSTICS affected = ROW_COUNT; total := total + affected;

  DELETE FROM hopper_diagnosis_locks WHERE expires_at < NOW();
  GET DIAGNOSTICS affected = ROW_COUNT; total := total + affected;

  RETURN total;
END;
$$;

-- ==============================================================================
-- 8. Privileges for the unprivileged runtime role (created in 0008)
-- ==============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hopper_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON hopper_job_queue TO hopper_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hopper_job_dead_letters TO hopper_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hopper_webhook_deliveries TO hopper_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hopper_rate_limits TO hopper_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hopper_diagnosis_locks TO hopper_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON hopper_processed_events TO hopper_app;
    GRANT EXECUTE ON FUNCTION hopper_claim_jobs(TEXT, INTEGER, TEXT, INTEGER) TO hopper_app;
    GRANT EXECUTE ON FUNCTION hopper_reap_expired_job_locks(INTEGER) TO hopper_app;
    GRANT EXECUTE ON FUNCTION hopper_claim_webhook_delivery(TEXT, TEXT) TO hopper_app;
    GRANT EXECUTE ON FUNCTION hopper_consume_rate_limit(TEXT, INTEGER, INTEGER) TO hopper_app;
    GRANT EXECUTE ON FUNCTION hopper_acquire_diagnosis_lock(TEXT, TEXT, INTEGER) TO hopper_app;
    GRANT EXECUTE ON FUNCTION hopper_release_diagnosis_lock(TEXT, TEXT) TO hopper_app;
    GRANT EXECUTE ON FUNCTION hopper_claim_processed_event(TEXT) TO hopper_app;
    GRANT EXECUTE ON FUNCTION hopper_release_processed_event(TEXT) TO hopper_app;
    GRANT EXECUTE ON FUNCTION hopper_prune_queue_coordination(INTEGER) TO hopper_app;
  END IF;
END $$;
