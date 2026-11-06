# Hopper Cloudflare Free-Tier Production Architecture

## 1. Executive Summary

Hopper is architected as an edge-accelerated, hybrid cloud platform. The frontend and edge gateway operate entirely within the **Cloudflare Free Tier**, providing global low-latency content delivery, DDoS protection, edge caching, and bot defense without hosting costs or egress fees. The backend origin runs as a hardened Node.js/TypeScript execution environment paired with self-managed PostgreSQL (with pgvector) and Redis instances enforcing kernel-level multi-tenant isolation.

```mermaid
flowchart TD
    Client["Client Developer / CI Runner\n(Desktop, Mobile, GitHub Webhook)"]
    
    subgraph Cloudflare["Cloudflare Free Tier Edge Network"]
        CFDNS["Cloudflare Anycast DNS & WAF\n(DDoS, TLS 1.3 Termination)"]
        CFPages["Cloudflare Pages CDN\n(React 18 SPA + Code-Split Chunks)"]
        CFWorker["Edge Gateway Worker (hopper-edge)\nReverse Proxy, CORS, Turnstile Check,\nEdge Caching (GET /api/health, stats)"]
        Turnstile["Cloudflare Turnstile API\n(Bot / Abuse Defense)"]
    end

    subgraph Origin["Secured Origin Infrastructure (Linux Server / VM)"]
        Nginx["Reverse Proxy / TLS Wrapper\n(Firewall restricted to CF IP Ranges)"]
        NodeAPI["Hopper Node.js Express API\n(Port 3000, Auth Middleware, JWT, RBAC)"]
        BullMQWorker["Hopper BullMQ Background Worker\n(Queue Processor, Slicer, HopperEngine)"]
        PG["PostgreSQL 16 + pgvector (Port 5432)\nhopper_app Role (NOSUPERUSER, NOBYPASSRLS)\nFORCE ROW LEVEL SECURITY (11 Tables)"]
        Redis["Redis 7 (Port 6379)\nBullMQ Queue, Mutex Locks, Rate Limits"]
    end

    subgraph External["External AI Provider & Webhooks"]
        Anthropic["Anthropic Claude API\n(claude-3-5-haiku-20241022)\nACID Capped $500 Budget Ledger"]
        GitHub["GitHub CI/CD Platform\n(Webhook Events, PR Status Comments)"]
    end

    Client -->|HTTPS / Port 443| CFDNS
    CFDNS -->|Static Asset Request| CFPages
    CFDNS -->|API Request / Webhook| CFWorker
    CFWorker -->|Challenge Validation| Turnstile
    CFWorker -->|Encrypted Origin Tunnel / TLS| Nginx
    Nginx --> NodeAPI
    NodeAPI -->|Enqueue CI Event| Redis
    Redis --> BullMQWorker
    NodeAPI -->|withTenantContext(sub)| PG
    BullMQWorker -->|withTenantContext(sub)| PG
    BullMQWorker -->|Pre-flight Budget Reservation| PG
    BullMQWorker -->|Single Provider Request| Anthropic
    GitHub -->|Signed Webhook HMAC-SHA256| CFWorker
```

---

## 2. Component Topology & Edge Responsibilities

### A. Cloudflare Pages (Frontend Hosting)
- **Artifact:** Compiled Single Page Application (`frontend/dist`).
- **Routing Rules:** Configured via `frontend/public/_routes.json` to handle client-side routing while serving `/assets/*` as immutable static cache assets.
- **Security Headers:** Enforced at the CDN edge via `frontend/public/_headers`:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
  - Strict `Content-Security-Policy` with Cloudflare Turnstile whitelist.
- **Cache Strategy:** Assets under `/assets/*` cached for 1 year (`max-age=31536000, immutable`).

### B. Cloudflare Edge Gateway Worker (`hopper-edge`)
- **Script:** `deploy/cloudflare/worker.ts` executed via V8 isolates across 300+ global data centers.
- **Reverse Proxying:** Forwards all `/api/*` traffic to `ORIGIN_API_URL` via Cloudflare's optimized edge routing backbone.
- **Edge Caching:** Caches high-volume read endpoints:
  - `GET /api/health`: Edge cache for 15s with `stale-while-revalidate=30s`.
  - `GET /api/signatures/stats`: Edge cache for 60s.
- **Edge Telemetry:** Injects `X-Edge-Colo` (e.g., `BOM`, `DEL`, `BLR`), `X-Edge-Country`, and `X-Edge-Latency-Ms` into HTTP response headers.
- **Bot Defense:** Intercepts unauthenticated sandbox analysis requests (`POST /api/diagnose/sandbox`) and validates the `cf-turnstile-response` header against Cloudflare Turnstile before admitting traffic to the origin.

### C. Origin Backend (Node.js + PostgreSQL + Redis)
- **Node.js Express API:** Runs the Hopper backend on port 3000. Handles authentication, JWT issuance, workspace RBAC, and webhook ingestion.
- **PostgreSQL 16 with pgvector:** Authoritative database running dedicated unprivileged runtime user `hopper_app` (`NOSUPERUSER`, `NOBYPASSRLS`). All 11 tables enforce `FORCE ROW LEVEL SECURITY`. Every database operation executes within a transaction where the tenant context is injected using `SELECT set_config('request.jwt.claim.sub', userId, true)`.
- **Redis 7:** Manages BullMQ job queues, idempotency tracking, distributed locks, and token-bucket rate limiting.
- **AI Budget Controller:** Durably tracks monthly model spend with pessimistic `SELECT ... FOR UPDATE` row locks against `ai_budget_ledgers`, enforcing a $475 nominal admission cap and a $500 hard spending limit.

---

## 3. India-First Latency & Distribution Architecture

The primary initial commercial and validation market is India (small software companies, startup engineering teams, and independent developers in Bangalore, Mumbai, Delhi-NCR, Hyderabad, Pune, and Chennai).

### Cloudflare Edge PoP Alignment
Cloudflare maintains native Anycast points of presence (PoPs) across Indian tier-1 tech hubs:
1. **BOM** (Mumbai)
2. **DEL** (Delhi-NCR)
3. **BLR** (Bengaluru)
4. **MAA** (Chennai)
5. **HYD** (Hyderabad)
6. **CCU** (Kolkata)

### Latency Optimization Strategy
1. **Frontend Static Delivery:** 100% of HTML, CSS, JavaScript, and SVG assets are delivered from the nearest Indian edge PoP, yielding a sub-20ms Time to First Byte (TTFB).
2. **Edge SSL Handshake:** TLS 1.3 handshakes terminate at the local Indian PoP, eliminating roundtrips to transatlantic origin servers.
3. **HTTP Keep-Alive Tunneling:** Persistent TCP/TLS connections maintained between Cloudflare edge servers and origin backend.
4. **Code Splitting:** Rollup `manualChunks` partition the frontend into discrete vendor modules (`vendor-react`, `vendor-query`, `vendor-icons`, `vendor-zod`), shrinking initial bundle payload to 255 kB (67 kB gzipped).

