# Vercel Rollback Runbook

Rollback strategy for Hopper on Vercel. Rollback is **code-only and immediate**;
database migrations are **forward-only** and are never reversed destructively.

---

## 1. Triggers

Roll back when any of these persist after a deployment:

- `/api/health` returns non-200 or reports the database unreachable.
- Webhook ingress returns 5xx for valid GitHub/Stripe deliveries.
- Queue jobs accumulate in `pending` without consumption.
- A tenant-isolation or authorization regression is observed.
- Error rate or latency regresses beyond the previous deployment.

---

## 2. Fast rollback (recommended, < 1 minute)

### Dashboard

Vercel → Project → **Deployments** → select the last known-good deployment →
**⋯ → Promote to Production** (or **Instant Rollback**).

Promotion re-points the production alias at the previous immutable build. No
rebuild, no code change.

### CLI

```bash
npx vercel ls --prod                 # list recent production deployments
npx vercel promote <deployment-url>  # re-point production to a known-good build
npx vercel rollback                  # CLI-supported rollback to previous deployment
```

Record the deployment URL and ID you rolled back to, and the one you rolled back
from.

---

## 3. What rollback does and does not cover

| Layer | Covered by code rollback? | Notes |
|---|---|---|
| Frontend bundle | Yes | Immutable static assets |
| API functions | Yes | Immutable function builds |
| Queue consumer function | Yes | Old consumer must remain compatible with the new schema |
| Queue triggers | Yes | Part of the deployment config |
| Environment variables | **No** | Env changes are project-scoped, not deployment-scoped |
| D1/Durable Objects | N/A | Cloudflare removed |
| PostgreSQL schema | **No** | Forward-only; see §5 |
| Vercel Queues contents | **No** | Already-published messages persist and will be consumed by whichever consumer is live |

**Compatibility rule:** the consumer must tolerate messages written by the
*previous* producer for at least one release. `QueueMessage` is versioned and
validated with Zod; the parser ignores unknown optional fields and rejects only
missing required ones (`jobId`, `queueName`, `idempotencyKey`).

---

## 4. Rollback during a queue incident

1. **Stop new work from entering the pipeline** (no data loss):

   ```bash
   npx vercel env add QUEUE_TRANSPORT off production
   ```

   With `QUEUE_TRANSPORT=off`, webhooks still persist to the PostgreSQL outbox and
   return 202; publishing is skipped deliberately (the payload is not lost —
   `hopper_job_queue` is the system of record).

2. Promote the last good deployment.
3. Re-enable transport:

   ```bash
   npx vercel env rm QUEUE_TRANSPORT production      # or re-add with value "auto"
   npx vercel --prod                                 # redeploy to pick up the change
   ```

4. Drain the backlog via the cron endpoint (attempts are safe to repeat —
   processing is idempotent):

   ```bash
   curl -sS -X POST -H "Authorization: Bearer $CRON_SECRET" \
     https://<domain>/api/cron/queue-drain
   ```

5. Confirm `hopper_job_queue` pending rows drain to zero and
   `hopper_job_dead_letters` stays empty.

---

## 5. Database rollback policy

Migrations are **forward-only**. Never `DROP` a table or column that a deployed
release still reads.

| Situation | Action |
|---|---|
| New migration is additive (new tables/functions) | Keep it; old code ignores new objects |
| New migration breaks old code (rename/drop) | Do **not** roll back the deployment blindly — ship a compensating migration |
| Bad data written by a buggy release | Repair with a targeted, reviewed SQL fix; restore from Supabase PITR if required |
| Migration itself failed midway | Inspect `schema_migrations`; apply the idempotent remainder (`CREATE ... IF NOT EXISTS`) |

For any destructive change: take a Supabase backup/snapshot first, deploy the
compensating code path, and only then remove the old objects in a later release.

---

## 6. Environment variable rollback

Variables are not versioned per deployment:

1. Record the current values (names only — never echo secrets).
2. Restore the previous values in **Settings → Environment Variables**.
3. **Redeploy** — running deployments keep the values they were built with.

If a secret was leaked, rotate it (see `docs/security/CREDENTIAL_ROTATION_RUNBOOK.md`)
rather than restoring the old value.

---

## 7. Post-rollback verification

- [ ] `/api/health` 200, `database: true`
- [ ] Frontend loads; assets 200; no console errors
- [ ] Authenticated dashboard request succeeds for a real tenant
- [ ] Unauthenticated request still 401
- [ ] GitHub webhook redelivery returns 202
- [ ] Stripe redelivery is an idempotent no-op
- [ ] Queue consumer invocations appear in runtime logs
- [ ] `hopper_job_dead_letters` empty; `hopper_job_queue` draining
- [ ] Cron endpoint 401 without `CRON_SECRET`

---

## 8. Failed-deployment prevention

- Vercel never promotes a failed build; a red build leaves production untouched.
- `.github/workflows/ci.yml` gates typecheck, tests, migrations and Vercel-config
  validity before merge.
- `.github/workflows/security.yml` fails on high-severity advisories and on any
  tracked env file.
- Preview deployments are validated before merging to the production branch.
- Only the Vercel Git integration deploys — there is no second deployer that can
  push an unverified build.
