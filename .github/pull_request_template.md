## 1. Summary of Changes

<!-- Provide a concise overview of the problem, proposed solution, and architectural changes. -->

### Change Classification
- [ ] `feat`: New feature or capability
- [ ] `fix`: Bug fix
- [ ] `refactor`: Code refactoring without behavior change
- [ ] `perf`: Performance optimization
- [ ] `chore`: Tooling, CI/CD, dependencies, or configuration
- [ ] `docs`: Documentation updates only

### Risk Classification
- [ ] **Low**: Non-breaking internal refactoring, documentation, or non-critical tests.
- [ ] **Medium**: API route addition, frontend component update, non-breaking schema expansion.
- [ ] **High**: Database schema modification, RLS policy changes, queue lifecycle adjustment.
- [ ] **Critical**: Authentication, billing state, financial budget controller, kernel multi-tenancy.

---

## 2. Architectural & Security Checklist

- [ ] **Permanent Invariant 1 (Free Access):** Confirmed free access for users; commercial paywall gates remain dormant (`ENABLE_COMMERCIAL_QUOTA=false`).
- [ ] **Permanent Invariant 2 (Advisory Diagnosis):** Zero arbitrary code execution or PR mutations on user repositories.
- [ ] **Permanent Invariant 3 (Single AI Provider):** Exactly one explicitly configured provider; zero multi-provider failover.
- [ ] **Permanent Invariant 4 (AI Budget Safety):** Pre-flight reservation and $500 monthly cap preserved.
- [ ] **Permanent Invariant 5 (PostgreSQL RLS):** All queries execute under `hopper_app` runtime role with transaction-scoped tenant claims (`withTenantContext`).
- [ ] **Secrets & Privacy:** Verified zero credentials, API keys, tokens, or customer data committed.

---

## 3. Database Migration Governance (If Applicable)

- [ ] Migration follows **Expand-and-Contract** pattern (backward-compatible).
- [ ] Migration applied and verified on clean database.
- [ ] Table RLS verified (`ALTER TABLE ... FORCE ROW LEVEL SECURITY`).
- [ ] Zero schema-destruction or irreversible drop columns in this change.

---

## 4. Verification Evidence

<!-- Paste exact commands executed and their output summary. -->

```bash
# Backend lint and tests
npm --prefix backend run lint
npm run test:backend

# Frontend build and tests
npm run test:frontend
npm --prefix frontend run build
```

- **Backend Tests:** Passed (____ / ____ tests)
- **Frontend Build:** Built cleanly without errors or warnings
- **Screenshots / Logs:** _(attach if visual change)_

---

## 5. Rollback Considerations

<!-- For Medium/High/Critical changes, specify the exact rollback procedure if issues emerge in staging or production. -->
- **Rollback Procedure:** 
- **Data Recovery Plan:** 
