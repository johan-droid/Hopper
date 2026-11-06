> **Historical document (pre-Vercel).** This file describes the retired
> Cloudflare architecture and is retained as an audit trail. The current
> architecture is `docs/architecture/VERCEL_TARGET_ARCHITECTURE.md`; operations
> are in `docs/deployment/VERCEL_DEPLOYMENT_RUNBOOK.md`. Links to
> Cloudflare-era files are intentionally dead — see
> `docs/deployment/CLOUDFLARE_REMOVAL_AUDIT.md` for the mapping.

# Secret Exposure Audit — Hopper

**Date:** 2026-11-06
**Scope:** entire repository, working tree and committed history
**Status:** exposures removed from the working tree; **rotation is still required** and is tracked in [CREDENTIAL_ROTATION_RUNBOOK.md](./CREDENTIAL_ROTATION_RUNBOOK.md).

> No secret value is reproduced anywhere in this document. Only location, type,
> length class and remediation status are recorded.

---

## 1. Executive summary

The public repository contained **live-looking GitHub App credentials embedded in
an npm script**. Because the repository is public, every value below must be
treated as **compromised**, regardless of whether it still works. Removing a
secret from the working tree does not undo the exposure: the values remain in
git history and in any clone, fork or cache.

| ID | Credential | Severity | Location | In working tree now | Rotated |
|----|-----------|----------|----------|--------------------|---------|
| S1 | GitHub App client secret (40 hex chars) | **CRITICAL** | `backend/package.json` → `scripts.dev` | Removed | **NO — required** |
| S2 | GitHub App webhook secret (64 hex chars) | **CRITICAL** | `backend/package.json` → `scripts.dev` | Removed | **NO — required** |
| S3 | GitHub App client ID (`Ov23li…`) | HIGH (identifier) | `backend/package.json` → `scripts.dev` | Removed | Recommended (rotate app or re-scope) |
| S4 | GitHub App ID (numeric) | LOW (identifier) | `backend/package.json` → `scripts.dev` | Removed | Not required by itself |
| S5 | `REDIS_URL` and database URL with local defaults | LOW | `backend/package.json` → `scripts.dev` | Removed (Redis retired) | Not applicable |
| S6 | Placeholder Stripe keys (`sk_test_placeholder`, `whsec_test_placeholder`) | INFO | `backend/package.json`, `.env.example` | Removed from script; placeholders remain in `.env.example` as documented non-secrets | Not applicable |
| S7 | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` placeholder values | INFO | `.env.example` (historical duplicates) | Replaced with empty placeholders | Not applicable |
| S8 | Cloudflare Workers AI hostname (`*.workers.dev`) | LOW (infrastructure fingerprint) | `.env.example`, committed docs | Removed | Not applicable (Cloudflare retired) |
| S9 | Local `.env.backup` containing pasted environment content | **HIGH (local only)** | repository root, git-ignored + untracked | Untracked; explicitly ignored | Local file must be deleted by the operator |

### Why S1/S2 are critical

A GitHub App **client secret** can be exchanged for installation tokens when
combined with the app ID and a valid OAuth flow; a **webhook secret** allows an
attacker to forge signed `workflow_job` deliveries. Together they permit:

- forged CI failure events (poisoning diagnosis data, consuming AI budget),
- installation-token minting against every repository the app is installed on,
- comment/report injection into customer pull requests.

Because Hopper's `/api/webhooks/github` verifies HMAC with
`GITHUB_APP_WEBHOOK_SECRET`, a leaked webhook secret fully defeats webhook
authenticity until rotated.

---

## 2. What was found in `backend/package.json`

The `dev` script previously inlined roughly ten environment assignments,
including the GitHub App client secret and webhook secret, e.g.:

```text
"dev": "NODE_ENV=development GITHUB_APP_ID=… GITHUB_APP_CLIENT_ID=… \
        GITHUB_APP_CLIENT_SECRET=<redacted> GITHUB_APP_WEBHOOK_SECRET=<redacted> …"
```

This is a class of defect, not a single typo:

1. secrets in `package.json` are committed by default and are **not** covered by
   `.gitignore`;
2. they are printed by `npm run` echo, CI logs and `ps` output;
3. they are copied into every developer clone and every fork;
4. they silently override a developer's real `.env`, masking misconfiguration.

### Remediation applied

`backend/package.json` now contains:

```json
"dev": "tsx watch src/server/index.ts"
```

All configuration is read exclusively from environment variables, loaded from
`backend/.env` (git-ignored) by `dotenv` or injected by Vercel Project Settings.
No credential appears in any script, workflow, Dockerfile or source file.

---

## 3. `.env.example` hygiene

`backend/.env.example` and the root `.env.example` were rewritten:

- every credential is now an **empty** value or an unmistakably fake placeholder;
- Removed: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_WORKER_AI_URL`, `CLOUDFLARE_TURNSTILE_SECRET_KEY`, `REDIS_URL`,
  and every `@cf/...` model identifier;
- Removed the mangled/duplicated history that had concatenated fragments of an
  RSA private key block and repeated Stripe placeholders;
- Added the Vercel-native variables (`QUEUE_STORE`, `QUEUE_TRANSPORT`,
  `COORDINATION_BACKEND`, `CRON_SECRET`, `SUPABASE_JWT_*`, `CORS_ALLOWED_ORIGINS`).

`.env.example` files are templates, never working configuration. `NODE_ENV=production`
validation refuses to boot with placeholder credentials for the mandatory
variables (`DATABASE_URL`, `GITHUB_APP_WEBHOOK_SECRET`,
`GITHUB_APP_PRIVATE_KEY`, a JWT verification key, `CORS_ALLOWED_ORIGINS`).

---

## 4. Repository-level prevention

| Control | Implementation |
|---|---|
| Ignore rules | `.gitignore` now covers `.env`, `.env.*` (except `.env.example`), `.env.backup`, `.env.*.bak`, `.env.local`, `.env*.bak`, `*.pem`, `*.key`, `id_rsa`, `id_ed25519`, `.vercel/` |
| Tracked-file guard | `.github/workflows/security.yml` fails if any `.env*` file other than `.env.example` is tracked |
| Project policy scanner | `python3 scripts/ci/verify-no-committed-secrets.py` runs on every PR |
| Independent scanner | Gitleaks 8.18.4 scans the working tree with `--redact` |
| Dependency audit | `npm audit --omit=dev --audit-level=high` |
| No inline secrets | Enforced by review; `backend/package.json` scripts contain no assignments |

### Gitleaks scope decision

Gitleaks runs in **working-tree mode** (`--no-git`). A history scan would fail
permanently on the already-public commits that contain S1/S2, and a permanently
red security gate is worse than an honest one: it trains reviewers to ignore the
result. History exposure is handled the only correct way — **rotation** (see the
runbook) — not by pretending the commit is clean.

---

## 5. What an operator must still do

1. **Rotate S1 and S2** in the GitHub App settings (generate a new client secret,
   generate a new webhook secret). Until this is done, the production deployment
   must be treated as forgeable.
2. **Rotate S3** (client ID) by regenerating the app's client credentials, or by
   creating a replacement GitHub App and updating `GITHUB_APP_ID`,
   `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET` and
   `GITHUB_APP_PRIVATE_KEY` together.
3. **Assume worst case for the private key**: if a `GITHUB_APP_PRIVATE_KEY` was
   ever present in a committed file or a pasted `.env.backup`, regenerate the key
   pair in the GitHub App settings and update Vercel.
4. **Delete the local `.env.backup`** on any machine that has one (it is
   untracked and ignored, but it still holds credentials on disk).
5. **Audit usage**: review the GitHub App's recent installations, webhook
   deliveries and `git` audit log for unexpected activity in the exposure window.
6. **Never rewrite public history** as a substitute for rotation. Rewriting does
   not revoke anything, and forks/clones keep the old blobs.

---

## 6. Verification performed

| Check | Result |
|---|---|
| `grep` for credential-shaped assignments in `package.json` scripts | PASS — none |
| `grep -rn "sk_live\\|sk-ant-\\|ghs_\\|-----BEGIN"` over tracked source | PASS — no live material (only the documented placeholder text in `.env.example`) |
| `.env` files tracked by git | PASS — none (`git ls-files` clean) |
| Cloudflare credential variables anywhere in the repo | PASS — removed |
| Redis credential variables anywhere in the repo | PASS — removed |
| Secret scan wired into CI | PASS — `.github/workflows/security.yml` |
| Rotation completed | **FAIL / BLOCKED** — requires GitHub App owner action |

---

## 7. Residual risk

- Git history still contains S1–S4. **Mitigation: rotation only.**
- `.env.backup` may still exist on the operator's disk (untracked, ignored).
- Any fork of the public repository retains the historical blobs.
- Vercel preview deployments inherit production secrets unless deliberately
  scoped: environment separation is documented in
  `docs/deployment/VERCEL_ENVIRONMENT_VARIABLES.md`.
