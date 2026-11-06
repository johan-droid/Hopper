# Hopper CI/CD Automation Architecture

## 1. Pipeline Topology & Workflow Architecture

Hopper's CI/CD automation is structured as a modular matrix of reusable and orchestrating workflows located in `.github/workflows/`.

```mermaid
flowchart TD
    subgraph PullRequest["Pull Request Phase (Non-Mutating)"]
        PRTrigger[Developer opens / updates PR] --> PRMaster[pull-request.yml]
        PRMaster --> BackendCI[backend-ci.yml]
        PRMaster --> FrontendCI[frontend-ci.yml]
        PRMaster --> DBMigrations[database-migrations.yml]
        PRMaster --> Integration[integration-tests.yml\n(Real PG 16 + Redis 7)]
        PRMaster --> Security[security.yml\n(Secrets & Audit)]
        BackendCI --> Summary[pr-gate-summary]
        FrontendCI --> Summary
        DBMigrations --> Summary
        Integration --> Summary
        Security --> Summary
    end

    subgraph MergeMain["Trunk Integration & Staging Phase"]
        Merge[PR Merged to main] --> StagingDeploy[deploy-staging.yml]
        StagingDeploy --> BuildArtifacts[build-artifacts.yml\n(Build Once, Hash Checksums)]
        BuildArtifacts --> UploadArtifact[Store Release Artifact Package]
        UploadArtifact --> DeployStaging[Deploy to Cloudflare Pages & Worker Staging]
        DeployStaging --> PostStagingVerify[post-deployment-verification.yml\n(Automated Smoke Tests)]
    end

    subgraph ReleaseProduction["Production Promotion Phase (Protected)"]
        AuthTrigger[Manual Trigger with 'PROCEED_PRODUCTION_DEPLOY'] --> ProdDeploy[deploy-production.yml]
        ProdDeploy --> DownloadArtifact[Download Verified Staging Artifact]
        DownloadArtifact --> VerifyChecksum[Verify sha256sum Checksum]
        VerifyChecksum --> DeployProd[Deploy to Cloudflare Pages & Worker Production]
        DeployProd --> PostProdVerify[post-deployment-verification.yml\n(Production Health & Telemetry)]
    end
```

---

## 2. Directory Inventory & Workflow Responsibilities

| Workflow File | Trigger Event | Primary Responsibility | Service Containers |
|---|---|---|---|
| `pull-request.yml` | `pull_request: [main]` | Master orchestrator evaluating all PR quality gates | None (delegates) |
| `backend-ci.yml` | `workflow_call`, `workflow_dispatch` | TypeScript typecheck (`tsc --noEmit`), linting, fast unit tests, Docker build | None |
| `frontend-ci.yml` | `workflow_call`, `workflow_dispatch` | Frontend typecheck, API contract tests, production bundle build, asset verification | None |
| `database-migrations.yml` | `workflow_call`, `workflow_dispatch` | Migration syntax validation, ordered execution, RLS attribute check, idempotency | `postgres: pgvector:pg16` |
| `integration-tests.yml` | `workflow_call`, `workflow_dispatch` | Full backend test suite (178 tests), kernel RLS isolation, budget controller, AI baseline | `postgres: pgvector:pg16`, `redis: 7-alpine` |
| `security.yml` | `workflow_call`, `workflow_dispatch` | Secret scanning (`verify-no-committed-secrets.py`) and npm dependency vulnerability audit | None |
| `build-artifacts.yml` | `workflow_call`, `workflow_dispatch` | Builds release bundle, generates SHA-256 checksums, outputs immutable artifact | None |
| `deploy-staging.yml` | `push: [main]`, `workflow_dispatch` | Deploys verified artifact to Cloudflare Pages & Workers staging environment | None |
| `deploy-production.yml` | `workflow_dispatch` | Deploys verified artifact to Cloudflare production; requires explicit confirmation | None |
| `post-deployment-verification.yml` | `workflow_call`, `workflow_dispatch` | Runs automated smoke tests against target environment URLs | None |
| `dependency-updates.yml` | Schedule (weekly Monday 04:00 UTC) | Audits outdated dependencies across root, backend, frontend; runs quality smoke tests | None |
| `release.yml` | `push: tags: [v*]`, `workflow_dispatch` | Generates semantic release notes, changelog, publishes GitHub Release with checksums | None |

---

## 3. Real Ephemeral Service Containers

Integration and database migration workflows run against **real, isolated ephemeral services** defined directly in GitHub Actions jobs:

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    env:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgrespassword
      POSTGRES_DB: hopper_db
    ports:
      - 5432:5432
    options: >-
      --health-cmd pg_isready
      --health-interval 5s
      --health-timeout 5s
      --health-retries 5

  redis:
    image: redis:7-alpine
    ports:
      - 6379:6379
    options: >-
      --health-cmd "redis-cli ping"
      --health-interval 5s
      --health-timeout 5s
      --health-retries 5
```

### Deterministic Test Invariants
- Tests never connect to staging or production databases.
- Full migration history (0001 through 0009) executes on clean schemas.
- The `hopper_app` unprivileged runtime role is instantiated and verified to possess `NOSUPERUSER` and `NOBYPASSRLS`.
- All 11 tables are checked for `FORCE ROW LEVEL SECURITY`.

---

## 4. Immutable Build-Once, Promote-Everywhere Practice

Hopper enforces the enterprise release principle: **Never rebuild code between environments**.

1. **Compilation:** The release candidate package is assembled once during `build-artifacts.yml`.
2. **Cryptographic Checksumming:** A cryptographic manifest `RELEASE_CHECKSUMS.sha256` records the hash of every compiled asset.
3. **Artifact Storage:** The package is archived as a GitHub Actions release artifact (`hopper-release-<commit-sha>`) with a 30-day retention window.
4. **Staging Verification:** The artifact is deployed to staging and subjected to automated post-deployment smoke tests.
5. **Production Promotion:** `deploy-production.yml` downloads the **exact same artifact archive**, verifies its SHA-256 hash against `RELEASE_CHECKSUMS.sha256`, and deploys it to production.
