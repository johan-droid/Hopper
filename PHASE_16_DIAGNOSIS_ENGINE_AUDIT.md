# HOPPER PHASE 16 — DIAGNOSIS ENGINE CAPABILITY AUDIT

## Executive Summary

Hopper's diagnosis engine was audited across 10 real-world CI failure categories to evaluate its empirical capability, evidence extraction accuracy, model delegation boundaries, and vulnerability to failure modes.

Prior to Phase 16, Hopper utilized an incomplete 6-category taxonomy (`build_compile`, `test_assertion`, `timeout`, `infra_oom`, `network`, `env_config`). This forced dependency resolution errors, Docker build failures, database connection errors, and authentication failures into generic buckets, severely degrading diagnostic precision. In Phase 16, the engine was expanded to cover all 10 standard developer CI failure classes while retaining backwards compatibility with legacy aliases.

---

## Comprehensive 10-Category Audit Matrix

### 1. Compilation and Build Failures (`build_compile`)

- **Representative Scenarios:** TypeScript compiler type errors (`TS2322`, `TS2345`), Rust `rustc` borrow checker or trait mismatches (`E0382`), Go build syntax/import errors, Webpack/Vite bundler module resolution failures.
- **Evidence Required:**
  - Compiler error code (e.g. `error TS2322: Type 'string' is not assignable to type 'number'`).
  - Source file path and line/column coordinate (e.g. `src/utils/math.ts:42:15`).
  - Correlating commit modified files.
- **What Hopper Captures:**
  - Slicer extracts the error header and file reference.
  - Fingerprinter canonicalizes file line numbers into `<FILE_PATH>:<NUM>:<NUM>` to deduplicate recurring compilation breaks.
- **Model vs. Deterministic Role:**
  - *Deterministic:* Scans for compiler prefixes (`error TS`, `cannot find module`, `syntax error`), assigns `build_compile` category, and identifies primary error lines.
  - *Model:* Explains why the types are incompatible, reviews modified files in the PR, and suggests the exact TypeScript/Rust fix.
- **Failure Modes & Limitations:**
  - Extremely large compilation outputs (e.g., C++ template metaprogramming or thousands of TS errors) can overflow the 4,000 character log slice, pushing the original root-cause header out of view if only the tail is captured.

---

### 2. Unit and Integration Test Failures (`test_assertion`)

- **Representative Scenarios:** Jest, Vitest, Mocha, Pytest, Go test, JUnit assertion failures (`AssertionError`, `Expected ... Received ...`).
- **Evidence Required:**
  - Test suite name, test file name, and specific test case name.
  - Expected vs. actual values/diffs.
  - Stack trace frame pointing to the failed assertion.
- **What Hopper Captures:**
  - Slicer identifies test runner headers (`FAIL src/services/user.test.ts > should create user`).
  - Extracts the exact assertion line (e.g. `Expected: 200, Received: 500`).
- **Model vs. Deterministic Role:**
  - *Deterministic:* Extracts test identifier (`user.test.ts: should create user`) used for flaky test tracking.
  - *Model:* Analyzes the semantic difference between expected and received data, identifying whether code logic or test mocks are at fault.
- **Failure Modes & Limitations:**
  - If a test fails due to an uncaught async rejection without an explicit assertion message, the test identifier may default to the step name unless the stack trace is properly parsed.

---

### 3. Dependency Resolution Failures (`dependency_resolution`)

- **Representative Scenarios:** `npm ERR! code ERESOLVE`, peer dependency conflicts, Python `pip` unsatisfied requirements, Cargo crate version incompatibility, Maven POM conflicts.
- **Evidence Required:**
  - Package manager error code (`ERESOLVE`, `Could not solve dependencies`).
  - Conflicting package names and conflicting required version ranges (e.g. `react@18` requires `x@^2`, but `x@1.0.0` is resolved).
- **What Hopper Captures:**
  - Slicer captures `npm ERR! code ERESOLVE` and the conflicting peer dependency tree.
- **Model vs. Deterministic Role:**
  - *Deterministic:* Matches regex `/ERESOLVE|peer dep|Could not resolve dependencies/i` and extracts the conflicting package name.
  - *Model:* Synthesizes the exact command needed to resolve the conflict (e.g., `npm i --legacy-peer-deps` or upgrading the dependency in `package.json`).
- **Failure Modes & Limitations:**
  - Transitive peer dependency graphs can be 200+ lines long. The selective slicer must preserve both the root conflict header and the package names.

---

### 4. Environment and Configuration Errors (`env_config`)

- **Representative Scenarios:** Missing required environment variables (`DATABASE_URL is not defined`), wrong Node/Python runtime version, missing CLI tools in PATH (`cd: No such file or directory`, `sh: line 1: vitest: command not found`).
- **Evidence Required:**
  - Missing variable name or missing binary name.
  - Location of configuration check (e.g. `.env.example`, `config.ts`).
- **What Hopper Captures:**
  - Scans for `command not found`, `is not defined`, `No such file or directory`, `missing required environment variable`.
- **Model vs. Deterministic Role:**
  - *Deterministic:* Identifies environment variable names or missing executable files.
  - *Model:* Recommends adding the secret to GitHub Actions secrets or `.env`, and checks workflow YAML configuration.
- **Failure Modes & Limitations:**
  - Secrets that are set to empty strings (`""`) rather than unset can produce application-level runtime errors instead of configuration warnings.

---

### 5. Docker and Container Errors (`container_docker`)

- **Representative Scenarios:** Docker daemon not running (`Cannot connect to the Docker daemon at unix:///var/run/docker.sock`), image pull rate limits/failure (`manifest unknown`), Dockerfile step non-zero exit (`The command '/bin/sh -c npm run build' returned a non-zero code: 1`).
- **Evidence Required:**
  - Docker daemon error or Dockerfile instruction step (`Step 4/12 : RUN ...`).
  - Target image tag or registry hostname.
- **What Hopper Captures:**
  - Extracts Docker error strings (`Cannot connect to the Docker daemon`, `manifest unknown`, `returned a non-zero code`).
- **Model vs. Deterministic Role:**
  - *Deterministic:* Categorizes as `container_docker` and extracts the failed Docker step.
  - *Model:* Distinguishes host daemon misconfiguration from build syntax failures inside the container.
- **Failure Modes & Limitations:**
  - When a container crashes silently (exit code 139 segfault), Docker logs may be empty unless stdout was redirected.

---

### 6. Database Connectivity & Migration Errors (`database_connectivity`)

- **Representative Scenarios:** Postgres connection refused (`ECONNREFUSED 127.0.0.1:5432`), password authentication failed for user `postgres`, Prisma/Drizzle migration lock contention (`relation "users" does not exist`, `migration failed`).
- **Evidence Required:**
  - Database host, port, and driver error code (`ECONNREFUSED`, `28P01`, `42P01`).
  - Failed migration filename or SQL statement.
- **What Hopper Captures:**
  - Driver error headers (`password authentication failed`, `ECONNREFUSED 5432`, `relation does not exist`).
- **Model vs. Deterministic Role:**
  - *Deterministic:* Captures database host/port and categorizes as `database_connectivity`.
  - *Model:* Analyzes whether the failure is a transient network issue, missing service container in GitHub Actions, or an unapplied schema migration.
- **Failure Modes & Limitations:**
  - Connection pool timeouts (`TimeoutError: ResourceRequest timed out`) can look like network timeouts if the underlying pool exhaustion is not surfaced in the log.

---

### 7. Network and Infrastructure Timeouts (`network_infra`)

- **Representative Scenarios:** DNS resolution failure (`ENOTFOUND`, `getaddrinfo EAI_AGAIN`), curl/HTTP gateway timeout (`504 Gateway Time-out`, `502 Bad Gateway`), socket hang up (`ECONNRESET`).
- **Evidence Required:**
  - Target URL, domain, or IP address.
  - HTTP status code or socket error (`ETIMEDOUT`, `EAI_AGAIN`, `504`).
- **What Hopper Captures:**
  - Slicer extracts the failing endpoint and socket error code.
- **Model vs. Deterministic Role:**
  - *Deterministic:* Assigns `network_infra` (or legacy `timeout` / `network`) and extracts HTTP status code.
  - *Model:* Evaluates whether the failure is transient (external vendor outage) or architectural (missing mock in CI).
- **Failure Modes & Limitations:**
  - Total CI workflow timeout (e.g. GitHub Actions 6-hour runner timeout) terminates the runner abruptly without a detailed log tail.

---

### 8. Resource Exhaustion (`resource_exhaustion`)

- **Representative Scenarios:** Linux Out-Of-Memory killer (`Exit code 137`, `JavaScript heap out of memory`, `Killed`), disk space exhaustion (`ENOSPC: no space left on device`).
- **Evidence Required:**
  - Process exit code `137` or explicit V8 / JVM heap error.
  - Memory limit or filesystem device error (`ENOSPC`).
- **What Hopper Captures:**
  - Slicer extracts exit code `137`, `JavaScript heap out of memory`, or `no space left on device`.
- **Model vs. Deterministic Role:**
  - *Deterministic:* Identifies exit code 137 / ENOSPC and assigns `resource_exhaustion` (or legacy `infra_oom`).
  - *Model:* Suggests memory limit increases (e.g. `NODE_OPTIONS=--max-old-space-size=4096`), runner sizing upgrades, or cache directory cleanup.
- **Failure Modes & Limitations:**
  - When the Linux kernel OOM-kills a child process, the parent process may simply report exit code 1 without printing the kernel dmesg OOM notice.

---

### 9. Authentication and Permission Errors (`auth_permission`)

- **Representative Scenarios:** File permission denied (`EACCES: permission denied`), cloud IAM access denied (`AccessDenied: User is not authorized to perform: s3:PutObject`), Git SSH key rejection (`Permission denied (publickey)`), API key 401/403.
- **Evidence Required:**
  - Error token (`EACCES`, `AccessDenied`, `401 Unauthorized`, `Permission denied (publickey)`).
  - Target resource, file, or cloud ARN.
- **What Hopper Captures:**
  - Extracts access denied messages and target files/buckets.
- **Model vs. Deterministic Role:**
  - *Deterministic:* Maps to `auth_permission` and identifies the denied entity.
  - *Model:* Identifies the specific missing permission (e.g., `s3:PutObject` on bucket `artifacts-storage`) and suggests IAM policy or `chmod` fixes.
- **Failure Modes & Limitations:**
  - Secret scrubbers might redact tokens or IDs in the error string that could help identify the exact service account.

---

### 10. Flaky Tests (`flaky_test`)

- **Representative Scenarios:** Race conditions, intermittent async timing (`Timeout 5000ms exceeded waiting for locator`), order-dependent test suite execution, unmocked system clock.
- **Evidence Required:**
  - Test name and recurring signature hash.
  - Historical execution metrics: same-commit retry pass rate, main vs branch failure frequency.
- **What Hopper Captures:**
  - Fingerprint hash tracks the failure across all runs.
  - Bayesian flakiness engine calculates a score from 0% to 100%.
- **Model vs. Deterministic Role:**
  - *Deterministic:* High-confidence mathematical flakiness score calculated by [`flakiness-engine.ts`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/src/lib/flakiness/flakiness-engine.ts).
  - *Model:* Explains the underlying timing/asynchrony flaw and suggests robust synchronization (e.g., `waitFor` instead of fixed `sleep(1000)`).
- **Failure Modes & Limitations:**
  - A test that is newly introduced on a PR branch has no historical data; its initial flakiness score will be 0% until repeated runs occur.
