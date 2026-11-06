# Vercel Setup — From Zero to a Running Preview

Condensed setup guide. For the full procedure see
`docs/deployment/VERCEL_DEPLOYMENT_RUNBOOK.md`; for variable semantics see
`docs/deployment/VERCEL_ENVIRONMENT_VARIABLES.md`.

---

## 1. Local first

```bash
git clone https://github.com/johan-droid/Hopper.git
cd Hopper
npm install                     # installs backend + frontend workspaces
cp .env.example backend/.env    # fill in values (never commit)
npm run doctor                  # preflight: Node, env, migrations, retired artifacts
npm run infra:up                # PostgreSQL 16 + pgvector only
npm run migrate                 # applies supabase/migrations/*.sql
npm run dev                     # API + queue worker + frontend
```

Verify: <http://localhost:3000/api/health> and <http://localhost:5173>.

---

## 2. Supabase

1. Create a project (choose the region closest to your users — Mumbai for India).
2. Enable `pgvector`:
   ```sql
   create extension if not exists vector;
   ```
3. Copy **Connection pooling** string → `DATABASE_URL` (port 6543).
4. Copy **Direct connection** string → `DIRECT_URL` (port 5432, migrations only).
5. Copy Project URL + anon key → `SUPABASE_URL`, `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`.
6. Copy the JWT secret (or public key) → `SUPABASE_JWT_SECRET` /
   `SUPABASE_JWT_PUBLIC_KEY`.

---

## 3. GitHub App

1. Create an App; note **App ID** and generate a **private key**.
2. Webhook URL: `https://<your-domain>/api/webhooks/github`.
3. Webhook secret: random 32+ bytes → `GITHUB_APP_WEBHOOK_SECRET`.
4. Permissions: Pull requests (write), Contents (read), Checks (read), Actions
   (read); subscribe to **Workflow run** and **Workflow job**.
5. If the credentials were ever committed, rotate them first
   (`docs/security/CREDENTIAL_ROTATION_RUNBOOK.md`).

---

## 4. Vercel project

```bash
npx vercel login
npx vercel link
npx vercel env add DATABASE_URL production     # repeat for each required variable
npx vercel pull --yes --environment=preview
npx vercel build
npx vercel deploy --prebuilt
```

`vercel.json` already declares:

- `outputDirectory: frontend/dist`, build `npm run build:vercel`
- `regions: ["bom1"]`
- `/api/(.*)` → `/api/index` rewrite
- queue trigger `hopper-ci-events` (`queue/v2beta`) on `api/queue/consume.ts`
- daily cron `0 3 * * *` → `/api/cron/queue-drain`
- security headers + immutable asset caching

---

## 5. Smoke test the preview

```bash
BASE=https://<preview-url>
curl -sS "$BASE/api/health"
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/"                 # 200
curl -sS -o /dev/null -w '%{http_code}\n' -X POST "$BASE/api/webhooks/github"  # 401
curl -sS -o /dev/null -w '%{http_code}\n' "$BASE/api/cron/queue-drain"          # 401
```

Then redeliver a real GitHub webhook and confirm:

```sql
select status, attempts from hopper_job_queue order by created_at desc limit 3;
select count(*) from hopper_job_dead_letters;   -- expect 0
```

---

## 6. Promote

Merge to the production branch (Vercel Git integration promotes automatically) or:

```bash
npx vercel pull --yes --environment=production
npx vercel build --prod
npx vercel deploy --prebuilt --prod
```

Record the deployment URL and ID. Keep the previous deployment for rollback
(`docs/deployment/VERCEL_ROLLBACK_RUNBOOK.md`).

---

## 7. Common setup mistakes

| Mistake | Effect | Fix |
|---|---|---|
| `DATABASE_URL` pointing at port 5432 | Connection exhaustion under load | Use the pooled 6543 URL at runtime |
| `SUPABASE_SERVICE_ROLE_KEY` prefixed `VITE_` | Key shipped to browsers | Never prefix secrets with `VITE_` |
| Missing `CORS_ALLOWED_ORIGINS` in production | Boot validation fails (by design) | Set it to your exact origin |
| Missing `CRON_SECRET` | Cron endpoint returns 503 | Generate and set a random secret |
| Region mismatch (`bom1` vs non-Mumbai DB) | 150–250 ms per query | Align `regions` with the database |
| Enabling Stripe on Hobby for real customers | Plan-terms violation | Upgrade to Pro first |
