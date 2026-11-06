# Hopper — API & Event Contracts Specification

**Document Status:** Approved Architecture Baseline (Phase A)  
**Author:** Principal Systems Architect & Lead Software Engineer  
**Date:** November 6, 2026  
**Target Repository:** [`/home/ashutoshsahoo/Downloads/Hopper`](file:///home/ashutoshsahoo/Downloads/Hopper)

---

## 1. HTTP REST API Contracts

### 1.1 Ingress & Operational Endpoints

#### `GET /api/health`
- **Description:** Deep service health check querying database connection pool, pgvector availability, and Redis ping.
- **Authorization:** Public / Monitoring.
- **Response Contract (200 OK):**
```json
{
  "status": "healthy",
  "service": "hopper-api-gateway",
  "version": "1.0.0",
  "timestamp": "2026-11-06T14:30:00.000Z",
  "uptimeSeconds": 1420.5,
  "dependencies": {
    "database": {
      "status": "connected",
      "isHealthy": true,
      "poolTotal": 10,
      "poolIdle": 8,
      "latencyMs": 2.4,
      "pgVersion": "16.1",
      "hasPgvector": true
    },
    "redis": {
      "status": "connected",
      "isHealthy": true,
      "connected": true,
      "latencyMs": 0.8
    }
  }
}
```

---

### 1.2 Webhook Ingress Endpoints

#### `POST /api/webhooks/github`
- **Description:** High-velocity webhook ingestion from GitHub Actions runners (<50ms processing target).
- **Security:** HMAC-SHA256 signature verification via `X-Hub-Signature-256`.
- **Headers Required:**
  - `X-GitHub-Event: workflow_job`
  - `X-Hub-Signature-256: sha256=...`
  - `X-GitHub-Delivery: <guid>`
- **Behavior:**
  1. Validates HMAC against `process.env.GITHUB_APP_WEBHOOK_SECRET`.
  2. Checks Redis delivery claim for replay prevention (24-hour TTL).
  3. Enforces token-bucket rate limit (100 req/min/org).
  4. Dispatches event to BullMQ queue `ci-failure-intake`.
- **Response Contract:**
  - `202 Accepted`: `{ "status": "queued", "jobId": "wj_12345" }`
  - `200 OK`: `{ "status": "duplicate_ignored", "deliveryId": "..." }`
  - `401 Unauthorized`: `{ "error": "Invalid webhook signature" }`
  - `429 Too Many Requests`: `{ "error": "Rate limit exceeded" }`

#### `POST /api/webhooks/stripe` (Frozen Prototype)
- **Description:** Webhook ingress for subscription lifecycle (frozen prototype).
- **Security:** HMAC-SHA256 verification via `Stripe-Signature` header.
- **Status:** Inactive in production (returns `503 Service Unavailable` if secret is unconfigured).

---

### 1.3 Developer Diagnostic & Analysis Endpoints

#### `POST /api/diagnose/adhoc`
- **Description:** Ad-hoc failure diagnosis for developer CLI, local test runs, and diagnostic sandbox view.
- **Authorization:** Authenticated User or Local Dev.
- **Request Body Contract:**
```json
{
  "rawLog": "string (min 1 char, required)",
  "jobName": "string (optional, default: 'build')",
  "stepName": "string (optional, default: 'test')",
  "modifiedFiles": ["string"]
}
```
- **Response Contract (200 OK):**
```json
{
  "signatureHash": "sha256:7f8a91c20e149d8c3621980be103f6f1c4a921d7",
  "detectedFramework": "jest | vitest | playwright | unknown",
  "detectedExitCode": 1,
  "flakinessScore": 15.0,
  "diagnosis": {
    "error_category": "DEPENDENCY_RESOLUTION",
    "root_cause_clues": "Missing peer dependency @types/node required by package",
    "likely_flaky_test": {
      "is_likely_flaky": false,
      "test_name": null,
      "reasoning": "Deterministic failure during package installation"
    },
    "relevant_log_lines": [
      {
        "line_number": 42,
        "content": "npm ERR! ERESOLVE unable to resolve dependency tree",
        "explanation": "npm peer dependency resolution failure"
      }
    ],
    "suggested_next_check": "Inspect package.json peerDependencies and lockfile.",
    "local_repro_command": "npm install --legacy-peer-deps",
    "verification_steps": [
      "Run npm install locally",
      "Verify node_modules integrity"
    ],
    "uncertainty_warnings": []
  }
}
```

---

### 1.4 Dashboard & Signature Endpoints

#### `GET /api/dashboard/:orgSlug`
- **Description:** Retrieves organization failure overview, 30/90-day occurrence metrics, and the Flaky Test Leaderboard.
- **Authorization:** Workspace Member or Public (if organization is public).
- **Response Contract (200 OK):**
```json
{
  "orgSlug": "acme-corp",
  "plan": "team",
  "monthlyRunsLimit": 1000,
  "runsUsedThisPeriod": 240,
  "flakyTestLeaderboard": [
    {
      "rank": 1,
      "identifier": "tests/e2e/checkout.spec.ts › Checkout Flow › 3DS verification",
      "flakinessScore": 88.5,
      "occurrences30d": 14,
      "occurrences90d": 38,
      "sameShaRetryPasses": 4,
      "lastSeen": "2026-11-06T12:00:00.000Z",
      "sigId": "sig_7f8a91c20e14"
    }
  ]
}
```

#### `GET /api/signatures/:id`
- **Description:** Detailed cross-run timeline and historical occurrences for a specific failure signature.
- **Authorization:** Workspace Member.
- **Response Contract (200 OK):**
```json
{
  "id": "sig_7f8a91c20e14",
  "signatureHash": "sha256:7f8a91c2...",
  "normalizedTemplate": "Error: Timeout of 30000ms exceeded waiting for selector [data-testid=...]",
  "testIdentifier": "tests/e2e/checkout.spec.ts",
  "errorCategory": "TIMEOUT",
  "flakinessScore": 88.5,
  "totalOccurrences": 38,
  "mainBranchOccurrences": 5,
  "uniquePrsAffected": 12,
  "sameShaRetryPasses": 4,
  "cachedRootCause": "Selector timeout caused by delayed iframe hydration",
  "cachedNextCheck": "Inspect iframe loading event before querying DOM element",
  "firstSeenAt": "2026-08-15T09:12:00.000Z",
  "lastSeenAt": "2026-11-06T12:00:00.000Z",
  "crossRunTimeline": [
    {
      "githubRunId": 67890123,
      "githubJobId": 98765432,
      "workflowName": "CI",
      "jobName": "E2E Tests",
      "failedStepName": "npx playwright test",
      "commitSha": "8d2f1b4c9e",
      "branch": "feat/checkout-v2",
      "prNumber": 142,
      "exitCode": 1,
      "durationMs": 34200,
      "failedAt": "2026-11-06T12:00:00.000Z",
      "sanitizedLogSnippet": "Error: Timeout of 30000ms exceeded..."
    }
  ]
}
```

---

### 1.5 Workspace & Member Management Endpoints

Mounted via `backend/src/server/routes/workspaces.ts`:
- `GET /api/workspaces` — List workspaces for the authenticated user (Requires Bearer JWT).
- `POST /api/workspaces` — Create workspace (`{ name, type, description, isPublic }`).
- `GET /api/workspaces/:id` — Retrieve workspace details (checks membership or public visibility).
- `PATCH /api/workspaces/:id` — Update workspace (Requires `owner` or `admin` role).
- `DELETE /api/workspaces/:id` — Delete workspace (Requires `owner` role).
- `GET /api/workspaces/:id/members` — List members (Requires membership).
- `POST /api/workspaces/:id/members` — Add member (`{ userId, role }`, Requires `owner` or `admin`).
- `PATCH /api/workspaces/:id/members/:userId` — Update role (Requires `owner` or `admin`).
- `DELETE /api/workspaces/:id/members/:userId` — Remove member (Self or `owner`/`admin`).

---

## 2. Queue Event Contracts (BullMQ)

### Ingestion Event Payload: `WorkflowJobEventData`
Defined in [`backend/src/queue/types.ts`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/src/queue/types.ts):

```typescript
export interface WorkflowJobEventData {
  installationId: number;
  orgLogin: string;
  accountType: 'Organization' | 'User';
  githubRepoId: number;
  repoFullName: string;
  githubRunId: number;
  githubJobId: number;
  githubRunAttempt: number;
  workflowName: string;
  jobName: string;
  stepName: string;
  conclusion: 'failure' | 'success';
  commitSha: string;
  branch: string;
  prNumber?: number;
  actorLogin?: string;
  rawLog?: string;
  modifiedFiles?: string[];
  runUrl?: string;
}
```

---

## 3. Standardized Error Contract

All backend routes return structured JSON errors conforming to the RFC-7807 problem details specification via [`backend/src/server/middleware/error-handler.ts`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/src/server/middleware/error-handler.ts):

```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST | UNAUTHORIZED | FORBIDDEN | NOT_FOUND | RATE_LIMITED | INTERNAL_ERROR",
    "message": "Human-readable explanation of error",
    "details": {},
    "requestId": "req_8f1a2c3d4e5f"
  }
}
```

