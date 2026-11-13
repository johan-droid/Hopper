# Hopper — GitHub API Rate Limiting & Request Scheduling Design

**Document:** GitHub Rate Limit Architecture, Scheduling & Multi-Worker Coordination  
**Author:** Principal Site Reliability Engineer & Integration Architect  
**Repository:** `johan-droid/Hopper`  
**Date:** November 14, 2026  
**Status:** Approved Specification  

---

## 1. Problem Statement

GitHub enforces two distinct layers of rate limiting:
1. **Primary Rate Limits:**
   - 5,000 requests per hour per authenticated installation.
   - Separate quotas for resources: `core`, `search`, `graphql`, `actions`.
   - Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Used`, `X-RateLimit-Reset`, `X-RateLimit-Resource`.
2. **Secondary Rate Limits (Abuse Detection & Throttling):**
   - Triggered by concurrent requests, rapid bursts, CPU-intensive requests, or repeated identical calls.
   - Signals: HTTP 403 with `message` containing "secondary rate limit" or "abuse detection", or HTTP 429.
   - Guidance: `Retry-After` header specifying cooldown in seconds.

In a horizontally scaled environment with multiple concurrent worker threads and serverless functions, in-memory counters fail: workers would independently exhaust quotas or trigger secondary limits simultaneously.

---

## 2. Distributed Database-Backed Coordination

Hopper utilizes a dedicated PostgreSQL table `github_api_rate_limits` to synchronize rate-limit state across all worker processes.

### 2.1 Table Schema
```sql
CREATE TABLE IF NOT EXISTS github_api_rate_limits (
  installation_id BIGINT NOT NULL,
  resource TEXT NOT NULL DEFAULT 'core',
  limit_count INT NOT NULL DEFAULT 5000,
  remaining INT NOT NULL DEFAULT 5000,
  reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour',
  used INT NOT NULL DEFAULT 0,
  secondary_cooldown_until TIMESTAMPTZ,
  consecutive_403_429 INT NOT NULL DEFAULT 0,
  last_request_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_response_status INT,
  PRIMARY KEY (installation_id, resource)
);
```

### 2.2 Atomic Pre-Flight Admission
Before dispatching any GitHub API request for an installation and resource:
1. Lock or query the rate-limit row for `(installation_id, resource)`.
2. **Secondary Cooldown Check:** If `secondary_cooldown_until > NOW()`, reject or defer the request immediately.
3. **Primary Quota Check:**
   - If `reset_at <= NOW()`, the limit has reset; replenish `remaining = limit_count` and set `reset_at = NOW() + INTERVAL '1 hour'`.
   - If `remaining <= 0`, defer request until `reset_at`.
   - If `remaining > 0`, decrement `remaining` and record `last_request_at`.

### 2.3 Post-Response Header Synchronization
Upon receiving any GitHub API response:
1. Extract `X-RateLimit-*` headers:
   * `limit`: parsed from `x-ratelimit-limit`
   * `remaining`: parsed from `x-ratelimit-remaining`
   * `reset`: unix epoch parsed from `x-ratelimit-reset`
   * `resource`: parsed from `x-ratelimit-resource` (defaulting to requested category)
2. Update `github_api_rate_limits` atomically:
   ```sql
   INSERT INTO github_api_rate_limits (
     installation_id, resource, limit_count, remaining, reset_at, last_response_status, last_request_at
   ) VALUES ($1, $2, $3, $4, to_timestamp($5), $6, NOW())
   ON CONFLICT (installation_id, resource) DO UPDATE SET
     limit_count = EXCLUDED.limit_count,
     remaining = EXCLUDED.remaining,
     reset_at = EXCLUDED.reset_at,
     last_response_status = EXCLUDED.last_response_status,
     last_request_at = NOW();
   ```

### 2.4 Secondary Throttling Handling (HTTP 403 / 429)
If the response returns HTTP 429 or HTTP 403 with secondary rate-limit error messages:
1. Parse `Retry-After` header (in seconds).
2. If `Retry-After` is missing, calculate exponential backoff cooldown:
   $$\text{cooldownSeconds} = \min(300, 30 \times 2^{\text{consecutive\_403\_429}})$$
3. Set `secondary_cooldown_until = NOW() + INTERVAL '...'` in the database.
4. All workers sharing that installation ID will automatically pause requests for the duration of the cooldown.

---

## 3. Request Prioritization Model

When remaining quota is constrained ($\text{remaining} < 100$), Hopper prioritizes critical paths:

| Priority Level | Operation Types | Admitted When |
|---|---|---|
| **Tier 1 (Critical)** | Job log retrieval, initial failure ingestion | `remaining > 5` |
| **Tier 2 (High)** | Sticky PR comment creation, Check Run annotations | `remaining > 20` |
| **Tier 3 (Medium)** | Workflow rerun triggers | `remaining > 50` |
| **Tier 4 (Low)** | Repository synchronization, user profile refresh | `remaining > 200` |

---

## 4. Bounded Exponential Backoff & Jitter

When retrying transient network errors (HTTP 500, 502, 503, 504, `ECONNRESET`, `ETIMEDOUT`):
$$\text{delay} = \min\left(\text{maxDelayMs}, \text{initialDelayMs} \times 2^{\text{attempt}} + \text{randomJitterMs}\right)$$
* Maximum retry attempts: 3.
* Never retry non-retryable 4xx client errors (400, 401, 404, 422).

