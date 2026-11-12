# Vercel Deployment Runbook

End-to-end procedure to deploy Hopper on Vercel (Hobby-compatible). Every step
below was written against the code in this repository; steps marked **BLOCKED**
in `VERCEL_MIGRATION_EXECUTION.md` have not been executed because they need
account access.

---

## 0. Preconditions

| Requirement | Check |
|---|---|
| Node.js ≥ 20 | `node -v` |
| Vercel CLI | `npx vercel --version` (or `npm i -g vercel`) |
| Vercel account authenticated | `npx vercel whoami` |
| Supabase project with pgvector | `select * from pg_extension where extname='vector';` |
| GitHub App created | App ID + private key + webhook secret |
| Repository pushed to GitHub | Vercel Git integration needs it |

> **Hobby plan note.** Vercel Hobby is for non-commercial personal use. Do not
> enable paid tiers, paid add-ons, or commercial billing flows as part of a Hobby
> deployment.

---

## 1. Rotate exposed credentials first

The repository's history contains a GitHub App client secret and webhook secret
that were embedded in a `package.json` script. They are compromised regardless of
whether they still work.

1. GitHub App → **Client secrets** → regenerate.
2. GitHub App → **Webhook** → new secret.
3. GitHub App → **Private keys** → generate, delete the old one.
4. Delete the local `.env.backup`.

**Do not deploy before this is done.**

---

## 2. Link the project

```bash
npx vercel login
npx vercel link            # create or select the project
```

- Framework preset: **Other** (the repo declares `framework: null`).
- Root directory: repository root.
- Build command / output are read from `vercel.json` (`npm run build:vercel`,
  `frontend/dist`).

Verify the link produced `.vercel/project.json` and that it is **gitignored**.

---

## 3. Configure environment variables

Set every required variable per environment (`preview`, `production`) in
**Project → Settings → Environment Variables**, or via CLI:

```bash
npx vercel env add DATABASE_URL production      # prompts for the value
npx vercel env add SUPABASE_JWT_SECRET production
# ... repeat for every row marked "Yes" in the register
```

Authoritative list: `docs/deployment/VERCEL_ENVIRONMENT_VARIABLES.md`.

Minimum viable production set:

```
NODE_ENV=production
APP_URL=https://<your-domain>
FRONTEND_URL=https://<your-domain>
CORS_ALLOWED_ORIGINS=https://<your-domain>
DATABASE_URL=<pooled, port 6543>
DIRECT_URL=<direct, port 5432>
QUEUE_STORE=postgres
QUEUE_TRANSPORT=auto
COORDINATION_BACKEND=postgres
SUPABASE_URL=...
SUPABASE_JWT_SECRET=...            # or SUPABASE_JWT_PUBLIC_KEY
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
GITHUB_APP_ID=...
GITHUB_APP_CLIENT_ID=...
GITHUB_APP_CLIENT_SECRET=...
GITHUB_APP_WEBHOOK_SECRET=...
GITHUB_APP_PRIVATE_KEY=...
AI_PROVIDER=openai|anthropic|mock
AI_MODEL=...
OPENAI_API_KEY=... | ANTHROPIC_API_KEY=...
CRON_SECRET=<random 32+ bytes>
```

Never set a secret with a `VITE_` prefix.

---

## 4. Apply database migrations

Run once per environment, from a trusted machine (not from a Vercel function):

```bash
DIRECT_URL='postgresql://...:5432/postgres' npm run migrate
```

- Migrations are forward-only and idempotent (`CREATE TABLE IF NOT EXISTS`,
  `CREATE OR REPLACE FUNCTION`).
- `0010_durable_queue_and_coordination.sql` creates the queue outbox, dead-letter
  ledger, webhook delivery claims, rate-limit windows, diagnosis locks and the
  processed-event ledger.
- Verify:

```sql
select count(*) from hopper_job_queue;
select proname from pg_proc where proname like 'hopper_%' order by 1;
```

Expected functions: `hopper_acquire_diagnosis_lock`, `hopper_claim_jobs`,
`hopper_claim_processed_event`, `hopper_claim_webhook_delivery`,
`hopper_consume_rate_limit`, `hopper_prune_queue_coordination`,
`hopper_reap_expired_job_locks`, `hopper_release_diagnosis_lock`,
`hopper_release_processed_event`.

**Prefer a preview/staging database before production.**

---

## 5. Build and deploy

```bash
npx vercel pull --yes --environment=preview
npx vercel build
npx vercel deploy --prebuilt            # preview URL
```

Production promotion happens through the Vercel Git integration on merge to
`main`, or explicitly:

```bash
npx vercel pull --yes --environment=production
npx vercel build --prod
npx vercel deploy --prebuilt --prod
```

`api/index.ts`, `api/queue/consume.ts` and `api/cron/queue-drain.ts` are built by
Vercel's Node builder; they also bundle cleanly stand-alone (verified with
esbuild).

---

## 6. Verify the deployment

### 6.1 Static + API

```bash
BASE=https://<deployment-url>
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/"            # 200, HTML
curl -sS "$BASE/api/health" | jq '{status, database, region}' # ok / true / bom1
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/api/dashboard/demo"  # 401/403 without JWT
```

Health must report the database as reachable and the region as `bom1`
(or whatever you configured).

### 6.2 Security expectations

| Request | Expected |
|---|---|
| `POST /api/webhooks/github` without `X-Hub-Signature-256` | `401` |
| …with a wrong signature | `401` |
| Foreign `Origin` on a state-changing request | `403` |
| Unknown `/api/*` path | JSON `404`, not HTML |
| `POST /api/webhooks/github` valid but oversized body | `413` |

### 6.3 Queue registration

```bash
npx vercel env ls production        # confirm queue-related vars
npx vercel inspect <deployment-url> # confirm functions + triggers
```

The `api/queue/consume.ts` function must show the `hopper-ci-events` queue trigger
(`queue/v2beta`). A deployment without the trigger still persists events (outbox)
but nothing consumes them until the daily cron drain.

### 6.4 Queue publish → consume

1. Deliver a real `workflow_job` failure webhook (or use `?sync=true` for a
   synchronous path check).
2. In the database:

```sql
select id, status, attempts, last_error from hopper_job_queue order by created_at desc limit 5;
select count(*) from hopper_job_dead_letters;
```

3. Expect `status='done'`, `attempts>=1`, empty dead-letter table.
4. Check runtime logs for the consumer invocation and absence of retries.

### 6.5 Cron backstop

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/queue-drain"
```

Without the header the endpoint must return `401`; with `CRON_SECRET` unset it
must return `503` (fail closed, never drain unauthenticated).

### 6.6 Webhooks from providers

- GitHub App → **Advanced → Recent Deliveries**: point the URL at
  `https://<domain>/api/webhooks/github`, redeliver, expect `202` and a new queue
  row.
- Stripe → **Webhooks**: endpoint `https://<domain>/api/webhooks/stripe`,
  subscribe to `checkout.session.completed`,
  `customer.subscription.updated|deleted`; redeliver, expect `200` and an
  idempotent no-op on the second delivery.

---

## 7. Post-deploy checklist

- [ ] `/api/health` 200 with `database: true`
- [ ] Region matches the database region
- [ ] Unauthenticated tenant endpoints return 401/403
- [ ] Cross-tenant access returns 403/404 (no data leakage)
- [ ] Queue trigger visible on the consumer function
- [ ] One event published → consumed → diagnosed → PR comment posted
- [ ] Dead-letter table empty
- [ ] Cron endpoint rejects unauthenticated calls
- [ ] Rollback target recorded (previous deployment ID/URL)
- [ ] No secret value appears in logs or in the client bundle
      (`grep -r "sk_live\|ghp_\|service_role" frontend/dist` → no matches)

---

## 8. Failure handling

| Symptom | Diagnosis | Action |
|---|---|---|
| Boot error "Configuration validation failed" | Missing required env var | Set it, redeploy (env changes need a new deployment) |
| `/api/health` 503 | Database unreachable or pooled URL wrong | Verify `DATABASE_URL` uses port 6543 |
| Webhooks 503 | Queue transport failing and inline drain failed | Check `hopper_job_queue` growth and DB connectivity |
| Jobs stuck `pending` | Consumer trigger not registered | Confirm `vercel.json` triggers, redeploy |
| Jobs stuck `processing` | Consumer crashed mid-run | Locks are reaped by `hopper_reap_expired_job_locks` (cron / next drain) |
| Duplicate PR comments | Dedup ledger bypassed | Check `hopper_processed_events` writes in the processor |
| Slow API | Region mismatch | Align `regions` with the database region |

Do not "fix" a failing health check by relaxing validation — investigate the
underlying dependency.
