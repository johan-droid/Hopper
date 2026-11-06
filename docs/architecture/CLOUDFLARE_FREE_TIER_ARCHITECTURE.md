# Cloudflare Free Tier & Workers AI Architecture

## 1. Executive Summary & Philosophy

Hopper's primary commercial and operational objective during validation and early traction is zero marginal AI operating expenditure without sacrificing diagnostic quality, architectural coherence, or reliability. By leveraging Cloudflare's extensive Free Tier services—specifically **Cloudflare Workers AI**, **Worker Edge Gateway**, **Pages**, **Turnstile**, and **KV/Edge Caching**—Hopper operates 100% autonomously without reliance on paid third-party AI APIs (such as OpenAI or Anthropic).

### Key Architectural Invariants
1. **Single-Provider Isolation**: When `AI_PROVIDER=cloudflare` (or `workers-ai`), Hopper exclusively communicates with Cloudflare's AI endpoints. It strictly disallows secondary-provider chaining or automatic failover to paid external APIs. On transient error exhaustion or permanent error, Hopper deterministically falls back to its observable heuristic diagnostic synthesizer.
2. **PostgreSQL pgvector Schema Compatibility**: Hopper's PostgreSQL database schema uses `vector(1536)` with HNSW indexing for historical failure clustering. Cloudflare's high-speed embedding model (`@cf/baai/bge-base-en-v1.5`) generates 768-dimensional embeddings. The architecture employs an L2-normalized zero-padded projection that mathematically preserves cosine distance, ensuring zero database migration overhead.
3. **Budget Controller Safety**: Cloudflare free-tier requests are bounded by Hopper's Authoritative Budget Controller (`AiBudgetController`), applying nominal safety reservations ($0.0001) during pre-flight admission and settling at $0.0000 actual cost.

---

## 2. Cloudflare Free Tier Service Topology & Use Cases

```
                                +-----------------------------+
                                |  CI/CD Webhook / Developer  |
                                +--------------+--------------+
                                               |
                                               v
                                +-----------------------------+
                                |   Cloudflare Turnstile      |  (Bot & Abuse Protection)
                                +--------------+--------------+
                                               |
                                               v
                                +-----------------------------+
                                |  Cloudflare Worker Gateway  |
                                |  (hopper.workers.dev)       |
                                +-------+-------------+-------+
                                        |             |
                         +--------------+             +--------------+
                         |                                           |
                         v                                           v
         +-------------------------------+           +-------------------------------+
         |  Cloudflare Pages (Frontend)  |           |     Cloudflare Workers AI     |
         |  React + Tailwind SPA         |           |  - Llama 3.1 8B Instruct      |
         +-------------------------------+           |  - BGE-Base-EN v1.5 Embeddings|
                                                     +---------------+---------------+
                                                                     |
                                                                     v
                                                     +-------------------------------+
                                                     |    Hopper Backend Engine      |
                                                     |  - Budget Controller Guard    |
                                                     |  - Single-Provider Isolation  |
                                                     |  - Deterministic Fallback     |
                                                     +---------------+---------------+
                                                                     |
                                                                     v
                                                     +-------------------------------+
                                                     | PostgreSQL + pgvector(1536)   |
                                                     +-------------------------------+
```

### A. Cloudflare Workers AI
- **Failure Diagnosis & Root Cause Synthesis**: Uses `@cf/meta/llama-3.1-8b-instruct` (or `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`). Evaluates sanitized CI/CD logs, test suites, and git commit metadata to output structured JSON adhering strictly to `DiagnosisOutputSchema`.
- **Free Tier Capacity**: Cloudflare provides **10,000 neurons per day for free** ($0.00/month). An 8B parameter model typically consumes ~1 neuron per input/output sequence, providing ~500–1,000 deep diagnostic evaluations per day at zero cost.
- **Alternative Free Tier Models**:
  - `@cf/meta/llama-3.1-8b-instruct` (Default recommended)
  - `@cf/meta/llama-3-8b-instruct`
  - `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b`
  - `@cf/mistral/mistral-7b-instruct-v0.2`

### B. Semantic Vector Embeddings
- **Model**: `@cf/baai/bge-base-en-v1.5` (768 dimensions).
- **Use Case**: Generates vector representations of failure fingerprints (step name, error category, failure stack trace) to identify recurring patterns, cross-PR flakiness, and historical resolutions.
- **Dimension Projection**: Zero-padded from 768 to 1536 dimensions and scaled by L2 unit normalization:
  $$\tilde{u} = \frac{[u_1, u_2, \dots, u_{768}, 0, \dots, 0]}{\sqrt{\sum_{i=1}^{768} u_i^2}}$$
  Since all padded dimensions are identical (0), the inner product and cosine similarity between any two projected vectors $\tilde{u}$ and $\tilde{v}$ is identical to the original 768-dimensional cosine similarity:
  $$\cos(\tilde{u}, \tilde{v}) = \frac{\tilde{u} \cdot \tilde{v}}{\|\tilde{u}\| \|\tilde{v}\|} = \frac{u \cdot v}{\|u\| \|v\|} = \cos(u, v)$$

### C. Cloudflare Worker Edge Gateway
- **Edge Routing & Proxy**: Deployed via `deploy/cloudflare/worker.ts` and `wrangler.toml`.
- **Native AI Routes**:
  - `GET /api/ai/models`: Discovers available edge AI models and reports daily neuron limits.
  - `POST /api/ai/diagnose`: Dispatches prompt synthesis directly via Cloudflare `env.AI.run(...)`.
  - `POST /api/ai/embeddings`: Generates 768-dim embeddings directly at the Cloudflare edge.
- **Edge Cache & Security**:
  - Adds security response headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`).
  - Implements CORS options preflight for browser clients.

### D. Cloudflare Pages
- **Frontend SPA Deployment**: Builds and serves the Hopper client React application directly on Cloudflare's global edge network.
- **Zero Cost**: Unlimited requests and global SSL termination on the Free Tier.

### E. Cloudflare Turnstile
- **Bot and Abuse Mitigation**: Eliminates automated submission attacks against public diagnosis and webhook endpoints without degrading user experience with interactive CAPTCHAs.

### F. Cloudflare KV & Edge Cache
- **Edge Failure Caching**: Caches deduplicated diagnostic reports by normalized error hash, preventing redundant AI inference for repeated identical CI pipeline failures.

---

## 3. Dual Connection Architecture

Hopper supports two execution modes for Cloudflare Workers AI:

### Mode 1: Cloudflare Worker Edge Gateway (Recommended for Edge Deployments)
The backend forwards requests to the deployed Hopper Cloudflare Worker edge route:
```bash
AI_PROVIDER=cloudflare
CLOUDFLARE_WORKER_AI_URL=https://hopper.sahooashutosh2022.workers.dev
```
The Worker executes `env.AI.run(...)` directly inside Cloudflare's runtime, eliminating API token management on the application server.

### Mode 2: Direct Cloudflare REST API (Recommended for Local Dev / Containerized Backend)
The backend connects directly to Cloudflare's Client v4 REST API:
```bash
AI_PROVIDER=cloudflare
CLOUDFLARE_ACCOUNT_ID="your-cloudflare-account-id"
CLOUDFLARE_API_TOKEN="your-cloudflare-api-token"
AI_MODEL="@cf/meta/llama-3.1-8b-instruct"
```
Endpoint: `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/${AI_MODEL}`

---

## 4. Configuration Reference

| Environment Variable | Required | Description | Example |
|---|---|---|---|
| `AI_PROVIDER` | Yes | Specifies the active AI engine | `cloudflare` |
| `AI_MODEL` | No | Target Cloudflare Workers AI model | `@cf/meta/llama-3.1-8b-instruct` |
| `CLOUDFLARE_ACCOUNT_ID` | Conditional | Cloudflare account identifier | `8f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c` |
| `CLOUDFLARE_API_TOKEN` | Conditional | API Token with `Workers AI: Read` scope | `cf_tok_abc123...` |
| `CLOUDFLARE_WORKER_AI_URL` | Conditional | URL of deployed Hopper Worker Edge Gateway | `https://hopper.sahooashutosh2022.workers.dev` |
| `EMBEDDING_MODEL` | No | Embedding model name | `@cf/baai/bge-base-en-v1.5` |

*(Note: Either `CLOUDFLARE_WORKER_AI_URL` or both `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` must be supplied).*

---

## 5. Economic Analysis & Free Tier Sustainability

| Component | Third-Party Cost (OpenAI / Anthropic) | Cloudflare Free Tier Cost | Monthly Savings |
|---|---|---|---|
| **Diagnostic LLM** | $0.003 – $0.015 per diagnosis | $0.00 (10,000 neurons/day) | ~$150 – $300/mo |
| **Embeddings** | $0.02 per 1M tokens | $0.00 (Included in Workers AI) | ~$10 – $25/mo |
| **Static Hosting (Pages)** | $20/mo (Vercel/Netlify Pro) | $0.00 (Unlimited bandwidth) | $20/mo |
| **Bot Protection (Turnstile)** | $50/mo (reCAPTCHA Enterprise) | $0.00 (Unlimited free) | $50/mo |
| **Edge Compute (Workers)** | $5/mo base | $0.00 (100,000 req/day) | $5/mo |
| **Total AI & Infra Marginal Cost** | **$235 – $390 / month** | **$0.00 / month** | **100% Free** |

By running on Cloudflare Free Tier, Hopper achieves complete financial independence during the pre-revenue validation phase while delivering enterprise-grade latency and reliability.
