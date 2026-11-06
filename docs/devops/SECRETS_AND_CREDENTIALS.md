> **Historical document (pre-Vercel).** This file describes the retired
> Cloudflare architecture and is retained as an audit trail. The current
> architecture is `docs/architecture/VERCEL_TARGET_ARCHITECTURE.md`; operations
> are in `docs/deployment/VERCEL_DEPLOYMENT_RUNBOOK.md`. Links to
> Cloudflare-era files are intentionally dead — see
> `docs/deployment/CLOUDFLARE_REMOVAL_AUDIT.md` for the mapping.

# Hopper Secrets Management & Credential Governance

## 1. Secrets Management Philosophy

Hopper adheres strictly to least-privilege credential isolation:
1. **Zero Secret Printing:** Environment variables and secrets are never printed, echoed, or included in CI/CD terminal artifacts.
2. **Environment Isolation:** Staging and production credentials reside in strictly separated GitHub Environments (`staging` vs `production`).
3. **Short-Lived & Scoped Credentials:** Third-party API tokens are granted the minimum scopes required for deployment and verification.
4. **Automated Commit Gate:** `scripts/ci/verify-no-committed-secrets.py` blocks PRs containing leaked keys or improperly tracked `.env` files.

---

## 2. Secrets Register (Names & Scopes Only)

The following register documents the required secrets across GitHub Actions and runtime environments. **No secret values are stored or documented in source control.**

| Secret Identifier | Target Scope / Environment | Description & Permission Requirements | Rotation SLA |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | GitHub Repo Secret / Staging / Prod | API token for Cloudflare Pages and Workers. Scopes: `Account:Pages:Edit`, `Account:Workers:Edit`, `Zone:Workers Routes:Edit` | 90 days |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Variable / Environment | Cloudflare Account Identifier (non-sensitive identifier) | N/A |
| `CLOUDFLARE_TURNSTILE_SECRET_KEY` | Environment Secret (`production`) | Server-side secret key for Turnstile siteverify API | 180 days |
| `JWT_SECRET` | Backend Runtime Origin | 64-character cryptographic secret for signing user session JWTs | 180 days |
| `GITHUB_WEBHOOK_SECRET` | Backend Runtime Origin | Shared secret for verifying GitHub HMAC-SHA256 webhook signatures | 180 days |
| `DATABASE_URL` | Backend Runtime Origin | PostgreSQL connection string for unprivileged `hopper_app` runtime role | 90 days |
| `REDIS_URL` | Backend Runtime Origin | Redis connection string for BullMQ queue and locks | 90 days |
| `ANTHROPIC_API_KEY` | Backend Runtime Origin | API key for Anthropic Claude 3.5 Haiku (gated by $500 monthly budget controller) | 90 days |

---

## 3. GitHub Actions Least Privilege Configuration

All workflow files in `.github/workflows/` declare minimal explicit permissions:

```yaml
permissions:
  contents: read # Default baseline for all CI jobs
```

- **PR Workflows:** Strictly read-only access. Cannot access environment secrets from `production`.
- **Staging Deployment:** Scoped to the `staging` environment.
- **Production Deployment:** Scoped to the protected `production` environment, requiring explicit authorization.
