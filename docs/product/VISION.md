# Hopper — Product Vision & Philosophy (VISION.md)

---

## 1. Product Mission

**Hopper** turns failing CI/CD runs into immediate, actionable root-cause diagnoses and automated fixes, cutting developer debugging time from hours to seconds.

Named after **Rear Admiral Grace Hopper** — who famously taped the first actual computer bug (a moth trapped in a Mark II relay) into her logbook and pioneered machine-independent programming languages — Hopper brings rigorous, automated engineering diagnostics to modern software pipelines.

---

## 2. The Problem Statement

Software teams spend 15% to 25% of their active engineering cycles diagnosing build and test failures in continuous integration environments. 

In modern development workflows:
1. **Log Overload:** Developers must comb through 50MB+ raw terminal logs, ANSI escape sequences, runner noise, and hundreds of irrelevant steps to locate a single failing assertion or stack trace.
2. **Flaky Test Fatigue:** Intermittent test failures (network jitter, race conditions, database deadlocks, resource starvation) erode trust in CI. Teams re-run entire 30-minute pipelines repeatedly hoping for a green pass, wasting cloud compute and delaying deployments.
3. **Repetitive Triaging:** In fast-moving repositories with many contributors, multiple developers encounter identical failures on different PRs. Each person diagnoses the problem from scratch without knowing someone else already analyzed or solved it.
4. **Context Switching:** Triage requires navigating away from GitHub pull requests into opaque CI logs, local shell reproductions, and external issue trackers.

---

## 3. Target Users & Buyer Profiles

Hopper is purpose-built for engineering teams using GitHub Actions for their delivery pipelines:

1. **Software Engineers & Contributors:** Need to know immediately *why* their PR failed, whether their code change caused it or if it is an existing flaky test, and how to fix it without leaving GitHub.
2. **Tech Leads & Staff Engineers:** Need visibility into recurring failures, flaky test leaderboards, and systemic codebase defects across all repositories in the organization.
3. **DevOps & Platform Engineers:** Need to enforce CI reliability, eliminate wasted compute hours on non-deterministic retries, and ensure credentials are never exposed in build artifacts.
4. **High-Velocity Engineering Teams & Startups:** Fast iteration cycles where broken main branches or delayed PR merges block production deployments.

---

## 4. Core Value Proposition

- **Zero-YAML Configuration:** Connects in seconds via GitHub App installation without requiring complex pipeline modifications, custom runners, or bespoke configuration files.
- **Sub-15-Second Diagnosis:** Ingests webhook events, slices the log, identifies the failure signature, and generates a structured root-cause analysis before the developer switches context.
- **The Historical Moat (Failure Signatures):** Hashes normalized stack traces (SHA-256) and clusters them in PostgreSQL with `pgvector`. Hopper remembers every error ever seen across the repository, tracking its recurrence count, branch frequency, and Bayesian flakiness score.
- **Sticky PR Reporting:** Delivers diagnoses directly where developers work — as a single, cleanly formatted sticky comment on the pull request that updates automatically across re-runs.
- **Zero-Cost & Low-Cost AI Execution:** Delivers high-precision LLM reasoning via flexible provider backends, including zero-API-key client-side execution via Puter.js (DeepSeek V3, Qwen 2.5 Coder) alongside Anthropic Claude and OpenAI.

---

## 5. Product Philosophy

1. **Signal Over Noise:** Never dump raw logs back on the developer. Sift through the chaff, scrub secrets, extract the 40-line critical execution window, and highlight the exact failing statement.
2. **Distinguish Real Breakage from Flakiness:** If a commit failed and then passed on retry without code changes, it is flaky. Hopper mathematically tracks retry patterns and alerts developers when an error is non-deterministic.
3. **Meet Developers Where They Work:** Don't force developers to log into a separate portal just to read an error. Post directly to the GitHub PR. Use the dashboard for high-level trends, signatures, and workspace governance.
4. **Security by Default:** CI logs are treated as untrusted and potentially sensitive. Never persist raw secrets, never send plain credentials to external LLMs, and enforce strict tenant isolation at the database level.
5. **No Synthetic Bloat:** Every diagnosis must be grounded in actual log evidence and source code diffs. No generic AI hallucinated advice; if an error cannot be determined with high confidence, state it plainly.

---

## 6. Major Product Capabilities

### 6.1 GitHub Webhook Ingress & Log Slicing
- Verifies GitHub webhook authenticity via constant-time HMAC-SHA256 (`X-Hub-Signature-256`).
- Atomically deduplicates webhook delivery IDs to prevent duplicate processing.
- Streams failed job logs directly from the GitHub API, capping extraction at 300 KB to avoid multi-hundred-megabyte archive bottlenecks.
- Bottom-up sliding window parser extracts targeted execution windows around assertion errors, exit codes, and unhandled exceptions.
- Secret scrubber redacts AWS access keys, GitHub personal access tokens, database connection strings, Bearer tokens, and high-entropy secrets using deterministic regex heuristics.

### 6.2 Failure Fingerprinting & Flakiness Engine
- Normalizes dynamic tokens (UUIDs, timestamps, memory hex pointers, line/column coordinates) from stack traces.
- Computes canonical SHA-256 signature hash: `SHA256(job_name + step_name + normalized_template)`.
- Increments occurrence counters across main branches and pull requests.
- Calculates Bayesian flakiness score (0.00 to 100.00%) using four weighted signals:
  - Same-SHA retry passes (immediate retry succeeded without code change).
  - Cross-PR spread (failure appears across multiple independent branches).
  - Default branch failure frequency.
  - Timeout / infrastructure category correlation.

### 6.3 Multi-Model AI Diagnosis
- Formulates structured diagnosis prompts wrapped in `<UNTRUSTED_CI_LOG>` boundaries to protect against prompt injection.
- Validates model output against strict Zod schema (`DiagnosisOutputSchema`), ensuring consistent fields:
  - Root Cause Summary.
  - Failure Category (`test_assertion`, `timeout`, `infra_oom`, `build_compile`, `network`, `env_config`).
  - Confidence Score (0.0 to 1.0).
  - Suggested Code Fix (Markdown + Unified Diff).
  - Prevention / Next Steps Checklist.
- Dual execution paths:
  - **Server-Side Engine:** Scalable background processing with Anthropic Claude, OpenAI, Puter API, or deterministic local mock.
  - **In-Browser Puter Engine:** Client-side zero-API-key execution leveraging Puter.js allowance (DeepSeek V3, Qwen 2.5 Coder, GPT-4o-mini).

### 6.4 Developer Workspace & Dashboard
- Authenticated React SPA providing:
  - **Overview Dashboard:** Failure volume metrics, flakiness score distributions, and top recurring signature leaderboards.
  - **Failure Details:** Deep inspection of individual CI runs with side-by-side log view, signature timeline, and diagnosis report.
  - **Interactive Investigation Sandbox:** Ad-hoc log diagnosis tool allowing engineers to paste raw logs or select test samples, compare backend and Puter AI models, and inspect structured outputs.
  - **Repository & Workspace Management:** Multi-tenant workspace hierarchy with role-based member permissions (`owner`, `admin`, `developer`, `viewer`).
  - **Billing & Subscription Management:** Tier status, run limits, and upgrade flows.

---

## 7. Commercial Strategy & Pricing Tiers

Hopper operates a freemium commercial model designed for rapid developer adoption followed by team-level monetization:

| Feature / Quota | Free Tier ($0) | Pro Developer ($9/mo) | Small Team ($29/mo) |
|---|---|---|---|
| **Monthly Diagnoses** | 30 runs/mo | 250 runs/mo | 1,000 runs/mo |
| **History Retention** | 24 hours | 30 days | 90 days |
| **Connected Repositories** | 1 repository | 5 repositories | Unlimited |
| **Flakiness Matrix** | Blurred teaser preview | Full flakiness score | Full flakiness matrix & leaderboard |
| **PR Comment Delivery** | Basic sticky comment | Sticky comment + code fix | Sticky comment + team insights |
| **Notifications** | None | None | Slack & Discord webhooks |
| **Auto-Retry Recommendation** | No | No | High-confidence flakiness triggers |

---

## 8. Explicit Non-Goals & Boundaries

To preserve focus and architectural integrity, Hopper explicitly rejects the following non-goals:

- **Not a CI Runner:** Hopper will never execute CI pipelines, provision runners, or replace GitHub Actions, CircleCI, or GitLab CI.
- **Not a Generic Chatbot:** Hopper will not provide an open-ended conversational assistant for writing general code. All AI capabilities are constrained to CI diagnostic reasoning.
- **Not a Source Code Host:** Hopper does not store or mirror customer git repositories. It only accesses ephemeral diffs and failed job logs during diagnosis.
- **No Arbitrary Code Execution on Control Plane:** Hopper never executes untrusted customer code or shell scripts within its backend functions or containers.
- **No In-Memory Single-Node State:** The platform must not rely on local server memory or single-instance daemons for multi-tenant coordination; all state belongs in PostgreSQL.
