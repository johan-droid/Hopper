> **Historical document (pre-Vercel).** This file describes the retired
> Cloudflare architecture and is retained as an audit trail. The current
> architecture is `docs/architecture/VERCEL_TARGET_ARCHITECTURE.md`; operations
> are in `docs/deployment/VERCEL_DEPLOYMENT_RUNBOOK.md`. Links to
> Cloudflare-era files are intentionally dead — see
> `docs/deployment/CLOUDFLARE_REMOVAL_AUDIT.md` for the mapping.

# Credential Rotation Runbook

**Trigger:** any credential that has ever been committed, pasted into a backup
file, printed in a log, or shared in a screenshot must be treated as compromised.

**Rule:** rotation is a revocation event, not a find-and-replace. Generate new
material, deploy it, verify, then revoke the old material.

---

## 0. Pre-flight

- [ ] Confirm you are the GitHub App owner (or an org owner).
- [ ] Confirm access to: GitHub App settings, Vercel project settings, Supabase
      project settings, Stripe dashboard, OpenAI/Anthropic consoles.
- [ ] Have a maintenance window for the webhook secret swap (deliveries signed
      with the old secret fail immediately after the change).
- [ ] Never paste secret values into chat, tickets, commits, screenshots or
      shell history. Use `read -s`, a password manager, or the provider UI.

---

## 1. GitHub App credentials — CRITICAL (do first)

Exposure: client secret and webhook secret were embedded in a committed npm
script; client ID is public.

1. GitHub → **Settings → Developer settings → GitHub Apps → Hopper → Edit**.
2. **Client secrets** → *Generate a new client secret*.
3. **Webhook** → *Webhook secret* → set a fresh high-entropy value (32+ bytes).
4. **Private keys** → *Generate a private key* (regenerate unconditionally; a
   PEM block appeared in a mangled `.env.backup`). Download once; it cannot be
   re-downloaded.
5. Update Vercel Project Settings (Production **and** Preview):
   - `GITHUB_APP_ID`
   - `GITHUB_APP_CLIENT_ID` (if the app was recreated)
   - `GITHUB_APP_CLIENT_SECRET`
   - `GITHUB_APP_WEBHOOK_SECRET`
   - `GITHUB_APP_PRIVATE_KEY` (full PEM, `\n` escaped or multiline as the
     provider expects)
6. Redeploy (`Deployments → Redeploy`) so functions pick up the new values.
   Environment changes do **not** apply to already-running deployments.
7. Verify: GitHub App → **Advanced → Recent Deliveries → Redeliver** a
   `workflow_job` event. Expect `202 queued`.
8. Revoke the old client secret in the GitHub UI (delete it).
9. Audit: GitHub App → installations, and the org audit log for the exposure
   window.

**Acceptance:** a redelivered ping returns `200`, a redelivered `workflow_job`
returns `202`, and an unsigned request returns `401`.

---

## 2. JWT verification key (Supabase)

1. Supabase → **Project Settings → API → JWT Settings**.
2. Rotate the JWT secret (this invalidates all sessions — announce it).
3. Update `SUPABASE_JWT_SECRET` (HS256) **or** `SUPABASE_JWT_PUBLIC_KEY`
   (RS256/ES256) in Vercel for both environments.
4. Update `VITE_SUPABASE_ANON_KEY` if Supabase rotated the anon key.
5. Redeploy. Verify: sign in, load `/api/user/profile`, then sign out.
6. Confirm an expired/forged token still returns `401`.

**Acceptance:** valid session works; tampered signature, wrong `aud`, wrong
`iss`, and expired `exp` are all rejected.

---

## 3. Database credentials (Supabase PostgreSQL)

1. Supabase → **Project Settings → Database → Reset database password**.
2. Update `DATABASE_URL` (pooled, port 6543) and `DIRECT_URL` (direct, 5432).
3. Redeploy; verify `/api/health` reports `database: healthy`.
4. Verify the unprivileged runtime role (`hopper_app`) still connects and that
   RLS is enforced (see `docs/engineering/RLS_VERIFICATION.md`).
5. Run `npm --prefix backend run migrate` against the direct URL to confirm DDL
   access is intact.

---

## 4. Stripe

1. Stripe → **Developers → API keys** → *Roll secret key*.
2. Stripe → **Webhooks → endpoint → Roll signing secret**.
3. Update `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` in Vercel.
4. Redeploy; send a test event from the Stripe dashboard.
5. Verify: duplicate event IDs are `duplicate_ignored`, invalid signatures are
   `400`, unknown customers produce `customer_not_found` without 5xx.

**Note:** Hopper runs in free-validation mode when Stripe is unset; rotating
Stripe keys must not break non-billing flows.

---

## 5. AI providers

1. OpenAI → **API keys** → revoke the exposed key, create a replacement.
2. Anthropic → **API keys** → revoke, create a replacement.
3. Update `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`; set `AI_PROVIDER` to exactly
   one of `openai | anthropic | mock`.
4. Redeploy; run an ad-hoc diagnosis and confirm telemetry `provider` matches
   the configured provider (never a silent cross-provider call).
5. Verify the monthly AI budget ledger still admits/settles correctly
   (`ai_budget_ledgers`, `ai_cost_reservations`).

---

## 6. Vercel / cron

1. Vercel → **Settings → Environment Variables** → rotate `CRON_SECRET`.
2. Redeploy. Verify the drain endpoint rejects a wrong token (`401`) and accepts
   the configured one.
3. Rotate the Vercel access token if one was ever committed to CI.

---

## 7. Retired platforms

- [ ] Cloudflare API token / account id: **revoke** if they ever existed; the
      application no longer uses them.
- [ ] Delete Cloudflare Pages/Workers projects and any `cloudflared` tunnel
      credentials from developer machines.
- [ ] Redis: delete any hosted Redis instance and its credentials; the
      architecture no longer requires Redis.

---

## 8. Post-rotation verification checklist

| Check | Command / action | Expected |
|---|---|---|
| Webhook signature | redeliver a `workflow_job` | `202 queued` |
| Unsigned webhook | `curl -X POST /api/webhooks/github` | `401` |
| Stripe signature | dashboard test event | `200` |
| JWT rejection | forged token | `401` |
| Health | `GET /api/health` | `status: healthy` |
| Queue | `GET /api/health` → `dependencies.queue` | `isHealthy: true` |
| Drain auth | `GET /api/cron/queue-drain` without token | `401` |
| Production boot | redeploy | no missing-env throw |

---

## 9. Rollback

Environment-variable changes are reversible by restoring the previous value in
Vercel and redeploying. **Revoked credentials are not reversible** — if a
rotation breaks production, restore service by deploying the previous *value*
only if it was not revoked; otherwise fix forward with the new credential.

---

## 10. Record keeping

Log, in the private operations channel (never in the repository):

- date/time of rotation,
- credential class,
- who performed it,
- deployment ID used to verify,
- any anomalies found during the exposure-window audit.
