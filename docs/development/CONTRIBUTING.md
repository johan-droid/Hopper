# Hopper — Contribution Guidelines & Git Workflow (CONTRIBUTING.md)

---

## 1. Development & Governance Model

Hopper welcomes contributions that enhance diagnosis accuracy, platform reliability, security, and developer ergonomics.

- **For AI Coding Agents:** You must operate under the **Single-Agent Governance Model** defined in [`AGENTS.md`](file:///home/ashutoshsahoo/Downloads/Hopper/AGENTS.md). Do not spawn subagents, do not create duplicate agent instructions, and verify every change through concrete test evidence.
- **For Human Contributors:** Follow the branch strategy, pull request workflow, and quality gates detailed below.

---

## 2. Branch Strategy & Repository Workflow

Hopper follows a feature-branch workflow:

```text
main (protected, deployable)
 └── feat/investigation-sandbox-improvements
 └── fix/oauth-state-verification
 └── docs/consolidate-architecture
```

- **`main` Branch:** Always kept in a green, deployable state. Direct pushes to `main` are restricted in production repositories.
- **Feature Branches:** Branch from `main` using descriptive names:
  - `feat/<feature-description>` for new capabilities
  - `fix/<issue-description>` for bug fixes and defect remediation
  - `docs/<topic>` for technical documentation updates
  - `refactor/<subsystem>` for internal code cleanup without behavioral changes

---

## 3. Pull Request Preflight Checklist

Before submitting a pull request, ensure every item on this checklist is satisfied:

- [ ] **Typecheck Clean:** `npm run lint` passes with 0 TypeScript compilation errors and 0 implicit `any`s.
- [ ] **Backend Tests Pass:** `npm test` passes all 33 test files and 226 tests.
- [ ] **Frontend Tests Pass:** `npm run test:frontend` passes all 4 test files and 34 tests.
- [ ] **Production Build Clean:** `npm run build` compiles both the backend (`tsup`) and frontend (`vite`) without warnings.
- [ ] **No Committed Secrets:** No `.env`, private keys (`.pem`), or genuine credentials committed. Verified by `git status` and pre-commit checks.
- [ ] **Database Integrity:** Any new table has an accompanying migration in `backend/supabase/migrations/` and explicit Row-Level Security enabled.
- [ ] **Documentation Updated:** Changes to APIs, schemas, or architecture are reflected in the canonical documents under `docs/`.

---

## 4. Commit Message Conventions

Hopper adheres to the **Conventional Commits** specification:

```text
<type>(<scope>): <short description>

[optional body]

[optional footer(s)]
```

### Supported Types:
- `feat`: A new end-user or API feature.
- `fix`: A bug fix or defect resolution.
- `docs`: Documentation creation or updates.
- `refactor`: A code change that neither fixes a bug nor adds a feature.
- `test`: Adding missing tests or correcting existing tests.
- `perf`: A code change that improves performance or decreases latency.
- `chore`: Maintenance tasks, dependency bumps, or build configuration changes.

### Examples:
```text
feat(parser): add panic marker detection for Go and Rust stack traces
fix(auth): verify signed HMAC state across serverless function instances
docs(data-model): update ERD to reflect migration 0011 denormalization
test(queue): add adversarial test for worker lease lock expiry
```

---

## 5. Code Review Quality Gates

During code review, PRs are evaluated against these criteria:

1. **Security & Data Sanitization:** Does untrusted CI log data pass through `SecretScrubber`? Are webhook signatures verified using constant-time comparisons?
2. **Tenant Isolation:** Are all queries scoped to the user's active workspace and organization? Is RLS properly configured?
3. **Architectural Consistency:** Does the change respect existing conventions? (No Redis, no BullMQ, no Cloudflare dependencies).
4. **Error Handling:** Are exceptions wrapped in `ApiError` with appropriate HTTP status codes and correlation IDs?
5. **No Synthetic Bloat:** Are tests genuine unit/integration tests rather than trivial assertions?
