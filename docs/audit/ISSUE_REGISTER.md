# Phase 0 — Issue Register

## Priority 1: Critical (Must Fix Before Production)

| ID | Severity | Component | Description | Root Cause | Fix | Verification | Status |
|---|---|---|---|---|---|---|---|
| ISSUE-001 | High | Authentication | No Supabase Auth integration — no real user authentication | Authentication not implemented | Integrate Supabase Auth with email/password, login, logout, session management | Test: login, registration, logout invalidates access, session restoration | OPEN |
| ISSUE-002 | High | Authorization | No workspace membership enforcement — any user can access any workspace endpoint | No authorization logic in backend routes | Implement backend middleware: authenticate user → check workspace membership → check role permissions | Test: User A cannot access User B's workspace, role escalation tested | OPEN |
| ISSUE-003 | High | Tenant Isolation | No Row-Level Security (RLS) on database tables | RLS not implemented in PostgreSQL | Add RLS policies on organizations, repositories, failure_signatures, workflow_failures, diagnostic_reports | Test: Cross-tenant access denied, own tenant access allowed | OPEN |
| ISSUE-004 | High | Worker Entrypoint | No standalone worker — `startWorkers()` exported but no npm script or docker-compose service starts it | Worker startup not configured | Add worker startup script to package.json and docker-compose.yml; ensure worker process runs independently | Test: Worker starts, processes jobs, health check endpoint | OPEN |
| ISSUE-005 | Medium | Frontend Shell | No authenticated application shell — dashboard served as JSON only, no UI | Frontend is stubbed, no app shell | Build complete React application with sidebar, workspace selector, navigation, protected routes | Test: Login → dashboard loads, logout → protected routes redirect | OPEN |

## Priority 2: Important (Should Fix)

| ID | Severity | Component | Description | Root Cause | Fix | Verification | Status |
|---|---|---|---|---|---|---|---|
| ISSUE-006 | Medium | Billing Verification | Stripe integration skeleton not verified end-to-end | Billing logic exists but no live/test payment flow verified | Run end-to-end Stripe test mode: checkout, webhook, subscription, entitlement check | Test: Complete checkout flow, verify entitlements update | OPEN |
| ISSUE-007 | Medium | Test Coverage | No integration tests for end-to-end workflows | Tests are unit-only, no E2E coverage | Write integration tests for: webhook → worker → diagnosis → PR comment flow; billing webhook flow | Test: Automated test suite covers critical paths | OPEN |
| ISSUE-008 | Medium | Security Headers | No security headers (CSP, HSTS, X-Frame-Options) on API responses | Security headers not configured | Add security middleware (helmet.js, custom CSP) to Express app | Test: Security scan confirms headers present | OPEN |
| ISSUE-009 | Medium | Error Handling | Inconsistent error response formats across endpoints | Error handling not standardized | Define consistent error format (status, message, error, timestamp, correlation ID) and apply to all routes | Test: All endpoints return consistent error format | OPEN |
| ISSUE-010 | Medium | Rate Limit Fail-Open | Redis rate limiter fails open when Redis unavailable — could allow webhook replay | Fail-open design to avoid dropping webhooks | Add circuit breaker pattern; log warning when rate limit falls back; consider rate-limited fallback | Test: Simulate Redis failure, verify behavior | OPEN |

## Priority 3: Nice to Have

| ID | Severity | Component | Description | Root Cause | Fix | Verification | Status |
|---|---|---|---|---|---|---|---|
| ISSUE-011 | Low | Documentation | Phase 0 audit documents the current state but does not cover future development roadmap | Documentation was audit-focused | Add roadmap section to SPEC.md; create implementation plan with priorities and timelines | Review: Roadmap aligns with product vision | OPEN |
| ISSUE-012 | Low | LICENSE File | No LICENSE file in repository; Apache-2.0 declared in package.json but text not present | License file not created | Add LICENSE file with Apache-2.0 text | Check: LICENSE file exists at repo root | OPEN |
| ISSUE-013 | Low | Frontend Responsiveness | Tailwind config exists but layout components not fully responsive | Responsive design not prioritized | Make all layout components responsive using Tailwind breakpoints | Test: Browser resize confirms responsive behavior | OPEN |
| ISSUE-014 | Low | Error Logging | Structured logging not consistent across all modules | Logging approach not standardized | Add structured Winston/Winston-free logging with correlation IDs and request context | Test: Logs contain correlation IDs, request context | OPEN |
| ISSUE-015 | Low | API Versioning | No API versioning in routes | Routes not versioned | Add API version prefix (/api/v1/) and plan for backward-compatible updates | Test: v1 routes work, deprecation plan documented | OPEN |