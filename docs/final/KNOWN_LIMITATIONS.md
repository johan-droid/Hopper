# HOPPER — DOCUMENTED SYSTEM LIMITATIONS & TRADEOFFS

## 1. Technical & Architectural Limitations

### 1.1 Anthropic Prompt Caching Minimum Prefix (2,048 Tokens)
- **Constraint:** Anthropic Claude 3.5 Haiku enforces a strict minimum cacheable prompt prefix of **2,048 tokens** before the `cache_control: { type: 'ephemeral' }` directive is honored.
- **Impact:** For standard CI diagnostics where the system prompt and instructions total ~1,200 tokens, Anthropic ignores the cache directive and charges standard base input pricing ($0.80 / MTok) rather than the discounted cache-read pricing ($0.08 / MTok).
- **Mitigation:** Hopper's `AiBudgetController` pre-flight reservation engine explicitly calculates costs assuming standard base input pricing ($0.80 / MTok) without optimistic cache discounts. Financial limits ($500 hard cap) can never be exceeded by un-cached prompts.

### 1.2 Single-Provider Failover Tradeoff
- **Constraint:** In accordance with the explicit architectural directive, Hopper enforces a **single-provider policy** (`anthropic` or `openai`).
- **Impact:** If Anthropic experiences a major global API outage or persistent 5xx errors, Hopper **strictly does not** automatically switch to OpenAI or any other secondary commercial provider.
- **Mitigation:** When retries are exhausted or deadlines exceeded, Hopper gracefully falls back to its high-accuracy, zero-cost deterministic heuristic engine (`synthesizeDeterministicDiagnosis`), maintaining platform availability without multi-provider financial leakage.

### 1.3 Cloudflare Free-Tier Daily Worker Request Cap (100,000 Requests/Day)
- **Constraint:** Cloudflare Workers Free Tier limits invocations to 100,000 requests per 24-hour UTC day.
- **Impact:** While sufficient for 50–100 active engineering teams, an unexpected surge of webhook events could hit the daily ceiling (returning HTTP 1015).
- **Mitigation:** Frontend static assets are isolated on Cloudflare Pages (unlimited requests), and public read endpoints (`/api/health`, `/api/signatures/stats`) are cached at the edge. If the limit is approached, the operator can switch DNS to DNS-only (Grey Cloud) or upgrade to Workers Paid ($5.00/month for 10M requests).

---

## 2. Commercial & Operational Boundaries

### 2.1 Passive-Only Diagnostic Boundary
- **Policy:** Hopper is fundamentally an engineering intelligence tool, not an autonomous agent.
- **Constraint:** Hopper never executes arbitrary code, never opens automated code-patching PRs, and never triggers branch mutations on user repositories.
- **Developer Expectation:** Hopper provides verified root-cause clues, cited log lines, and exact copy-pasteable local reproduction commands (`npx vitest run ...`), leaving code mutation decisions in human hands.

### 2.2 Dormant Commercial Paywalls During Validation
- **Policy:** Access to Hopper is strictly free for users during initial market validation in India and international discovery.
- **Constraint:** Stripe webhook handlers and checkout routes exist in the codebase but are deactivated at runtime (`ENABLE_COMMERCIAL_QUOTA=false`). Organizations are not blocked by paywalls or subscription limits during this phase.

