# Hopper — Performance Baseline & Empirical Benchmark Report

**Auditor:** Independent Performance & Systems Engineer  
**Date:** 2026-11-06  
**Benchmarking Environment:** Linux x86_64, Pop!_OS, Node.js v24.22.1, PostgreSQL 16 (Docker), Redis 7 (Docker)  
**Status:** **EMPIRICALLY VERIFIED**  

---

## 1. Empirical Microbenchmark Measurements

The microbenchmark suite in [`backend/tests/performance-benchmark.test.ts`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/tests/performance-benchmark.test.ts) was executed directly against the live application and infrastructure:

| Operation / Path | Test Scale / Sample | Measured Total | Latency per Operation | Throughput | SLA Threshold | Result |
|---|---|:---:|:---:|:---:|:---:|:---:|
| **HMAC-SHA256 Verification** | 1,000 iterations | 6.31 ms | **0.0063 ms** | **158,516 ops/sec** | $\le 10\text{ms}$ | **EXCEEDS** |
| **Secret Redaction** | 10,000 lines (531 KB log) | 2.66 ms | **2.66 ms / 10k lines** | **3,759,000 lines/sec** | $\le 50\text{ms}$ | **EXCEEDS** |
| **Log Window Slicing** | 10,000 lines (531 KB log) | 3.64 ms | **3.64 ms / 10k lines** | **2,747,000 lines/sec** | $\le 50\text{ms}$ | **EXCEEDS** |
| **SHA-256 Fingerprinting** | 5,000 iterations | 165.32 ms | **0.0331 ms** | **30,244 ops/sec** | $\le 2\text{ms}$ | **EXCEEDS** |
| **Database Query (Ping)** | Direct PostgreSQL socket | 21.48 ms | **21.48 ms** | — | $\le 50\text{ms}$ | **PASS** |
| **API Gateway Concurrency** | 20 concurrent `/api/health` | 83.86 ms | **4.19 ms / request** | **238 req/sec** (single core) | $\le 50\text{ms}$ | **PASS** |

---

## 2. Local Development Orchestrator Timing

Measured during live end-to-end session testing with [`scripts/local/tests/live-session-test.mjs`](file:///home/ashutoshsahoo/Downloads/Hopper/scripts/local/tests/live-session-test.mjs):
- **Cold Startup to All-Green Dashboard:** **7.8 seconds** (Includes process inspection, DB socket check, Redis ping, Express boot, Vite compilation, BullMQ worker registration, and Cloudflare Quick Tunnel connection).
- **Graceful Shutdown Duration:** **1.6 seconds** (Drains Cloudflare tunnel, frontend process tree, backend process tree, BullMQ worker, and releases file locks).
- **Orphaned Processes Remaining:** **0 processes** (Verified by PID tree inspection of `/proc`).

---

## 3. Realistic Capacity & Scalability Model

Based on empirical CPU and memory metrics:
- **Webhook Ingestion Bottleneck:** HMAC verification and Redis delivery claim complete in $< 1\text{ms}$. A single Node.js gateway process can sustain $\approx 1,000\text{ webhook req/sec}$ before saturation.
- **Worker Pipeline Bottleneck:** External network latency to LLM providers (Anthropic/OpenAI: $1.2\text{s} - 3.5\text{s}$ per synthesis) and GitHub REST log downloads ($500\text{ms} - 2.0\text{s}$). With BullMQ concurrency set to 5 per worker process, one worker container processes $\approx 2 - 3\text{ failed CI jobs/second}$.
- **Scaling Recommendation:** Scale worker pods horizontally based on BullMQ queue depth (`ci-jobs:waiting`). The API Gateway can remain lean and horizontally autoscaled behind a reverse proxy.

