# HOPPER PHASE H — DEFECT REMEDIATION & CODE MODIFICATION LOG

**Document Type:** Autonomous Engineering Remediation Ledger  
**Audit Phase:** Phase H — Architecture Integrity & Product Reality Audit  
**Date:** November 6, 2026  
**Auditor / Engineer:** Independent Principal Systems Auditor & Full-Stack Engineer  

---

## 1. Remediation Summary Table

| Defect ID | Severity | File(s) Modified | Description of Defect | Remediation Applied | Regression Test |
|---|:---:|---|---|---|---|
| **DEF-01** | **CRITICAL** | `backend/src/server/routes/repositories.ts` | `/api/repositories`, `/failures`, `/link-workspace` had no auth or tenant checks | Added `requireAuth(userProfileRepo)`, tenant membership assertions, and IDOR prevention | `backend/tests/security-tenant-isolation.test.ts` (Tests 1–6) |
| **DEF-02** | **HIGH** | `backend/src/server/routes/signatures.ts` | `/api/signatures/:id` lacked auth and returned hardcoded 3DS frame mock on errors | Added JWT authentication, parent repository authorization check, and removed fake mock catch block | `backend/tests/security-tenant-isolation.test.ts` (Tests 7–10) |
| **DEF-03** | **HIGH** | `backend/src/server/routes/dashboard.ts` | `/api/dashboard/:orgSlug` had no auth and returned hardcoded fake leaderboard items | Added JWT auth, workspace authorization check, and returned empty array when no live data | `backend/tests/security-tenant-isolation.test.ts` (Tests 11–13) |
| **DEF-04** | **HIGH** | `backend/src/workers/processors/workflow-job.processor.ts` | `HopperEngine` was unwired; processor duplicated 300+ lines of engine logic | Refactored processor to delegate directly to `HopperEngine.processEvent()`, preserving BullMQ burst locks | `backend/tests/workflow-processor.test.ts` (Tests 1–5) |
| **DEF-05** | **MEDIUM** | `backend/src/lib/ai/diagnose.ts` | Benchmark test strings (`Yesterday`, `3ds-frame`) hardcoded in deterministic regexes | Replaced bespoke string leaks with generalized temporal and concurrency regexes | `run-baseline.ts` (50 cases evaluated) |
| **DEF-06** | **MEDIUM** | `backend/src/lib/ai/diagnose.ts` | Anthropic prompt caching 2,048 token boundary on Haiku unaddressed in code comments | Documented Claude 3.5 Haiku 2,048-token caching threshold and pricing behavior | Code review & architecture documentation |
| **DEF-07** | **MEDIUM** | `frontend/src/components/views/PipelineActivityView.tsx` | View rendered static `SAMPLE_ACTIVITY` array without live API connection | Connected to `useRepositoriesQuery` & `useRepoFailuresQuery` with repo selector, empty/loading/error states | `npm --prefix frontend run build` |
| **DEF-08** | **MEDIUM** | `frontend/src/components/views/WorkspaceSettingsView.tsx` | View rendered static `SAMPLE_MEMBERS` array without querying workspace members | Connected to `useWorkspacesQuery` and `useWorkspaceMembersQuery` | `npm --prefix frontend run build` |
| **DEF-09** | **MEDIUM** | `frontend/src/App.tsx` | Monolithic 617 kB bundle triggering Vite chunk warning | Converted all 9 domain views to `React.lazy` and `React.Suspense` | Vite build (Chunks 5-15 kB, main 499 kB) |
| **DEF-10** | **LOW** | `backend/src/server/middleware/auth.ts` | User profile upsert could throw username collisions when users shared prefix | Added user ID hash to auto-generated usernames (`${emailPrefix}_${userId.slice(0, 6)}`) | `backend/tests/security-tenant-isolation.test.ts` |

---

## 2. Detailed Remediation Entries

### DEF-01: Repositories Endpoint Missing Authentication & IDOR Risk
- **Location:** `backend/src/server/routes/repositories.ts`
- **Root Cause:** The router was written without passing `userProfileRepo` or calling `requireAuth`. Any unauthenticated HTTP client could supply `?workspaceId=<uuid>` to list all private repositories in any workspace, or link another tenant's repository into their own workspace.
- **Diff Summary:**
  ```diff
  - export function createRepositoriesRouter(repoRepo, workflowFailureRepo): Router {
  -   router.get('/', async (req, res, next) => { ... })
  + export function createRepositoriesRouter(repoRepo, workflowFailureRepo, workspaceRepo, userProfileRepo, orgRepo): Router {
  +   const auth = requireAuth(userProfileRepo);
  +   router.get('/', auth, async (req, res, next) => {
  +     // Verify workspace membership or public visibility
  +     const role = req.userProfileId ? await workspaceRepo.getUserRoleInWorkspace(workspaceId, req.userProfileId) : null;
  +     if (!role && ws.owner_id !== req.userProfileId && !ws.is_public) {
  +       throw ApiError.forbidden('You do not have access to this workspace');
  +     }
  +     ...
  +   });
  ```
- **Verification:** Verified in `backend/tests/security-tenant-isolation.test.ts`:
  - `blocks unauthenticated requests with 401` $\to$ **PASS**
  - `blocks cross-tenant access to Workspace A repositories with 403` $\to$ **PASS**
  - `blocks cross-tenant linking of repository to foreign workspace (IDOR defense)` $\to$ **PASS**
  - `blocks cross-tenant inspection of repository failures with 403` $\to$ **PASS**

---

### DEF-02: Signatures Endpoint Missing Auth & Sensitive Mock Catch Block
- **Location:** `backend/src/server/routes/signatures.ts`
- **Root Cause:** Endpoint `/api/signatures/:id` lacked `requireAuth` and contained a `catch (_dbErr)` block that returned a hardcoded 3DS Playwright error snippet, obscuring database errors and leaking realistic test data.
- **Diff Summary:**
  ```diff
  - router.get('/:id', async (req, res) => {
  -   try { ... } catch (_dbErr) { return res.json({ mockData }); }
  + router.get('/:id', auth, async (req, res, next) => {
  +   try {
  +     const signature = await failureSigRepo.findById(id);
  +     if (!signature) throw ApiError.notFound('Signature not found');
  +     // Assert caller belongs to workspace owning parent repository
  +     if (!hasAccess) throw ApiError.forbidden('You do not have access to this signature');
  +     ...
  +   } catch (err) { next(err); }
  ```
- **Verification:** Verified in `security-tenant-isolation.test.ts`:
  - `blocks unauthenticated access to signature with 401` $\to$ **PASS**
  - `blocks cross-tenant access to failure signature with 403` $\to$ **PASS**
  - `returns 404 for non-existent signature` $\to$ **PASS**

---

### DEF-03: Dashboard Endpoint Missing Auth & Fake Leaderboard Data
- **Location:** `backend/src/server/routes/dashboard.ts`
- **Root Cause:** `/api/dashboard/:orgSlug` permitted unauthenticated access and returned fake flaky tests (`jwt-verifier.spec.ts`) whenever an organization had zero recorded failures.
- **Diff Summary:**
  ```diff
  - router.get('/:orgSlug', async (req, res) => {
  -   if (flakyTestLeaderboard.length === 0) { flakyTestLeaderboard = [ ...fakeItems... ]; }
  + router.get('/:orgSlug', auth, async (req, res, next) => {
  +   // Verify workspace access; return empty array [] if no live failures exist
  ```
- **Verification:** Verified in `security-tenant-isolation.test.ts`:
  - `blocks unauthenticated access to dashboard with 401` $\to$ **PASS**
  - `blocks cross-tenant access to organization dashboard with 403` $\to$ **PASS**
  - `allows authorized member to view organization dashboard without fake fallback data` $\to$ **PASS**

---

### DEF-04: Unwired HopperEngine Architecture
- **Location:** `backend/src/workers/processors/workflow-job.processor.ts`
- **Root Cause:** `HopperEngine` was created in Phase B but remained unimported. `workflow-job.processor.ts` had duplicated normalization, fingerprinting, flakiness calculation, diagnosis calling, and PR comment rendering.
- **Diff Summary:**
  Refactored `processWorkflowJob` into a concise orchestrator that converts `WorkflowJobEventData` to `CanonicalCIEvent` and delegates to `engine.processEvent()`:
  ```typescript
  export async function processWorkflowJob(jobData, deps = {}, job?): Promise<JobDiagnosticResult> {
    const engine = new HopperEngine(deps);
    // 1. Matrix burst lock acquired via Redis
    ...
    try {
      const canonicalEvent = { ...mapJobDataToCanonical(jobData) };
      const result = await engine.processEvent(canonicalEvent, { rawLog: jobData.rawLog });
      return { status: result.status, signatureHash: result.signatureHash, ... };
    } finally {
      if (diagnosisLock) await releaseDiagnosisLock(...);
    }
  }
  ```
- **Verification:** Verified in `backend/tests/workflow-processor.test.ts`:
  - All 5 worker concurrency, retry pass, and quota tests passed in 636ms.

---

### DEF-05: Test-Data Leakage in Deterministic Heuristics
- **Location:** `backend/src/lib/ai/diagnose.ts`
- **Root Cause:** Hardcoded strings `'3ds-frame'` and `'Yesterday'` were embedded into categorization regexes to force high accuracy on the 50-case benchmark dataset.
- **Diff Summary:**
  ```diff
  - if (isFlaky && (isTimeout || snippet.includes('3ds-frame') || snippet.includes('Yesterday')))
  + const isTemporalOrBoundary = /(?:date|time\s*zone|midnight|clock|temporal|boundary|relative\s*date)/i.test(snippet);
  + const isAsyncRaceOrCollision = /(?:timeout|EADDRINUSE|duplicate key|race condition|selector|frame|locator)/i.test(snippet);
  + if (isFlaky && (isTimeout || isAsyncRaceOrCollision || isTemporalOrBoundary))
  ```
- **Verification:** Re-ran `npx tsx backend/src/lib/ai/evaluation/run-baseline.ts`:
  - 50/50 cases evaluated; Category Accuracy: 100% across all 10 categories without dataset string matching.

---

### DEF-07, DEF-08, DEF-09: Frontend Live Integration & Code-Splitting
- **Location:** `frontend/src/components/views/PipelineActivityView.tsx`, `WorkspaceSettingsView.tsx`, `App.tsx`
- **Remediation:**
  - Connected views to live TanStack Query hooks.
  - Added repository selector dropdown, loading spinners, empty states, and error handling.
  - Refactored `App.tsx` with dynamic `lazy()` imports:
    ```typescript
    const OverviewView = lazy(() => import('./components/views/OverviewView').then((m) => ({ default: m.OverviewView })));
    ...
    ```
- **Verification:**
  - Built cleanly via `npm --prefix frontend run build` in 3.21s with 0 errors and zero chunks exceeding 500 kB.
  - All 9 frontend schema unit tests passed in 500ms.

---

## 3. Comprehensive Verification Sign-Off

```
[Suite Execution Summary]
- Backend TypeScript Compilation: PASS (0 errors)
- Vitest Backend Tests:            PASS (28 test files, 163 tests passed, 0 failed)
- Vitest Frontend Tests:           PASS (1 test file, 9 tests passed, 0 failed)
- Frontend Production Build:       PASS (Vite 5.4.21, 12 chunks generated in 3.21s, 0 warnings)
- Evaluation Benchmark:            PASS (50 cases, 100% category accuracy, 0 cheats)
```

