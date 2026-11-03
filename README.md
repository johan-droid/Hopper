# Hopper (⚡)

> **Next-Generation CI/CD Failure Diagnosis Engine & Unified SDLC Lifecycle Runner**  
> *Named in honor of Rear Admiral Grace Hopper — pioneer of compilers, programming languages, and discoverer of the first computer bug.*

---

## 1. Overview

**Hopper** is a production-grade CI/CD failure diagnosis platform designed to solve slow, noisy, and flaky test pipelines for modern engineering teams. 

Instead of forcing developers to spend 20 minutes scrolling through 100MB+ raw GitHub Actions logs, Hopper:
1. **Ingests Webhook Events:** Validates HMAC-SHA256 signatures in under 50ms.
2. **Slices & Scrubs Logs:** Employs an $O(1)$ memory/CPU sliding window to extract only the 15–45 line critical failure context while scrubbing tokens, AWS keys, JWTs, DB URIs, and private keys.
3. **Fingerprints the Cloud Moat:** Normalizes dynamic tokens (UUIDs, line/column numbers, memory addresses, durations) and computes deterministic SHA-256 signatures.
4. **Calculates Flakiness Probabilities:** Uses Bayesian heuristics (same-SHA retry passes, cross-PR spread, default branch failures, and transient regex patterns) to output a 0–100% flakiness score.
5. **Synthesizes Structured AI Diagnosis:** Enforces strict JSON schemas (Root-Cause Clues, Flaky Test Assessment, Relevant Log Lines, and Local Repro Command) correlated directly against commit file diffs.
6. **Posts Sticky PR Comments:** Maintains a single sticky PR comment per branch with built-in paywall conversion hooks for cross-run historical failure insights.
7. **Brings Up the Entire Build Lifecycle into One:** Coordinates preflight checks, spec verification, schema migration, static typing, automated testing, production bundling, end-to-end simulation, and container orchestration into a single command (`npm run lifecycle`).

---

## 2. The Unified Lifecycle Runner

To eliminate fragmented build steps, Hopper unifies the entire software development lifecycle into a single orchestrated runner:

```bash
# Execute the entire project build lifecycle end-to-end in one command:
npm run lifecycle
```

### The 8 SDLC Stages Executed in Sequence:
```text
================================================================================
  HOPPER: UNIFIED SOFTWARE BUILD & SDLC LIFECYCLE ENGINE
  "Bringing the entire life cycle of project building into one"
================================================================================

  [1/8] System Doctor & Environment Preflight.......... ✔ PASSED (12ms)
      └─ Node v24.22.1 | Platform: linux | Env config verified
  [2/8] Architecture & SDLC Specification Verification. ✔ PASSED (4ms)
      └─ Spec Ledger verified (PostgreSQL 16 + pgvector, BullMQ, 3 Tiers, HMAC Ingress)
  [3/8] Database Migration & pgvector Schema DDL Check. ✔ PASSED (8ms)
      └─ 5 Core DDL tables + HNSW vector indexing + multi-tenant isolation validated
  [4/8] Static Quality & Secret Scrubber Audit......... ✔ PASSED (1420ms)
      └─ Strict TypeScript compilation clean (0 type errors, 0 implicit anys)
  [5/8] Unit & Integration Automated Test Suite........ ✔ PASSED (890ms)
      └─ All unit & regression tests passed (parser, flakiness, AI diagnosis, PR comments)
  [6/8] Production Bundling & Artifact Compilation..... ✔ PASSED (1120ms)
      └─ Target ES2022 dist artifacts built (3 bundles generated)
  [7/8] Synthetic CI Failure Diagnosis Simulation...... ✔ PASSED (15ms)
      └─ Simulated 50MB log -> Sliced to 25 lines | Flakiness: 95% | Sticky PR Comment generated
  [8/8] Containerization & Docker Orchestration Check.. ✔ PASSED (5ms)
      └─ Multi-stage Alpine Dockerfile & Docker Compose (Postgres+pgvector, Redis, API) verified
```

---

## 3. Architecture & Data Flow

```text
+-------------------------------------------------------------------------+
|                              GitHub Cloud                               |
|  1. Webhook (`workflow_job` / `workflow_run` completed: failure/success)|
|  4. REST API (`GET /actions/jobs/{job_id}/logs` & `GET /commits/{sha}`) |
|  8. REST API (`POST /issues/{pr}/comments` & `PATCH /comments/{id}`)    |
+--------------------+-------------------------------+--------------------+
                     | (1) HMAC-SHA256               ^ (4, 8) Installation
                     v                               |        Token Auth
+----------------------------------------------------+--------------------+
|               API & Webhook Gateway (Express / Fastify)                 |
|  - Validates `X-Hub-Signature-256` in < 50ms                            |
|  - Checks Redis tenant rate-limit / monthly quota                       |
|  - Pushes event payload to BullMQ (`ci-events` queue)                   |
+--------------------+----------------------------------------------------+
                     |
                     v
+-------------------------------------------------------------------------+
|                    Async Worker Pipeline (BullMQ + Redis)               |
|                                                                         |
|  [Step A: Pass/Fail Tracker]                                            |
|   - If conclusion == success on previously failed commit_sha:           |
|     -> Increment flaky_pass_on_retry_count on matching signature!       |
|                                                                         |
|  [Step B: Selective Log Streamer & Slicer]                              |
|   - Strips ANSI codes, runner timestamps, and GitHub ##[group] noise    |
|   - Extracts 40-line sliding windows around test failures / exit codes  |
|   - Scrubs secrets (AWS keys, Bearer tokens, PEM blocks, high entropy)  |
|                                                                         |
|  [Step C: Fingerprinting & Cloud Moat Lookup]                           |
|   - Normalizes stack trace (masks UUIDs, line numbers, memory addrs)    |
|   - Computes signature_hash = SHA256(step_name + normalized_trace)      |
|   - Queries PostgreSQL + pgvector for exact or semantic (>0.92) match  |
|                                                                         |
|  [Step D: LLM Structured Diagnosis (or Cache Hit)]                      |
|   - Calls Claude 3.5 Haiku / GPT-4o-mini with strict JSON Schema        |
|   - Correlates stack trace filenames with commit_sha modified files     |
|                                                                         |
|  [Step E: Multi-Channel Delivery & Paywall Gate]                        |
|   - Upserts sticky PR comment with <!-- ci-failure-diagnosis-marker --> |
|   - Appends locked historical moat teaser if on Free Tier               |
|   - Dispatches Slack/Discord webhook if Team Tier ($29/mo)              |
+--------------------+----------------------------------------------------+
                     |
                     v
+-------------------------------------------------------------------------+
|                PostgreSQL 16 + pgvector (Supabase / Neon)               |
|  - Tables: organizations, repositories, failure_signatures,             |
|            workflow_failures, diagnostic_reports                        |
+-------------------------------------------------------------------------+
```

---

## 4. Repository Structure

```text
Hopper/
├── .env.example                       # Reference environment configuration
├── .env                               # Local runtime configuration
├── Dockerfile                         # Production multi-stage Alpine build
├── docker-compose.yml                 # Local Postgres 16 (pgvector) + Redis + API
├── package.json                       # Dependencies, lifecycle scripts, metadata
├── tsconfig.json                      # Strict NodeNext TypeScript compiler options
├── tsup.config.ts                     # High-performance bundle configuration
├── SPEC.md                            # Comprehensive SDLC & Architecture Blueprint
├── LIFECYCLE_REPORT.md                # Generated build lifecycle report
├── bin/
│   └── hopper.js                      # Executable CLI entrypoint
├── supabase/
│   ├── migrations/
│   │   └── 0001_initial_schema.sql    # DDL: organizations, repos, signatures, failures
│   └── seed.sql                       # Seed data: test tenants, signatures, history
├── src/
│   ├── index.ts                       # Public library API export
│   ├── cli/
│   │   ├── hopper.ts                  # CLI commands (doctor, simulate, serve, lifecycle)
│   │   └── lifecycle.ts               # Unified SDLC lifecycle orchestrator
│   ├── server/
│   │   └── index.ts                   # Webhook Ingress & REST API Gateway
│   └── lib/
│       ├── parser/
│       │   ├── ansi-stripper.ts       # Strips ANSI, timestamps, runner markers
│       │   ├── secret-scrubber.ts     # Redacts tokens, keys, DB URIs, PEM blocks
│       │   ├── log-slicer.ts          # Bounded sliding window & anchor extractor
│       │   └── fingerprinter.ts       # Deterministic SHA-256 trace normalizer
│       ├── moat/
│       │   └── flakiness-engine.ts    # Multi-signal Bayesian flakiness scorer
│       ├── ai/
│       │   └── diagnose.ts            # Structured JSON LLM diagnosis + Zod schema
│       ├── billing/
│       │   └── quota-guard.ts         # Free (30), Pro (250), Team (1000) quota engine
│       └── github/
│           ├── app-auth.ts            # Timing-safe HMAC-SHA256 signature verifier
│           ├── log-fetcher.ts         # Direct log streamer & scenario mock logs
│           └── pr-reporter.ts         # Sticky PR comment & Paywall conversion renderer
└── tests/
    ├── parser.test.ts                 # Tests log slicing & anchor detection
    ├── scrubber.test.ts               # Tests zero-leakage secret redaction
    ├── fingerprint.test.ts            # Tests trace normalization & SHA-256 hashing
    ├── flakiness.test.ts              # Tests flakiness scoring algorithm
    ├── ai.test.ts                     # Tests Zod schema & prompt generation
    ├── pr-reporter.test.ts            # Tests sticky PR markdown & paywall teaser
    ├── quota-guard.test.ts            # Tests tier limits & exhaustion alerts
    └── webhook.test.ts                # Tests timing-safe HMAC validation
```

---

## 5. CLI Usage & Commands

Hopper includes a full-featured CLI:

```bash
# Display help and available commands
npx tsx src/cli/hopper.ts --help

# 1. Bring up the entire project build lifecycle in one command
npx tsx src/cli/hopper.ts lifecycle

# 2. Run system doctor & environment preflight
npx tsx src/cli/hopper.ts doctor

# 3. Simulate failure diagnosis on real-world raw CI logs
# Scenarios: 'jest', 'timeout', or 'oom'
npx tsx src/cli/hopper.ts simulate --scenario jest
npx tsx src/cli/hopper.ts simulate --scenario timeout
npx tsx src/cli/hopper.ts simulate --scenario oom

# 4. Start the Webhook Gateway & REST API server
npx tsx src/cli/hopper.ts serve --port 3000
```

---

## 6. Testing & Quality Assurance

Hopper includes a comprehensive test suite powered by `vitest`:

```bash
# Run all unit and integration tests
npm test

# Run tests in watch mode during development
npm run test:watch
```

---

## 7. Multi-Tenant Pricing & Quota Matrix

| Tier | Price | Monthly Runs | History Retention | Flaky Test Matrix | Slack Alerts | Auto-Retry Policy |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Free** | $0/mo | 30 | 24 Hours | Blurred Teaser | No | No |
| **Pro Developer** | $9/mo | 250 | 30 Days | Full Matrix | No | No |
| **Small Team** | $29/mo | 1,000 | 90 Days | Full Matrix | Yes (Slack/Discord) | Yes (>80% confidence) |

---

## 8. License

Licensed under the Apache License, Version 2.0.
