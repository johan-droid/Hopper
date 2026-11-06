# Hopper — Production Readiness Assessment & Deployment Runbook

**Auditor:** Independent Production Reliability & DevOps Lead  
**Date:** 2026-11-06  
**Status:** **VERIFIED WITH LIMITATIONS**  

---

## 1. Overall Readiness Verdict: VERIFIED WITH LIMITATIONS

Hopper has completed all core functional, cryptographic, and architectural hardening milestones. The system is verified stable and secure for private staging and initial beta deployments. 

**Prerequisites for Full General Availability (GA):**
1. Connect production Supabase project with non-mock `SUPABASE_JWT_SECRET` or JWKS public key.
2. Complete end-to-end Stripe webhook validation in live Stripe test mode.
3. Configure GitHub App webhook secret and private key in deployment orchestrator (e.g. Kubernetes Secrets, Railway, or AWS Secrets Manager).

---

## 2. Production Security & Configuration Audit

| Security Domain | Production Standard | Audit Verification | Status |
|---|---|---|:---:|
| **OWASP Security Headers** | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 0`, `Strict-Transport-Security` | Implemented in `backend/src/server/middleware/security.ts` | **PASS** |
| **CORS Origins** | Explicit whitelist; disallow wildcards in production | Read from `CORS_ALLOWED_ORIGINS` with strict origin reflection | **PASS** |
| **Credential Scrubbing** | Zero plain-text tokens or keys stored or transmitted | Slices and redacts AWS, JWT, PEM, Bearer, DB URIs | **PASS** |
| **Timing Attack Mitigation** | `crypto.timingSafeEqual` on all HMAC & JWT checks | Implemented in `app-auth.ts`, `stripe-handler.ts`, and `auth.ts` | **PASS** |
| **Error Masking** | No internal stack traces leaked in HTTP responses | Centralized in `error-handler.ts`; masked when `NODE_ENV=production` | **PASS** |
| **Database Isolation** | Row-Level Security enabled on all user/tenant tables | Migration 0006 `SECURITY DEFINER` policies applied and verified | **PASS** |

---

## 3. Environment Variable Completeness Checklist

The following environment variables are mandatory for production deployment:

```bash
# Server & Network
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://app.hopper.io
CORS_ALLOWED_ORIGINS=https://app.hopper.io

# PostgreSQL & Redis
DATABASE_URL=postgresql://user:password@db.supabase.co:5432/postgres?sslmode=require
DIRECT_URL=postgresql://user:password@db.supabase.co:5432/postgres?sslmode=require
REDIS_URL=rediss://default:password@redis.upstash.io:6379

# Supabase Auth
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_JWT_SECRET=<32-char-supabase-jwt-secret>

# GitHub App Integration
GITHUB_APP_ID=1029384
GITHUB_APP_CLIENT_ID=<gh-client-id>
GITHUB_APP_CLIENT_SECRET=<gh-client-secret>
GITHUB_APP_WEBHOOK_SECRET=<gh-webhook-secret>
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."

# AI Providers
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-proj-...

# Stripe Billing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_PRO_DEV_9=price_...
STRIPE_PRICE_ID_TEAM_29=price_...
```

---

## 4. Container Deployment & Health Probes

- **Docker Base:** Alpine / Debian-slim multi-stage build (`backend/Dockerfile`).
- **Liveness Probe:** `GET /api/health` (HTTP 200).
- **Readiness Probe:** `GET /api/health` (Checks `dependencies.database.isHealthy === true` and `dependencies.redis.isHealthy === true`).
- **Termination Grace Period:** 30 seconds (allows BullMQ worker to drain active log processing jobs).

