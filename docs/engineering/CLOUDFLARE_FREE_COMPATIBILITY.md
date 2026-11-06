# HOPPER — CLOUDFLARE FREE PLAN COMPATIBILITY & LIMITS AUDIT (CORRECTED PHASE 0.2)

**Date:** 2026-11-07  
**Auditor:** Principal Cloudflare Architect & Platform Engineer  
**Scope:** Exhaustive evaluation of 12 Cloudflare native services on the Free Plan  
**Target:** Production-grade, zero-cost operation within verifiable provider boundaries  

---

## 1. COMPATIBILITY MATRIX: 12 CLOUDFLARE SERVICES

| # | Service Name | Verified Free Plan Quota | Reset Period | Status in Hopper Architecture |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Cloudflare Workers** | 100,000 requests / day | Daily (00:00 UTC) | **PRIMARY RUNTIME** (Gateway, Webhook, API) |
| **2** | **Workers KV** | 100k reads/day, 1k writes/day | Daily (00:00 UTC) | **READ-HEAVY PUBLIC CACHE** (Feature flags, burst limits) |
| **3** | **Cloudflare D1** | 5M rows read/day, 100k rows written/day | Daily (00:00 UTC) | **PRIMARY METADATA DB** (Workspaces, Repos, Reports) |
| **4** | **Cloudflare Queues** | **10,000 operations / day** | Daily (00:00 UTC) | **PRIMARY EVENT QUEUE** (Decoupled async worker) |
| **5** | **Cloudflare Vectorize**| **5M stored dimensions / mo**, 30M queried dims | Monthly | **SEMANTIC FINGERPRINT INDEX** (Failure clustering) |
| **6** | **Workers AI** | 10,000 Neurons / day | Daily (00:00 UTC) | **DIAGNOSIS SYNTHESIZER** (Llama-3.2-3B + BGE) |
| **7** | **Cloudflare R2** | 10 GB stored/mo, 1M Class A, 10M Class B| Monthly | **LOG ARTIFACT BLOB STORE** (Raw CI/CD logs) |
| **8** | **Cloudflare Pages / Assets** | 500 builds/mo (Pages), Unlimited Workers Assets | Monthly | **FRONTEND HOSTING** (React + Vite SPA) |
| **9** | **Browser Rendering** | **10 minutes duration / day**, 3 concurrency | Daily (00:00 UTC) | **NOT FOR PRODUCTION** (Use client-side rendering) |
| **10**| **Cloudflare Turnstile**| **Unlimited challenges & siteverify checks** | Fair use | **BOT DEFENSE** (Public sandbox & signup) |
| **11**| **Cloudflare Workflows**| 10,000 executions / month (Beta) | Monthly | **OPTIONAL ORCHESTRATOR** (Multi-step pipelines) |
| **12**| **Cloudflare Zero Trust**| Up to 50 active user seats free | Per-seat | **ADMIN GATEWAY** (Internal ops/staging access) |

---

## 2. DETAILED SERVICE-BY-SERVICE SPECIFICATIONS

### 1. Cloudflare Workers
1. **Service Name:** Cloudflare Workers
2. **Free Plan Quota:** 100,000 requests per day.
3. **Reset Period:** Daily at 00:00 UTC.
4. **CPU or Execution Constraints:** 10 milliseconds synchronous CPU time per invocation. Asynchronous I/O wait time (`fetch()`, D1 queries, R2 calls) does not consume CPU budget.
5. **Storage Constraints:** 1 MB compressed script bundle size (3 MB uncompressed). 128 MB RAM per isolate.
6. **Request or Operation Limits:** Max 50 subrequests per incoming request. Max 100 concurrent requests.
7. **Relevant Feature Restrictions:** No outbound TCP raw sockets (`net.Socket`) without Hyperdrive. Node.js compatibility enabled via `nodejs_compat`.
8. **Documentation Source:** [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
9. **Hopper Use Case:** Unified Edge API Gateway, GitHub webhook listener, REST API dispatcher, static asset server.
10. **Expected Bottleneck:** 10ms synchronous CPU limit. Slicing 10,000-line logs takes ~5.67ms and secret scrubbing takes ~4.08ms (total ~9.75ms CPU). **Log parsing cannot run synchronously in the HTTP request handler**. It must run inside the queue consumer.

---

### 2. Workers KV
1. **Service Name:** Workers KV (Key-Value Storage)
2. **Free Plan Quota:** 100,000 read requests per day; 1,000 write requests per day; 1,000 delete requests per day; 1,000 list requests per day.
3. **Reset Period:** Daily at 00:00 UTC.
4. **CPU or Execution Constraints:** Sub-millisecond read latency; eventual consistency with up to 60s global replication lag.
5. **Storage Constraints:** 1 GB total stored data. Max key size: 512 bytes. Max value size: 25 MB.
6. **Request or Operation Limits:** 1 write per second per key rate limit.
7. **Relevant Feature Restrictions:** **Must NOT be used as a token store, session database, or event queue.**
8. **Documentation Source:** [Workers KV Limits](https://developers.cloudflare.com/kv/platform/limits/)
9. **Hopper Use Case:** Caching non-sensitive public configuration, feature flags, and rate-limit burst buckets.
10. **Expected Bottleneck:** 1,000 writes per day.

---

### 3. Cloudflare D1
1. **Service Name:** Cloudflare D1 (Serverless Relational SQLite)
2. **Free Plan Quota:** 5,000,000 rows read per day; 100,000 rows written per day. Up to 10 databases per account.
3. **Reset Period:** Daily at 00:00 UTC.
4. **CPU or Execution Constraints:** Max 30 seconds query execution time.
5. **Storage Constraints:** 500 MB total database size across all databases on Free Plan.
6. **Request or Operation Limits:** Max 100 bound parameters per SQL statement. Max 100 concurrent queries per database.
7. **Relevant Feature Restrictions:** SQLite 3.45+ dialect. No interactive `BEGIN`/`COMMIT` transactions over Worker protocol; batch execution requires `db.batch([stmt1, stmt2])`. No native arrays (`text[]` must be JSON string). Foreign keys disabled by default (requires `PRAGMA foreign_keys = ON;`).
8. **Documentation Source:** [Cloudflare D1 Limits](https://developers.cloudflare.com/d1/platform/limits/)
9. **Hopper Use Case:** Canonical relational metadata: organizations, workspaces, repositories, failure records, diagnostic reports, and audit ledger.
10. **Expected Bottleneck:** 500 MB storage cap. Raw build logs must be stored in R2, keeping D1 records lean (metadata, references, hashes).

---

### 4. Cloudflare Queues
1. **Service Name:** Cloudflare Queues
2. **Free Plan Quota:** **10,000 operations per day** on Workers Free Plan. (1,000,000 ops/mo applies only to Workers Paid).
3. **Reset Period:** Daily at 00:00 UTC.
4. **CPU or Execution Constraints:** Consumer worker runs as an asynchronous background invocation (`queue(batch, env, ctx)`).
5. **Storage Constraints:** Message retention: **24 hours** on Free tier. Max message size: **128 KB** (metered per 64 KB chunk).
6. **Request or Operation Limits:** Operations counted per 64 KB chunk for writes, reads, and deletes. A standard message consumes 3 operations (1 write + 1 read + 1 delete). 10,000 ops/day yields **~3,333 message lifecycles per day**.
7. **Relevant Feature Restrictions:** Messages exceeding 128 KB are rejected.
8. **Documentation Source:** [Cloudflare Queues Limits](https://developers.cloudflare.com/queues/platform/limits/)
9. **Hopper Use Case:** Asynchronous decoupling of incoming GitHub webhook events from heavy diagnosis processing, preventing webhook timeouts (10s deadline).
10. **Expected Bottleneck:** 128 KB message size limit. Full raw CI/CD logs cannot be placed directly into queue payloads. The producer must store raw logs in R2 and enqueue an event pointer `{ failureId, r2Key, repoId }`.

---

### 5. Cloudflare Vectorize
1. **Service Name:** Cloudflare Vectorize (Vector Database)
2. **Free Plan Quota:** **5,000,000 stored vector dimensions per month**; **30,000,000 queried vector dimensions per month**. Up to 100 indexes.
3. **Reset Period:** Monthly billing cycle.
4. **CPU or Execution Constraints:** Native edge similarity search via HNSW indexing.
5. **Storage Constraints:** Storage is dimension-based: $\text{vectors} \times \text{dimensions}$. For 768-dim BAAI embeddings (`@cf/baai/bge-base-en-v1.5`), Free Plan supports:
   $$\frac{5,000,000 \text{ stored dimensions}}{768 \text{ dims/vector}} \approx \mathbf{6,510 \text{ total stored vectors}}$$
   *(Not 200,000 vectors).*
6. **Request or Operation Limits:** Max 1,000 vectors per insert batch. Max 50 query vectors per search call, `top_k` up to 100.
7. **Relevant Feature Restrictions:** Strict coordinate-space isolation: vectors from different embedding models cannot be meaningfully compared.
8. **Documentation Source:** [Cloudflare Vectorize Limits](https://developers.cloudflare.com/vectorize/platform/limits/)
9. **Hopper Use Case:** Semantic clustering of failure signatures.
10. **Expected Bottleneck:** **6,510 stored vectors limit**. Hopper must check exact SHA-256 fingerprint matches in D1 first (deterministic cache) and only index novel, unique failure signatures in Vectorize.

---

### 6. Cloudflare Workers AI
1. **Service Name:** Cloudflare Workers AI
2. **Free Plan Quota:** 10,000 Neurons per day.
3. **Reset Period:** Daily at 00:00 UTC.
4. **CPU or Execution Constraints:** Edge GPU inference. Timeout: 60 seconds per inference request.
5. **Storage Constraints:** Context window: 8,192 tokens for `@cf/meta/llama-3.2-3b-instruct`.
6. **Request or Operation Limits:** Text Generation (`llama-3.2-3b`): ~104 neurons per 1k input tokens, ~276 neurons per 1k output tokens. Embeddings (`bge-base-en-v1.5`): ~13 neurons per 1k tokens.
7. **Relevant Feature Restrictions:** No fixed "55 runs" guarantee: consumption varies dynamically based on prompt and response length. Returns HTTP 429 when 10,000 neurons are exhausted.
8. **Documentation Source:** [Workers AI Pricing & Neurons](https://developers.cloudflare.com/workers-ai/platform/pricing/)
9. **Hopper Use Case:** AI failure diagnosis synthesis, root cause deduction, actionable remediation steps, and 768-dim embeddings generation.
10. **Expected Bottleneck & Hopper Strategy:** Deterministic rule-based diagnosis engine handles all known failure signatures, test timeouts, syntax errors, and dependency mismatches with 0 neurons. Workers AI is invoked strictly for novel, ambiguous failure signatures.

---

### 7. Cloudflare R2
1. **Service Name:** Cloudflare R2 (S3-Compatible Object Storage)
2. **Free Plan Quota:** 10 GB stored per month; 1,000,000 Class A operations (writes, lists) / month; 10,000,000 Class B operations (reads) / month; Zero egress bandwidth fees.
3. **Reset Period:** Monthly billing cycle.
4. **CPU or Execution Constraints:** Global S3 API and Workers binding (`env.R2.get()`, `env.R2.put()`).
5. **Storage Constraints:** 10 GB total stored data on Free tier.
6. **Request or Operation Limits:** 1,000 Class A writes per second peak.
7. **Relevant Feature Restrictions:** Object lifecycle rules supported natively via bucket settings or S3 `PutBucketLifecycleConfiguration`. Deletions are **$0** (free).
8. **Documentation Source:** [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/platform/pricing/)
9. **Hopper Use Case:** Storing raw GitHub Actions workflow run logs, step execution artifacts, and PR diff snapshots.
10. **Expected Bottleneck & Mitigation:** An automated 14-day retention lifecycle rule (`Expiration: { Days: 14 }` on prefix `logs/`) guarantees storage remains below 10 GB.

---

### 8. Cloudflare Pages / Workers Static Assets
1. **Service Name:** Cloudflare Pages / Workers Static Assets
2. **Free Plan Quota:** 500 build minutes per month (Pages CI); unlimited requests and bandwidth for deployed static assets.
3. **Reset Period:** Monthly billing cycle.
4. **CPU or Execution Constraints:** Edge static file delivery with global CDN caching.
5. **Storage Constraints:** Max 25 MB per asset file; max 20,000 static files per deployment.
6. **Request or Operation Limits:** Unlimited HTTP requests.
7. **Relevant Feature Restrictions:** Client-side SPA routing requires single-page redirect fallback (`/* -> /index.html`).
8. **Documentation Source:** [Cloudflare Pages Limits](https://developers.cloudflare.com/pages/platform/limits/)
9. **Hopper Use Case:** Hosting the Hopper React Single Page Application (`frontend/dist`).
10. **Expected Bottleneck:** None for asset delivery. 500 build minutes limit on Pages is avoided by building in GitHub Actions and deploying prebuilt assets via Wrangler (`[assets] directory = "frontend/dist"`).

---

### 9. Cloudflare Browser Rendering
1. **Service Name:** Cloudflare Browser Rendering
2. **Free Plan Quota:** **10 minutes browser duration per day**, up to 3 concurrent browser sessions.
3. **Reset Period:** Daily at 00:00 UTC.
4. **CPU or Execution Constraints:** Headless Chrome instance.
5. **Storage Constraints:** N/A.
6. **Request or Operation Limits:** Hard block with HTTP 429 when 10-minute cap is reached.
7. **Relevant Feature Restrictions:** **Unsuitable for production reports**. Cold starts take 5-15s, exhausting the 10-minute limit within 40-60 renders.
8. **Documentation Source:** [Browser Rendering Limits](https://developers.cloudflare.com/browser-rendering/platform/limits/)
9. **Hopper Use Case:** None in core pipeline. All reports, charts, and visualizations execute client-side via Web APIs (Canvas, SVG, `window.print`).
10. **Expected Bottleneck:** Free tier hard limit.

---

### 10. Cloudflare Turnstile
1. **Service Name:** Cloudflare Turnstile (Smart CAPTCHA Alternative)
2. **Free Plan Quota:** **Unlimited challenges and `siteverify` requests** on Free Plan. Max 20 widgets per account.
3. **Reset Period:** Fair use.
4. **CPU or Execution Constraints:** Client widget + server-side validation (`challenges.cloudflare.com/turnstile/v0/siteverify`).
5. **Storage Constraints:** Zero persistent storage needed.
6. **Request or Operation Limits:** Token expires in **300 seconds (5 minutes)**. Token is **single-use only** (re-verification fails).
7. **Relevant Feature Restrictions:** Turnstile confirms that the client is human / non-malicious; it provides **zero** user identity or tenant scoping.
8. **Documentation Source:** [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/)
9. **Hopper Use Case:** Abuse prevention for the public diagnostic sandbox and registration forms.
10. **Expected Bottleneck:** Single-use token enforcement must not be called twice in retry loops.

---

### 11. Cloudflare Workflows
1. **Service Name:** Cloudflare Workflows
2. **Free Plan Quota:** Up to 10,000 workflow executions per month (currently in public beta).
3. **Reset Period:** Monthly billing cycle.
4. **CPU or Execution Constraints:** Step-based execution with automatic durability, checkpointing, and sleep timers.
5. **Storage Constraints:** State serialized between steps.
6. **Request or Operation Limits:** 10,000 monthly runs.
7. **Relevant Feature Restrictions:** Beta API stability.
8. **Documentation Source:** [Cloudflare Workflows](https://developers.cloudflare.com/workflows/)
9. **Hopper Use Case:** Multi-job CI correlations.
10. **Expected Bottleneck:** Beta status; Cloudflare Queues is preferred for GA production stability.

---

### 12. Cloudflare Zero Trust / Cloudflare Access
1. **Service Name:** Cloudflare Zero Trust (Access & Gateway)
2. **Free Plan Quota:** Up to **50 active user seats free**.
3. **Reset Period:** Ongoing active user count.
4. **CPU or Execution Constraints:** Edge proxy access policies with SAML/OIDC integration.
5. **Storage Constraints:** 24-hour log retention.
6. **Request or Operation Limits:** Hard block at user 51.
7. **Relevant Feature Restrictions:** **Cannot be used for public multi-tenant Hopper end users**.
8. **Documentation Source:** [Cloudflare Zero Trust Pricing](https://developers.cloudflare.com/cloudflare-one/plans/)
9. **Hopper Use Case:** Restricting administrative access to Hopper staging/ops dashboards and internal telemetry endpoints.
10. **Expected Bottleneck:** 50-user cap.
