# Vercel Hobby — Cost, Quotas and Upgrade Triggers

Cost model for Hopper on Vercel Hobby with Supabase, Stripe and an AI provider.
Figures reflect the platform terms in force at the time of the migration and are
**estimates to validate**, not invoices.

---

## 1. Vercel Hobby

| Resource | Hobby allowance | Hopper's usage pattern |
|---|---|---|
| Deployments | Unlimited (personal use) | Git-integration deploys per PR/merge |
| Function invocations | Included monthly allotment | One per API request + one per queue message |
| Function duration | Per-execution cap on Hobby | `maxDuration: 60` configured; typical request < 1 s |
| Function memory | Configurable up to plan cap | 1024 MB API/consumer, 512 MB cron |
| Bandwidth | Monthly allotment | Static SPA assets + JSON |
| Cron jobs | **2 jobs, once per day each on Hobby** | 1 job: `0 3 * * *` queue drain |
| Regions | Single region per deployment on Hobby | `bom1` (Mumbai) |
| Commercial use | **Not permitted on Hobby** | See §7 |

### Queue operations (Vercel Queues, public beta)

| Item | Value |
|---|---|
| Availability | Public beta on **all** plans, Hobby included |
| Hobby included operations | **First 1,000,000 queue API operations / month** |
| Default retention | 24 hours (extendable to 7 days) |
| Delivery | At-least-once, push invocation of the consumer function |
| Dead-letter queue | **None** — Hopper implements one in PostgreSQL |

Operation accounting is per publish/consume/ack interaction, so a single failure
event typically costs a handful of operations. 1M operations/month is far beyond
a personal or small-team volume (order of 100k CI failures/month).

### Function-duration budget

```
1 webhook  ≈ 1 invocation  (persist outbox + publish)          ~200–400 ms
1 job      ≈ 1 invocation  (fetch log + AI + persist + PR)      ~2–8 s
cron       ≈ 1 invocation/day (bounded batch, default 10 jobs)  ≤ 60 s
```

**Design consequence:** the daily-cron-only restriction is why the queue push
consumer exists. A 24h drain would be unacceptable as the primary path, so push
delivery carries the workload and cron only reaps crashed consumers.

---

## 2. Supabase

| Item | Free tier (typical) | Notes |
|---|---|---|
| Database size | 500 MB | pgvector embeddings are the main growth vector |
| Compute | Shared, pauses on inactivity (free) | Cold start after idle |
| Connections | Pooled (pgbouncer) | `DATABASE_URL` uses port 6543 |
| Backups | Limited retention on free | PITR is a paid feature |
| Egress | Metered | Log payloads stay small (300 KB cap) |

Hopper's per-failure storage is dominated by the log excerpt (capped at 300 KB
pre-scrub) and a 1536-dim embedding (~6 KB). Plan for growth from failure volume,
not from users.

**Connection math:** each function instance opens at most `DB_POOL_MAX` (10)
connections; the pooler is the global limiter. Keep concurrency modest — the
consumer processes a bounded batch.

---

## 3. AI providers (the dominant variable cost)

| Provider | Typical model | Approx. cost per diagnosis |
|---|---|---|
| OpenAI | `gpt-4o-mini` | ~$0.0003–0.002 (depends on log length) |
| Anthropic | `claude-3-5-haiku` | ~$0.001–0.003 |
| Deterministic (`mock`) | none | **$0** |

- The pipeline trims logs before sending (tail-slice + scrub), so token counts are
  bounded by design.
- `AI_MONTHLY_BUDGET_USD` is enforced by the ledger in `budget-controller.ts`;
  exceeding it forces the deterministic path instead of spending.
- Set `AI_PROVIDER=mock` on preview deployments to keep previews free.

Rough envelope: 1,000 failures/month at ~$0.002 ≈ **$2/month**. 100,000
failures/month ≈ **$200/month** — this, not Vercel, is the first real cost.

---

## 4. Stripe

| Item | Cost |
|---|---|
| Account, test mode, webhooks | $0 |
| Successful charge | 2.9% + $0.30 (region-dependent) |
| Failed/declined | $0 |

Stripe costs are transactional, not infrastructure. Leaving Stripe unset keeps
the app in the free-validation path (no billing operations occur).

---

## 5. GitHub

| Item | Cost |
|---|---|
| GitHub App, webhooks, installation tokens | $0 |
| Actions minutes consumed by Hopper's CI | Counts against the repo's plan quota |

Hopper's own CI runs typecheck, tests, migrations and security scans on each PR —
that is the only meaningful GitHub cost, and it is bounded by PR volume.

---

## 6. Total monthly estimate

### Personal / evaluation (this migration's target)

| Component | Monthly |
|---|---|
| Vercel Hobby | $0 |
| Vercel Queues (within 1M ops) | $0 |
| Supabase free | $0 |
| AI (`mock`, or light OpenAI usage) | $0–2 |
| Stripe (unused) | $0 |
| **Total** | **$0–2** |

### Small commercial team (would require Pro)

| Component | Monthly |
|---|---|
| Vercel Pro | ~$20/seat |
| Supabase Pro | ~$25 |
| AI at 10k failures | ~$20 |
| Stripe | % of revenue |
| **Total** | **~$65 + transaction fees** |

---

## 7. Plan restriction — read before enabling billing

**Vercel Hobby is for non-commercial personal use.** Hopper contains Stripe
checkout and subscription tiers. Running paying customers on Hobby violates the
plan terms regardless of the traffic level.

Therefore:

- Commercial operation requires **Vercel Pro** (and a Supabase plan matching the
  SLA you sell).
- No paid resource, add-on or plan upgrade was activated during this migration.
- The billing code path is preserved but inert until `STRIPE_*` variables are set.

---

## 8. Upgrade triggers

| Trigger | Threshold | Action |
|---|---|---|
| Commercial customers | Any paying user | Vercel Pro (required, not optional) |
| Cron frequency | Need sub-daily backstop | Pro (Hobby allows once/day) |
| Function duration | Jobs exceeding 60 s | Pro for longer `maxDuration`; first reduce batch size |
| Queue operations | Approaching 1M/month | Pro, or reduce publish/consume chatter |
| Database size | > 500 MB | Supabase paid tier |
| Connection pressure | Pooler saturation | Raise `DB_POOL_MAX` carefully or upgrade compute |
| AI spend | > budget ceiling | Raise budget or accept deterministic fallback |
| Multiple regions | Latency outside India | Pro (multi-region) |

---

## 9. Free-tier safety rails implemented

1. Bounded queue batch (`QUEUE_DRAIN_BATCH=10`) on the cron path.
2. Log extraction capped at 300 KB before scrubbing and before any model call.
3. AI budget ledger blocks spending past the configured ceiling.
4. `AI_PROVIDER=mock` is the default — no accidental spend.
5. One cron job only, once per day.
6. Webhook acknowledgement does not retry inline indefinitely; it fails fast with
   503 so GitHub retries on its own schedule instead of burning function time.
7. Preview environments are intended to run with `mock` AI and a separate
   database.
