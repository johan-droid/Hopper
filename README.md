# Hopper ⚡

## Next-Generation CI/CD Failure Diagnosis & SDLC Orchestrator

![Hopper Logo](https://raw.githubusercontent.com/johan-droid/Hopper/main/public/logo.png || https://hopper.dev/logo.png)

> **Named in honor of Rear Admiral Grace Hopper** — pioneer of compilers, programming languages, and discoverer of the first computer bug.

> **"Transform 50MB GitHub Actions logs into 4-part structured PR diagnoses in under 15 seconds."**

---

## 🏠 Overview

**Hopper** is a production-grade, self-hosted SaaS platform that transforms failed GitHub Actions builds into actionable, structured PR reports while building a cross-run failure-pattern "moat" using deterministic fingerprinting and Bayesian flakiness scoring.

| Feature | Free | Pro ($9/mo) | Team ($29/mo) |
|--------|------|-------------|---------------|
| **Monthly Runs** | 30 | 250 | 1,000 |
| **History Retention** | 24h | 30 Days | 90 Days |
| **Flaky Test Matrix** | ❌ Blurred | ✅ Full | ✅ Full |
| **Slack/Discord Alerts** | ❌ | ❌ | ✅ |
| **Auto-Retry Policy** | ❌ | ❌ | ✅ (>80% confidence) |
| **Stripe Billing** | ❌ | ✅ | ✅ |

## 🏗️ Architecture

```mermaid
graph TD
  subgraph "GitHub Cloud"
    GC[GitHub Actions]
  end
  
  subgraph "Hopper Backend"
    GW[Webhook Gateway (<50ms HMAC verification)]
    Q[BullMQ Queue]
    RW[Redis]
    DB[(PostgreSQL + pgvector)]
    AI[Anthropic / OpenAI]
  end
  
  subgraph "Hopper Frontend"
    DL[Dashboard UI]
    DP[PR Reporter]
    FL[Flaky Matrix]
  end
  
  GC -->|Webhook| GW
  GW --> Q
  Q --> RW
  RW --> DB
  DB --> AI
  AI -->|Diagnoses| DW
  DW --> PR
```

### Core Pipeline

1. **Webhook Ingress** — HMAC-SHA256 verified (<50ms), tenant rate-limited, dispatched to BullMQ
2. **Selective Log Streamer** — Bounded 300KB extraction, ANSI/runner noise strip, secret redaction
3. **Fingerprinting Engine** — SHA-256 normalized trace normalization (UUIDs, UUIDs, line/column nums, durations, ports → deterministic)
4. **Flakiness Engine** — Bayesian scoring: same-SHA retry passes, cross-PR spread, default branch frequency, transient patterns
5. **LLM Diagnosis** — Structured JSON output via Anthropic/Claude or OpenAI with Zod schema validation
6. **PR Sticky Comment** — Single source-of-truth comment with paywall-gated historical insights

---

## 📦 Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 16+ with `pgvector` extension
- Redis (Redis Cloud or self-hosted)
- Stripe account (for Pro/Team tiers)
- GitHub OAuth App (register at github.github.com/developers/settings/applications/new)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/johan-droid/Hopper.git
cd Hopper

# 2. Install dependencies
npm install

# 3. Environment configuration
cp .env.example .env
# Edit .env with your values (see .env.example for full schema)

# 3. Database setup
npx tsx src/cli/hopper.ts migrate

# 4. Start the server
npm run build
npm run start
# or: npx tsx src/server/index.ts
```

### CLI Usage

```bash
# View available commands
npx tsx src/cli/hopper.ts --help

# Run the full SDLC lifecycle in one command
npx tsx src/cli/hopper.ts lifecycle

# Run system doctor & environment preflight
npx tsx src/cli/hopper.ts doctor

# Simulate failure diagnosis on raw CI logs
npx tsx src/cli/hopper.ts simulate --scenario jest

# Start the webhook gateway & REST API server
npx tsx src/cli/hopper.ts serve --port 3000
```

### Docker

```bash
docker build -t hopper/ci .
docker run -p 3000:3000 -e .env hopper/ci
```

---

## 📁 Project Structure

```
Hopper/
├── src/
│   ├── index.ts                      # Public library API export
│   ├── cli/                          # CLI commands (lifecycle, doctor, simulate, serve)
│   ├── server/                       # Webhook Gateway & REST API
│   │   └── index.ts                  # HMAC verification + BullMQ dispatcher
│   ├── lib/
│   │   ├── parser/                   # Log slicing, scrubbing, fingerprinting
│   │   │   ├── ansi-stripper.ts
│   │   │   ├── secret-scrubber.ts
│   │   │   ├── log-slicer.ts
│   │   │   └── fingerprinter.ts
│   │   ├── moat/                     # Bayesian flakiness scoring
│   │   │   └── flakiness-engine.ts
│   │   ├── ai/                       # LLM diagnosis engine
│   │   │   └── diagnose.ts
│   │   ├── billing/                  # Stripe integration & quota guards
│   │   │   └── stripe-handler.ts
│   │   ├── queue/                    # BullMQ configuration
│   │   │   ├── ci-queue.ts
│   │   │   ├── index.ts
│   │   │   └── redis.ts
│   │   └── types.ts                  # Shared TypeScript types
│   └── db/
│       ├── client.ts                 # PostgreSQL + pgvector pool
│       ├── index.ts                  # DB exports
│       ├── migrator.ts               # Migration runner
│       ├── repositories/             # Repository pattern implementations
│       │   ├── organization.repository.ts
│       │   ├── repository.repository.ts
│       │   ├── failure-signature.repository.ts
│       │   ├── workflow-failure.repository.ts
│       │   └── diagnostic-report.repository.ts
│       └── queries/                  # SQL query modules
│           └── organizations.ts
│   └── workers/                      # BullMQ workers
│       ├── index.ts
│       └── processors/
│           ├── workflow-job.processor.ts
│           └── slack-alert.processor.ts
├── supabase/
│   └── migrations/
│       └── 0001_initial_schema.sql
├── bin/
│   └── hopper.js                     # CLI entrypoint
├── tests/
│   ├── parser.test.ts
│   ├── scrubber.test.ts
│   ├── fingerprint.test.ts
│   ├── flakiness.test.ts
│   ├── ai.test.ts
│   ├── pr-reporter.test.ts
│   ├── quota-guard.test.ts
│   ├── github-integration.test.ts
│   ├── webhook.test.ts
│   ├── repositories.test.ts
│   ├── embeddings.test.ts
│   └── backend-smoke.test.ts
├── Dockerfile
├── package.json
├── tsconfig.json
├── tsup.config.json
├── LIFECYCLE_REPORT.md
└── README.md
```

---

## 🛠️ API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `GET /api/health` | GET | None | Health check (API, PostgreSQL, Redis) |
| `POST /api/webhooks/github` | POST | HMAC-SHA256 | GitHub webhook ingress |
| `GET /api/dashboard/:orgSlug` | GET | None | Live dashboard (leaderboard, quota, flakiness) |
| `GET /api/signatures/:id` | GET | None | Cross-run timeline & historical occurrences |
| `GET /api/repositories/:repoId/failures` | GET | None | Failure history feed |
| `POST /api/billing/checkout` | POST | Stripe | Checkout session creation |

---

## 🛡️ Security Architecture

### Webhook Security
- **HMAC-SHA256 verification** with `crypto.timingSafeEqual` (constant-time comparison)
- **Delivery ID deduplication** via Redis (24h TTL)
- **Raw body consumption** before JSON parsing

### Database Security
- **Row Level Security (RLS)** enabled on all tables
- **Organization isolation** via `organization_id` mapping
- **Service role key** never exposed to frontend

### Secret Management
- **Secret scrubber** with 10+ regex patterns (AWS keys, GitHub tokens, DB URIs, Bearer tokens, private keys)
- **`<UNTRUSTED_CI_LOG>` wrapping** for LLM prompt injection prevention
- **No secret logging** in production

---

## 📊 Pricing Tiers

| Tier | Monthly Price | Runs/mo | History | Flaky Matrix | Slack/Discord | Auto-Retry |
|--------|---------------|---------|---------|------------|--------------|------------|
| **Free** | $0 | 30 | 24h | Blurred teaser | No | No |
| **Pro Developer** | $9/mo | 250 | 30 Days | Full | No | No |
| **Small Team** | $29/mo | 1,000 | 90 Days | Full | Yes (Slack/Discord) | >80% confidence |

### Stripe Price IDs
- `price_pro_dev_9` — $9/mo Pro Developer
- `price_team_29` — $29/mo Small Team

---

## 🔒 Security Audit Summary

| Vulnerability | Status | Remediation |
|--------------|--------|-------------|
| Prompt Injection via CI Logs | ✅ Mitigated | `<UNTRUSTED_CI_LOG>` wrapping + Zod schema validation |
| ReDoS in Secret Scrubber | ✅ Mitigated | Byte-capped slicing (300KB), expanded regex patterns |
| Webhook Replay/Forgery | ✅ Mitigated | `crypto.timingSafeEqual` + Redis delivery ID deduplication |
| RLS Gaps in Supabase | ✅ Mitigated | Row Level Security + organization member mapping |
| SSRF/OOM in Log Fetcher | ✅ Mitigated | 300KB byte cap + 15s timeout + URL validation |

---

## 📜 License

Licensed under the **Apache License, Version 2.0** — see the `LICENSE` file for details.

---

## 📞 Contact & Support

- **GitHub Issues**: https://github.com/johan-droid/Hopper/issues
- **Documentation**: https://docs.hopper.dev
- **Security Reports**: security@hopper.dev
- **Slack Community**: https://hopper.dev/slack

---

**⚡ Hopper — Transform failing CI into actionable intelligence in under 15 seconds.**

---
*Generated with ⚡ for the modern CI/CD engineer.*
