# HOPPER PHASE 16V — EVALUATION DATASET INTEGRITY & LEAKAGE AUDIT

## Executive Summary

**Target File:** [`backend/src/lib/ai/evaluation/dataset.ts`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/src/lib/ai/evaluation/dataset.ts)  
**Total Cases Inspected:** 50  
**Audit Finding:** **PARTIALLY VERIFIED WITH CRITICAL BENCHMARK LEAKAGE**

While the 50-case benchmark dataset successfully spans 10 distinct failure categories and covers multiple programming ecosystems (TypeScript, Rust, Go, Python, Java, Docker, PostgreSQL), the audit reveals:
1. **100% Synthetic Provenance:** All 50 cases explicitly declare `isSynthetic: true`. None were sampled directly from raw production GitHub Actions archives.
2. **Co-Authored Ground Truth:** The ground-truth expected answers were created simultaneously with Phase 16 implementation, rather than originating from an independent, pre-existing evaluation harness.
3. **Severe Circularity & Benchmark Leakage:** The deterministic pattern matching rules in [`backend/src/lib/ai/diagnose.ts`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/src/lib/ai/diagnose.ts) were authored using the exact literal strings present in these synthetic cases (e.g. `snippet.includes('E404')`, `snippet.includes('COPY failed')`, `snippet.includes('cannot borrow')`).

---

## 1. Case-by-Case Integrity & Circularity Inspection

### Category 1: Compilation & Build Failures (`build_compile`)
| Case ID | Scenario & Category | Expected Root Cause | Supporting Evidence | Synthetic vs Real | Independent Baseline? | Direct Mirror in `diagnose.ts`? |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `CASE-01` | TypeScript Type Mismatch (`build_compile`) | TS2322: Type 'undefined' not assignable to 'string' | `TS2322`, `customerId: user.stripeCustomerId` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('TS2322')` |
| `CASE-02` | Rust Missing Trait (`build_compile`) | Rust borrow checker E0502 | `cannot borrow as mutable`, `E0502` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('cannot borrow')` |
| `CASE-03` | Go Duplicate Symbol (`build_compile`) | Go compiler error: HealthCheckHandler redeclared | `redeclared in this block` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('redeclared')` |
| `CASE-04` | C++ Linker Error (`build_compile`) | C++ linker error: undefined reference | `undefined reference to 'QueueManager::init()'` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('undefined reference')` |
| `CASE-05` | Vite Import Resolution (`build_compile`) | Rollup failed to resolve import | `Failed to resolve import`, `src/App.tsx` | Synthetic | No (Co-authored) | **YES**: default branch in `case 'build_compile'` |

### Category 2: Unit & Integration Test Failures (`test_assertion`)
| Case ID | Scenario & Category | Expected Root Cause | Supporting Evidence | Synthetic vs Real | Independent Baseline? | Direct Mirror in `diagnose.ts`? |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `CASE-06` | Jest Value Mismatch (`test_assertion`) | Jest assertion failure: expect(received).toEqual | `expect(received).toEqual`, `status: 403` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('expect(received).toEqual')` |
| `CASE-07` | Pytest Assertion Failure (`test_assertion`) | Pytest assertion failure: AssertionError: assert | `AssertionError: assert`, `pro_dev`, `free` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('AssertionError: assert')` |
| `CASE-08` | Vitest Snapshot Mismatch (`test_assertion`) | Vitest snapshot regression: Snapshot mismatched | `Snapshot mismatched`, `Header.test.tsx` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('Snapshot') && snippet.includes('mismatched')` |
| `CASE-09` | Playwright Element Missing (`test_assertion`) | Playwright assertion error: expect(locator).toBeVisible | `expect(locator).toBeVisible()`, `not found` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('expect(locator).toBeVisible')` |
| `CASE-10` | Go Panic in Goroutine (`test_assertion`) | Go test runtime panic: invalid memory address | `invalid memory address or nil pointer dereference` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('invalid memory address')` |

### Category 3: Dependency Resolution Failures (`dependency_resolution`)
| Case ID | Scenario & Category | Expected Root Cause | Supporting Evidence | Synthetic vs Real | Independent Baseline? | Direct Mirror in `diagnose.ts`? |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `CASE-11` | NPM 404 Package Missing (`dependency_resolution`) | NPM package registry error E404 | `code E404`, `404 Not Found` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('E404')` |
| `CASE-12` | Python Pip Version Conflict (`dependency_resolution`) | Pip dependency conflict: conflicting dependencies | `conflicting dependencies`, `pydantic` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('conflicting dependencies')` |
| `CASE-13` | Cargo Rustc Version Mismatch (`dependency_resolution`) | Cargo dependency resolution: requires rustc | `requires rustc 1.82`, `failed to select version` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('requires rustc')` |
| `CASE-14` | Maven Dependency Convergence (`dependency_resolution`) | Maven enforcer rule: Dependency convergence | `Dependency convergence error`, `slf4j-api` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('Dependency convergence')` |
| `CASE-15` | Bundler Platform Mismatch (`dependency_resolution`) | Ruby Bundler platform mismatch | `Could not find gem`, `x86_64-linux` | Synthetic | No (Co-authored) | **YES**: default branch in `case 'dependency_resolution'` |

### Category 4: Environment & Configuration Failures (`env_config`)
| Case ID | Scenario & Category | Expected Root Cause | Supporting Evidence | Synthetic vs Real | Independent Baseline? | Direct Mirror in `diagnose.ts`? |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `CASE-16` | Missing ENV Variable (`env_config`) | Missing required environment variable | `Missing required environment variable`, `STRIPE_KEY` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('Missing required environment variable')` |
| `CASE-17` | Node Version Engine Mismatch (`env_config`) | Node engine mismatch EBADENGINE | `EBADENGINE Unsupported engine`, `node 18` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('EBADENGINE')` |
| `CASE-18` | YAML Indentation Syntax Error (`env_config`) | Workflow YAML syntax error | `syntax error: mapping values are not allowed` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('mapping values are not allowed')` |
| `CASE-19` | Missing Shared Host Library (`env_config`) | Missing dynamic library / OpenSSL | `Could not find directory of OpenSSL` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('OpenSSL')` |
| `CASE-20` | Working Directory Path Invalid (`env_config`) | Non-existent directory: No such file or directory | `cd: frontend/client: No such file or directory` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('No such file or directory')` |

### Category 5: Docker & Container Failures (`container_docker`)
| Case ID | Scenario & Category | Expected Root Cause | Supporting Evidence | Synthetic vs Real | Independent Baseline? | Direct Mirror in `diagnose.ts`? |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `CASE-21` | Dockerfile COPY Missing Path (`container_docker`) | Docker build error: COPY failed | `COPY failed: file not found in build context` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('COPY failed')` |
| `CASE-22` | Container Entrypoint Permission (`container_docker`) | Container runtime error: entrypoint permission denied | `entrypoint.sh: 13: exec: Permission denied` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('permission denied')` |
| `CASE-23` | Base Image Manifest Unknown (`container_docker`) | Docker image pull error: manifest unknown | `manifest for node:99-alpine not found` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('manifest')` |
| `CASE-24` | Docker Daemon Socket Missing (`container_docker`) | Docker daemon connection error | `Cannot connect to the Docker daemon at unix:///` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('Cannot connect to the Docker daemon')` |
| `CASE-25` | Port Binding Conflict (`container_docker`) | Container networking conflict: Bind for port failed | `Bind for 0.0.0.0:5432 failed: port is already allocated` | Synthetic | No (Co-authored) | **YES**: default branch in `case 'container_docker'` |

### Category 6: Database Connectivity Failures (`database_connectivity`)
| Case ID | Scenario & Category | Expected Root Cause | Supporting Evidence | Synthetic vs Real | Independent Baseline? | Direct Mirror in `diagnose.ts`? |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `CASE-26` | Postgres Connection Refused (`database_connectivity`) | Database connection refused: ECONNREFUSED | `connect ECONNREFUSED 127.0.0.1:5432` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('ECONNREFUSED')` |
| `CASE-27` | Postgres Auth Password Failed (`database_connectivity`) | Postgres auth failed: password authentication failed (28P01) | `password authentication failed for user` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('password authentication failed')` |
| `CASE-28` | Relation Table Does Not Exist (`database_connectivity`) | Schema relation missing: relation does not exist (42P01) | `relation "user_workspaces" does not exist` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('does not exist')` |
| `CASE-29` | Redis Connection Timeout (`database_connectivity`) | Redis connection timeout: connect ETIMEDOUT | `[ioredis] Unhandled error event: connect ETIMEDOUT` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('ETIMEDOUT')` |
| `CASE-30` | Postgres Transaction Deadlock (`database_connectivity`) | Database transaction deadlock detected (40P01) | `deadlock detected: Process 412 waiting for ShareLock` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('deadlock detected')` |

### Category 7: Network & Infrastructure Timeouts (`network_infra`)
| Case ID | Scenario & Category | Expected Root Cause | Supporting Evidence | Synthetic vs Real | Independent Baseline? | Direct Mirror in `diagnose.ts`? |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `CASE-31` | DNS Resolution EAI_AGAIN (`network_infra`) | DNS lookup failure: getaddrinfo EAI_AGAIN | `getaddrinfo EAI_AGAIN api.stripe.internal` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('EAI_AGAIN')` |
| `CASE-32` | Upstream Gateway 502 Bad Gateway (`network_infra`) | Upstream HTTP gateway error: HTTP 502 Bad Gateway | `HTTP 502 Bad Gateway: Upstream server error` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('502 Bad Gateway')` |
| `CASE-33` | Third-Party API Rate Limit 429 (`network_infra`) | API rate limiting: 429 Too Many Requests | `HTTP 429: API rate limit exceeded for user` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('rate limit exceeded')` |
| `CASE-34` | TLS Certificate Expired (`network_infra`) | SSL/TLS certificate verification failure | `SSL certificate problem: certificate has expired` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('certificate has expired')` |
| `CASE-35` | SSH Host Key Verification Failed (`network_infra`) | SSH host key verification failed | `Host key verification failed. fatal: Could not read` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('Host key verification failed')` |

### Category 8: Resource Exhaustion (`resource_exhaustion`)
| Case ID | Scenario & Category | Expected Root Cause | Supporting Evidence | Synthetic vs Real | Independent Baseline? | Direct Mirror in `diagnose.ts`? |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `CASE-36` | Linux Cgroup OOM Killer (`resource_exhaustion`) | Process terminated by Linux OOM killer (exit code 137) | `exit code 137`, `OOM killer terminated process` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('137')` |
| `CASE-37` | Node.js V8 Heap Out of Memory (`resource_exhaustion`) | V8 heap memory exhaustion: JavaScript heap out of memory | `JavaScript heap out of memory`, `Allocation failed` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('heap')` |
| `CASE-38` | Disk Space ENOSPC Full (`resource_exhaustion`) | Disk storage exhausted: ENOSPC: no space left on device | `ENOSPC: no space left on device` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('ENOSPC')` |
| `CASE-39` | Linux Max File Descriptors EMFILE (`resource_exhaustion`) | File descriptor limit exceeded: EMFILE: too many open files | `EMFILE: too many open files, watch` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('EMFILE')` |
| `CASE-40` | Process Fork Exhaustion EAGAIN (`resource_exhaustion`) | Thread/process fork limit reached: EAGAIN fork failed | `fork: Resource temporarily unavailable (EAGAIN)` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('EAGAIN')` |

### Category 9: Authentication & Permission Errors (`auth_permission`)
| Case ID | Scenario & Category | Expected Root Cause | Supporting Evidence | Synthetic vs Real | Independent Baseline? | Direct Mirror in `diagnose.ts`? |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `CASE-41` | Linux Filesystem EACCES (`auth_permission`) | Filesystem permission denied: EACCES: permission denied | `EACCES: permission denied, open '/var/run/app.pid'` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('EACCES')` |
| `CASE-42` | AWS S3 PutObject AccessDenied (`auth_permission`) | AWS IAM permission error: AccessDenied | `AccessDenied: User is not authorized to perform: s3:PutObject` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('AccessDenied')` |
| `CASE-43` | GitHub Token Scope Missing (`auth_permission`) | GitHub API token permission error: GITHUB_TOKEN write scope | `Resource not accessible by integration (Missing write scope)` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('Resource not accessible')` |
| `CASE-44` | Git SSH Publickey Rejection (`auth_permission`) | Git SSH key rejection: Permission denied (publickey) | `Permission denied (publickey). fatal: Could not read` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('publickey')` |
| `CASE-45` | Docker Registry Unauthorized (`auth_permission`) | Docker registry authentication failure: 401 Unauthorized | `denied: requested access to the resource is denied (401)` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('denied: requested access')` |

### Category 10: Flaky Tests (`flaky_test`)
| Case ID | Scenario & Category | Expected Root Cause | Supporting Evidence | Synthetic vs Real | Independent Baseline? | Direct Mirror in `diagnose.ts`? |
| :--- | :--- | :--- | :--- | :---: | :---: | :--- |
| `CASE-46` | Async Selector Timeout (`flaky_test`) | Flaky test async locator race condition | `Timeout of 30000ms exceeded waiting for selector` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('Timeout of 30000ms exceeded')` |
| `CASE-47` | Unmocked System Clock Drift (`flaky_test`) | Flaky test date boundary condition: relative date calculation | `expected 'Yesterday' to equal 'Today'` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('Yesterday')` |
| `CASE-48` | DB Unique Constraint Pollution (`flaky_test`) | Flaky test database collision: duplicate key value | `duplicate key value violates unique constraint` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('duplicate key')` |
| `CASE-49` | Localhost Port Race EADDRINUSE (`flaky_test`) | Flaky test environment collision: listen EADDRINUSE | `listen EADDRINUSE: address already in use :::4000` | Synthetic | No (Co-authored) | **YES**: `snippet.includes('EADDRINUSE')` |
| `CASE-50` | Fuzz Input Escaped Quote (`flaky_test`) | Flaky fuzz testing failure: assert parsed.is_valid() is True | `assert parsed.is_valid() is True failed on unhandled escaped quote` | Synthetic | No (Co-authored) | **YES**: default branch in `case 'flaky_test'` |

---

## 2. Audit Findings on Benchmark Quality

### Finding 1: Circular Overfitting / Leakage
In [`backend/src/lib/ai/diagnose.ts`](file:///home/ashutoshsahoo/Downloads/Hopper/backend/src/lib/ai/diagnose.ts) lines 464-637, the deterministic function `synthesizeDeterministicDiagnosis` uses exact string containment checks (`snippet.includes(...)`) tailored specifically to match the 50 cases in `dataset.ts`.
For example:
- In `CASE-14`, the log has `Dependency convergence error`. In `diagnose.ts`, line 473 checks `snippet.includes('Dependency convergence')`.
- In `CASE-47`, the log has `expected 'Yesterday' to equal 'Today'`. In `diagnose.ts`, line 608 checks `snippet.includes('Yesterday')`.
- In `CASE-21`, the log has `COPY failed: file not found`. In `diagnose.ts`, line 484 checks `snippet.includes('COPY failed')`.

**Impact:** The 100% category accuracy and 34.2% root-cause accuracy measured by `run-baseline.ts` are a direct artifact of this tight coupling between the synthetic dataset and the regex/includes table. This does not represent generalization to unencountered raw CI logs.

### Finding 2: Simplistic Log Snippets
The synthetic cases in `dataset.ts` feature curated, concise 5–15 line log snippets with minimal extraneous noise. Real enterprise CI logs regularly span 5,000 to 50,000 lines containing interleaved multi-process stdout, ANSI color animations, progress bars, and warnings. The benchmark does not adequately test the selective slicer (`log-slicer.ts`) under severe log noise.

### Finding 3: Legitimate Breadth Across Ecosystems
On the positive side, the dataset author curated an admirable variety of real-world failure patterns:
- Compilers: TypeScript (`tsc`), Rust (`cargo`), Go (`go build`), C++ (`g++`), Vite/Rollup.
- Test Runners: Jest, Vitest, Pytest, Playwright, Go test.
- Package Managers: npm, pip, cargo, maven, bundler.
- System Faults: Docker daemon down, Linux OOM killer (137), V8 heap exhaustion, disk full (ENOSPC), open files limit (EMFILE).

**Recommendation:** Retain the current 50 cases as a regression smoke suite, but curate a separate `benchmark-v2-wild.ts` dataset drawn from genuinely unedited, real-world open-source GitHub Actions failure logs to establish true out-of-sample generalization.

