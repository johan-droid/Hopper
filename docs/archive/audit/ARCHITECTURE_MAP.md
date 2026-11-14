# Phase 0 — Architecture Map

## Overview

Hopper's architecture consists of a backend Express API gateway, BullMQ queue, PostgreSQL+pgvector database, Redis, and a React frontend. The core workflow processes GitHub webhook events through background workers to generate failure fingerprints, flakiness scores, and LLM-powered diagnoses.

## Data Flow

1. GitHub Actions sends workflow_run or workflow_job webhook to Express API
2. HMAC-SHA256 signature verification validates the webhook authenticity
3. Rate limiting checks per-tenant Redis limits
4. Event payload is enqueued to BullMQ ci-events queue
5. Worker process fetches and slices the failed job log
6. Stack trace is normalized and fingerprinted via SHA-256 hash
7. Fingerprint is looked up in PostgreSQL + pgvector for matching signatures
8. Flakiness score is computed using Bayesian analysis
9. LLM diagnosis is generated (Anthropic/OpenAI or deterministic fallback)
10. Results are persisted to database and sticky PR comment is posted

## Key Components

- Express API Gateway: Entry point for all HTTP requests and webhooks
- BullMQ Queue: Background job processing pipeline
- PostgreSQL + pgvector: Persistent storage with vector similarity search
- Redis: Rate limiting, delivery deduplication, diagnosis locking
- GitHub App: Installation token management, scoped API access
- Stripe Billing: Checkout session management, webhook signature verification
- AI Diagnosis Engine: Anthropic/OpenAI LLM with deterministic fallback
- Flakiness Engine: Bayesian scoring for flakiness probability

## API Endpoints Summary

| Endpoint | Protection | Purpose |
|---|---|---|
| GET /api/health | None | Health check |
| POST /a/webhooks/github | HMAC signature | GitHub webhook ingress |
| GET /api/repositories/:repoId/failures | Workspace | Failure history |
| GET /api/signatures | Workspace | Signature listing |
| POST /api/diagnose | Workspace | Trigger diagnosis |
| GET /api/billing/plan | Workspace | Plan & quota status |
| POST /api/checkout/session | Workspace | Create Stripe checkout |
| POST /api/webhooks/stripe | None | Stripe webhook verification |

## Tenant Isolation

All database queries must scope results by organization ID (org_id). Currently, no Row-Level Security policies are enforced in the database, relying on application-level authorization instead.

## Known Issues

- No Row-Level Security policies on database tables
- Redis rate limiter fails open when Redis is unavailable
- No standalone worker entrypoint (worker must be started manually)
- No frontend application shell (dashboard served as JSON only)
- No Supabase Auth integration
- No workspace membership authorization