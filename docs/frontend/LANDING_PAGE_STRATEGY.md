# HOPPER — Product Positioning & Landing Page Strategy

**Author**: Hopper Principal Product Designer & UX Strategist  
**Repository**: `johan-droid/Hopper`  
**Date**: November 2026  
**Status**: APPROVED / IMPLEMENTATION BLUEPRINT  

---

## 1. Core Positioning: The Five Fundamental Questions

A credible developer platform must answer five questions immediately without marketing obfuscation:

### Question 1: What is Hopper?
**Answer**: Hopper is an engineering intelligence and CI/CD failure diagnosis platform. It integrates natively with GitHub Actions to ingest failed workflow runs, slice and scrub terminal logs, collapse recurrences into deterministic failure fingerprints, calculate evidence-based flakiness scores, and publish structured, actionable root-cause diagnoses directly where developers work (on Pull Requests and in a unified dashboard).

### Question 2: Who is it for?
**Answer**:
1. **Individual Developers & Full-Stack Engineers**: Developers who waste 20–45 minutes daily digging through massive, noisy raw CI logs to decipher why a build failed.
2. **DevOps & Platform Engineers**: Teams tasked with keeping pipeline execution times low, reducing wasteful runner retries, and maintaining infrastructure hygiene.
3. **Engineering Leads & Managers**: Leaders needing visibility into pipeline reliability, recurring test failure hotspots, and flakiness trends without relying on manual developer spreadsheets.

### Question 3: What problem does it solve?
**Answer**:
- **Log Noise & Blindness**: A 100,000-line CI log buries the root-cause assertion under thousands of lines of build setup, dependency installs, and webpack bundle dumps.
- **Speculative Debugging**: Developers repeatedly guess at failures, push speculative "fix?" commits, or blindly hit "Re-run failed jobs," burning runner minutes and compute budgets.
- **Flakiness Conflation**: Teams conflate true intermittent flakiness (non-deterministic network/clock failures on identical commit SHAs) with legitimate code regressions on feature branches.
- **Context Fragmentation**: Triaging a failure requires constantly context-switching between GitHub checks, CI log viewers, local terminal editors, and pull request review discussions.

### Question 4: How does it work?
**Answer** (The Verified 5-Stage Pipeline):
1. **HMAC-Verified Webhook Ingress**: Hopper's GitHub App receives `workflow_run` and `workflow_job` completion webhooks, verifies signatures with HMAC-SHA256, deduplicates delivery IDs, and writes to a durable PostgreSQL queue.
2. **Deterministic Log Slicing & Secret Scrubbing**: The failed job log is fetched, bounded at the tail 300 KB, stripped of ANSI terminal escape codes, and scrubbed of API tokens, SSH keys, passwords, and environment credentials.
3. **AST & Volatile Token Fingerprinting**: Volatile tokens (timestamps, hex SHAs, UUIDs, memory addresses, port numbers) are normalized and hashed into a canonical failure signature, grouping repeat failures across multiple PRs into a single persistent incident.
4. **Flakiness Evidence Scoring**: Hopper inspects same-SHA retries, default-branch failure rates, and cross-PR spread to compute a mathematically grounded flakiness score (0–100), rather than a generic guess.
5. **Structured Diagnosis & Delivery**: Hopper generates concise root-cause clues, cites the 3–15 highest-signal log lines, and formats an exact CLI reproduction command (`npx vitest run ...`), publishing it in a single sticky PR comment and recording it in workspace audit history.

### Question 5: Why should an engineering team trust it?
**Answer**:
- **Evidence-Grounded**: Every diagnosis cites specific, verifiable log line numbers and stack frames. If Hopper cannot determine the cause, it displays "uncertainty warnings" rather than hallucinating.
- **Strict Data Hygiene**: Logs are scrubbed of credentials before being stored or analyzed.
- **PostgreSQL Row-Level Security**: Every failure record and diagnosis is isolated by organization and repository using PostgreSQL RLS policies.
- **Zero Client-Side Token Minting**: Authentication is strictly validated through Supabase JWTs and GitHub OAuth; no private keys or service tokens are exposed to the client.

---

## 2. Anti-Patterns & Positioning Constraints

To maintain credibility with senior software engineers, the landing page strictly adheres to the following constraints:

1. **NO "AI fixes your code" Claims**: Hopper is an intelligence and diagnostic platform that helps developers understand and reproduce bugs; it does not claim to autonomously commit code to production.
2. **NO Synthetic Enterprise Logos or Testimonials**: We never display fabricated client logos ("Google", "Netflix", "Acme Corp") or fake developer quotes.
3. **NO Unverified Integrations**: Only verified integrations (GitHub Actions, Supabase, Vercel, Stripe) are displayed; GitLab and Bitbucket are clearly labelled as "Planned Roadmap".
4. **NO Vague AI Slop Copy**: Banned phrases include:
   - "Supercharge your pipeline with AI"
   - "Revolutionize your CI/CD workflow"
   - "Unlock next-generation productivity"
   - "Autonomous healing for software development"
5. **NO Meaningless Decorative Charts**: All graphs and diagrams represent actual failure categories, flakiness distributions, and real diagnostic metrics.

---

## 3. Landing Page Information Architecture

The homepage is structured as a purposeful technical narrative:

```
┌────────────────────────────────────────────────────────────────────────┐
│ 1. Minimal Header: Hopper Mark, Technical Links, Login, Dashboard CTA │
├────────────────────────────────────────────────────────────────────────┤
│ 2. Technical Hero:                                                     │
│    - Crisp Category Badge: "CI/CD Failure Diagnosis & Reliability"     │
│    - Technical Headline: "Know why your build failed.                   │
│                          Fix the recurring ones first."                 │
│    - Subtitle Grounded in Facts (Log slicing, Fingerprinting, Scoring) │
│    - Dual CTAs: Primary ("Start with GitHub") + Secondary ("Live Demo")│
│    - HERO PRODUCT VISUAL: Interactive Diagnostic Inspector             │
│      (Tabbed live failure scenarios: Jest failure, Playwright timeout,  │
│       OOM crash; real log snippet, signature hash, flakiness score,    │
│       and sticky PR comment preview)                                   │
├────────────────────────────────────────────────────────────────────────┤
│ 3. The Problem Narrative ("The Anatomy of a CI/CD Black Box"):         │
│    - 100K-line raw log vs. 3 high-signal lines                         │
│    - Flaky retries burning $ thousands in runner minutes               │
│    - Context lost between PR review, git diff, and terminal            │
├────────────────────────────────────────────────────────────────────────┤
│ 4. How Hopper Works (The 5-Stage Verification Loop):                   │
│    - 01 Ingest (GitHub Webhook HMAC)                                   │
│    - 02 Slicing & Scrubbing (300 KB tail + credential redaction)       │
│    - 03 Fingerprinting (Volatile token normalization)                  │
│    - 04 Flakiness Scoring (Same-SHA retry evidence)                    │
│    - 05 Sticky PR Reporting (In-situ review update)                    │
├────────────────────────────────────────────────────────────────────────┤
│ 5. Deep-Dive Product Capabilities (Engineered for Evidence):           │
│    - Deterministic Fingerprinting (Collapse 1,000 runs to 1 signature) │
│    - Flakiness Evidence Scoring (Same-SHA retries vs branch breakage)  │
│    - Local Repro CLI Generator (Copy-paste exact failure reproduction) │
│    - Cross-Run Failure Timelines (Track regressions across branches)   │
├────────────────────────────────────────────────────────────────────────┤
│ 6. Security Posture & Architecture:                                    │
│    - PostgreSQL Row-Level Security (RLS) tenant isolation              │
│    - AST credential redaction before model submission                  │
│    - Read-only GitHub App permissions                                  │
│    - Zero client-side token minting                                    │
├────────────────────────────────────────────────────────────────────────┤
│ 7. Verifiable Pricing:                                                 │
│    - Free: $0 (30 runs/mo, 24h history, solo trial)                    │
│    - Pro Developer: $9 (250 runs/mo, 30d history, full flaky matrix)   │
│    - Small Team: $29 (1,000 runs/mo, 90d history, team triage)         │
├────────────────────────────────────────────────────────────────────────┤
│ 8. Final CTA & Technical Footer:                                       │
│    - Clear, focused path to GitHub sign-in                             │
│    - Tribute to Rear Admiral Grace Hopper                              │
│    - Real links to status, documentation, and GitHub repository        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Key Interactive Feature: The Live Diagnostic Inspector

Instead of a static mockup or decorative screenshot, the hero features an **interactive, evidence-based Diagnostic Inspector**:

- **Scenario Selector**:
  - `Scenario A: Jest JWT Expiration (Test Assertion)`
  - `Scenario B: Playwright E2E Selector Timeout (Async Race)`
  - `Scenario C: Node.js V8 Heap Exhaustion (Infra OOM)`
- **Dynamic Panels**:
  - **Raw Sliced Log View**: Shows real ANSI-stripped log lines with highlighted error markers.
  - **Deterministic Fingerprint & Metadata**: Displays normalized signature hash (`sha256:7f8e...`), category badge, and error classifier.
  - **Flakiness Evidence Metric**: Displays flakiness score, same-SHA retry passes, and occurrence count.
  - **Sticky PR Markdown Preview**: Renders the exact GitHub PR comment Markdown that Hopper posts to developer PRs, complete with root-cause clue and reproduction command.

This interactive artifact immediately demonstrates value without requiring user signup.
