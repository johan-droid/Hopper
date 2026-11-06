/**
 * Evaluation Dataset for Hopper AI Diagnostic Engine (Phase 16)
 *
 * Curated benchmark dataset of 50 representative CI/CD failure cases across 10 categories:
 * 1. Compilation & Build Failures (5 cases)
 * 2. Unit & Integration Test Failures (5 cases)
 * 3. Dependency Resolution Failures (5 cases)
 * 4. Environment & Configuration Failures (5 cases)
 * 5. Docker & Container Failures (5 cases)
 * 6. Database Connectivity Failures (5 cases)
 * 7. Network & Infrastructure Failures (5 cases)
 * 8. Resource Exhaustion (5 cases)
 * 9. Permission & Authentication Failures (5 cases)
 * 10. Flaky Tests & Intermittent Failures (5 cases)
 *
 * All cases are synthetic representations of real-world open-source and enterprise CI patterns.
 */

export type FailureCategory =
  | 'build_compile'
  | 'test_assertion'
  | 'dependency_resolution'
  | 'env_config'
  | 'container_docker'
  | 'database_connectivity'
  | 'network_infra'
  | 'resource_exhaustion'
  | 'auth_permission'
  | 'flaky_test';

export interface EvaluationCase {
  id: string;
  name: string;
  category: FailureCategory;
  stepName: string;
  exitCode: number;
  modifiedFiles: string[];
  rawLog: string;
  historicalStats: {
    totalOccurrences: number;
    uniquePrsAffected: number;
    sameShaRetryPasses: number;
    computedFlakinessScore: number;
  };
  groundTruthRootCause: string;
  relevantEvidenceKeywords: string[];
  acceptableAlternatives: string[];
  recommendedRemediation: string;
  difficulty: 'standard' | 'ambiguous' | 'multi_cause';
  isSynthetic: true;
}

export const EVALUATION_DATASET: EvaluationCase[] = [
  // ============================================================================
  // 1. Compilation and Build Failures (5 Cases)
  // ============================================================================
  {
    id: 'CASE-01',
    name: 'TypeScript Strict Type Mismatch',
    category: 'build_compile',
    stepName: 'npm run build',
    exitCode: 2,
    modifiedFiles: ['src/services/billing.ts', 'src/types/user.ts'],
    rawLog: `
> hopper-app@1.0.0 build
> tsc -b && vite build

src/services/billing.ts:48:9 - error TS2322: Type 'string | undefined' is not assignable to type 'string'.
  Type 'undefined' is not assignable to type 'string'.

48         customerId: user.stripeCustomerId,
           ~~~~~~~~~~

  src/types/user.ts:12:3
    12   stripeCustomerId?: string;
         ~~~~~~~~~~~~~~~~
    The expected type comes from property 'customerId' which is declared here on type 'BillingInvoiceRequest'

Found 1 error in src/services/billing.ts:48
Process completed with exit code 2.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "TypeScript strict null check failure: optional property 'stripeCustomerId' (string | undefined) assigned to required property 'customerId' (string) in src/services/billing.ts.",
    relevantEvidenceKeywords: ['error TS2322', 'Type undefined is not assignable', 'stripeCustomerId', 'billing.ts:48'],
    acceptableAlternatives: ['Missing null-coalescing fallback or assertion for optional customerId property'],
    recommendedRemediation: "Add a null check or fallback: `customerId: user.stripeCustomerId ?? ''` or ensure user has registered stripe ID.",
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-02',
    name: 'Go Compiler Duplicate Symbol Declaration',
    category: 'build_compile',
    stepName: 'go build ./...',
    exitCode: 1,
    modifiedFiles: ['cmd/server/main.go', 'cmd/server/handlers.go'],
    rawLog: `
go: downloading github.com/gin-gonic/gin v1.9.1
# github.com/hopper/backend/cmd/server
cmd/server/handlers.go:24:6: HealthCheckHandler redeclared in this block
	cmd/server/main.go:88:6: other declaration of HealthCheckHandler
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Go package duplicate symbol collision: 'HealthCheckHandler' is declared in both cmd/server/handlers.go and cmd/server/main.go.",
    relevantEvidenceKeywords: ['HealthCheckHandler redeclared', 'other declaration', 'handlers.go:24', 'main.go:88'],
    acceptableAlternatives: ['Package-level symbol redeclaration in the same package'],
    recommendedRemediation: 'Remove the duplicate declaration of HealthCheckHandler from cmd/server/main.go or handlers.go.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-03',
    name: 'Rust Borrow Checker Lifetime Conflict',
    category: 'build_compile',
    stepName: 'cargo build --verbose',
    exitCode: 101,
    modifiedFiles: ['src/parser/log_chunker.rs'],
    rawLog: `
   Compiling hopper_engine v0.4.0 (/workspace)
error[E0502]: cannot borrow \`buffer\` as mutable because it is also borrowed as immutable
  --> src/parser/log_chunker.rs:65:9
   |
62 |     let first_line = buffer.first();
   |                      ------ immutable borrow occurs here
...
65 |     buffer.clear();
   |     ^^^^^^^^^^^^^^ mutable borrow occurs here
66 |     println!("{:?}", first_line);
   |                      ---------- immutable borrow later used here
For more information about this error, try \`rustc --explain E0502\`.
error: could not compile \`hopper_engine\` due to previous error
Process completed with exit code 101.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Rust borrow checker error E0502: buffer is cleared (mutable borrow) while first_line reference (immutable borrow) is still active in scope.",
    relevantEvidenceKeywords: ['error[E0502]', 'cannot borrow `buffer` as mutable', 'immutable borrow later used', 'log_chunker.rs:65'],
    acceptableAlternatives: ['Simultaneous mutable and immutable borrow violation'],
    recommendedRemediation: 'Clone first_line or drop its reference before calling buffer.clear().',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-04',
    name: 'C++ Linker Unresolved External Symbol',
    category: 'build_compile',
    stepName: 'cmake --build build',
    exitCode: 1,
    modifiedFiles: ['src/native/vector_math.cpp', 'CMakeLists.txt'],
    rawLog: `
[ 75%] Building CXX object CMakeFiles/hopper_native.dir/src/native/vector_math.cpp.o
[100%] Linking CXX shared library libhopper_native.so
/usr/bin/ld: CMakeFiles/hopper_native.dir/src/native/vector_math.cpp.o: in function \`hopper::compute_simd_dot_product(float const*, float const*, unsigned long)':
vector_math.cpp:(.text+0x142): undefined reference to \`hopper::simd_avx2_fallback(float const*, float const*, unsigned long)'
collect2: error: ld returned 1 exit status
ninja: build stopped: subcommand failed.
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "C++ linker error (collect2): undefined reference to 'simd_avx2_fallback' called by compute_simd_dot_product in vector_math.cpp.",
    relevantEvidenceKeywords: ['undefined reference to', 'collect2: error: ld returned 1', 'vector_math.cpp', 'simd_avx2_fallback'],
    acceptableAlternatives: ['Missing implementation file in CMake target sources or mismatched function signature'],
    recommendedRemediation: 'Provide implementation for simd_avx2_fallback or link the object file defining it in CMakeLists.txt.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-05',
    name: 'Vite Production Bundle Export Error',
    category: 'build_compile',
    stepName: 'npm run build',
    exitCode: 1,
    modifiedFiles: ['frontend/src/api/client.ts', 'frontend/src/api/schema.ts'],
    rawLog: `
vite v5.4.10 building for production...
transforming (120) src/App.tsx
[vite]: Rollup failed to resolve import "z" from "src/api/client.ts".
This is most likely unintended because it can break your application at runtime.
If you do want to externalize this module, add it to
build.rollupOptions.external
error during build:
Error: [vite]: Rollup failed to resolve import "z" from "src/api/client.ts". Does the file exist?
    at error (file:///workspace/node_modules/rollup/dist/es/shared/parseAst.js:337:30)
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Rollup bundle resolution failure: client.ts imports 'z' from './schema', but schema.ts does not export 'z'.",
    relevantEvidenceKeywords: ['Rollup failed to resolve import "z"', 'src/api/client.ts', 'Does the file exist'],
    acceptableAlternatives: ['Missing export in schema.ts or incorrect import module path'],
    recommendedRemediation: "Change import to `import { z } from 'zod'` in src/api/client.ts or export `z` from src/api/schema.ts.",
    difficulty: 'standard',
    isSynthetic: true,
  },

  // ============================================================================
  // 2. Unit and Integration Test Failures (5 Cases)
  // ============================================================================
  {
    id: 'CASE-06',
    name: 'Jest Expected Value Mismatch',
    category: 'test_assertion',
    stepName: 'npm test',
    exitCode: 1,
    modifiedFiles: ['src/auth/jwt.ts', 'tests/auth.test.ts'],
    rawLog: `
FAIL tests/auth.test.ts
  ● Auth Service > token expiration check
    expect(received).toEqual(expected) // deep equality
    - Expected: "expired"
    + Received: "active"
      34 |     const token = verifyToken(sampleToken);
    > 35 |     expect(token.status).toEqual('expired');
         |                          ^
      36 |   });
      at Object.<anonymous> (tests/auth.test.ts:35:26)
Test Suites: 1 failed, 12 passed, 13 total
Tests:       1 failed, 84 passed, 85 total
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Assertion mismatch in tests/auth.test.ts: token.status was expected to be 'expired' but was 'active' due to incorrect expiration timestamp comparison.",
    relevantEvidenceKeywords: ['expect(received).toEqual(expected)', 'Expected: "expired"', 'Received: "active"', 'tests/auth.test.ts:35'],
    acceptableAlternatives: ['Token expiration verification logic failing to transition state to expired'],
    recommendedRemediation: 'Check Date.now() / 1000 comparison against exp claim in src/auth/jwt.ts.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-07',
    name: 'Pytest AssertionError in API Serialization',
    category: 'test_assertion',
    stepName: 'pytest tests/api',
    exitCode: 1,
    modifiedFiles: ['app/serializers.py'],
    rawLog: `
=================================== FAILURES ===================================
___________________________ test_user_serializer_v2 ____________________________
tests/api/test_users.py:42: in test_user_serializer_v2
    assert response_data["tier"] == "pro_dev"
E   AssertionError: assert 'free' == 'pro_dev'
E     - pro_dev
E     + free
=========================== short test summary info ============================
FAILED tests/api/test_users.py::test_user_serializer_v2 - AssertionError: assert 'free' == 'pro_dev'
1 failed, 45 passed in 2.14s
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Pytest assertion failure in tests/api/test_users.py: response_data['tier'] evaluated to 'free' instead of 'pro_dev'.",
    relevantEvidenceKeywords: ['AssertionError: assert', '- pro_dev', '+ free', 'test_users.py:42'],
    acceptableAlternatives: ['Serializer default tier override not applying in v2 endpoint'],
    recommendedRemediation: 'Inspect tier property assignment in app/serializers.py to ensure pro_dev plan mapping is respected.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-08',
    name: 'Vitest Snapshot Mismatch in Navigation Component',
    category: 'test_assertion',
    stepName: 'npx vitest run',
    exitCode: 1,
    modifiedFiles: ['frontend/src/components/Header.tsx'],
    rawLog: `
FAIL  frontend/src/components/Header.test.tsx > Header Component > renders snapshot matching baseline
Snapshot \`Header Component > renders snapshot matching baseline\` mismatched
- Snapshot  - 1
+ Received  + 1
  <header>
-   <span class="badge">GATEWAY: HEALTHY</span>
+   <span class="badge">GATEWAY: ONLINE</span>
  </header>
    at /workspace/frontend/src/components/Header.test.tsx:28:31
Test Files  1 failed | 9 passed (10)
Tests       1 failed | 62 passed (63)
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Vitest snapshot regression in Header.test.tsx: badge text changed from 'GATEWAY: HEALTHY' to 'GATEWAY: ONLINE'.",
    relevantEvidenceKeywords: ['Snapshot mismatched', '- Snapshot', '+ Received', 'Header.test.tsx:28'],
    acceptableAlternatives: ['UI badge copy update requiring snapshot update'],
    recommendedRemediation: 'Update test snapshot with `npx vitest -u` or restore original badge text in Header.tsx.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-09',
    name: 'Playwright E2E Locator Element Missing',
    category: 'test_assertion',
    stepName: 'npx playwright test',
    exitCode: 1,
    modifiedFiles: ['src/views/Settings.vue'],
    rawLog: `
Running 18 tests using 3 workers
  1) [chromium] › settings.spec.ts:18:5 › Organization Settings › updates workspace name ─────────────
    Error: expect(locator).toBeVisible()
    Locator: locator('input[name="workspaceName"]')
    Expected: visible
    Received: <element(s) not found>
    Call log:
      - locator('input[name="workspaceName"]').waitFor({ state: 'visible', timeout: 5000 })
      at settings.spec.ts:24:48
  1 failed, 17 passed (12.4s)
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Playwright assertion error: input[name='workspaceName'] was not found in the DOM within 5000ms in settings.spec.ts.",
    relevantEvidenceKeywords: ['expect(locator).toBeVisible()', 'input[name="workspaceName"]', 'element(s) not found', 'settings.spec.ts:24'],
    acceptableAlternatives: ['Form input name attribute changed or component failed to mount'],
    recommendedRemediation: 'Verify selector name attribute in Settings.vue or ensure authentication state allows settings view to load.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-10',
    name: 'Go Test Unhandled Panic in Goroutine',
    category: 'test_assertion',
    stepName: 'go test -v ./pkg/queue',
    exitCode: 2,
    modifiedFiles: ['pkg/queue/worker.go'],
    rawLog: `
=== RUN   TestWorkerJobProcessing
panic: runtime error: invalid memory address or nil pointer dereference [recovered]
	panic: runtime error: invalid memory address or nil pointer dereference
[signal SIGSEGV: segmentation violation code=0x1 addr=0x0 pc=0x5a18b2]
goroutine 18 [running]:
github.com/hopper/backend/pkg/queue.(*Worker).ProcessJob(0xc0000a4000, 0x0)
	/workspace/pkg/queue/worker.go:78 +0x32
github.com/hopper/backend/pkg/queue.TestWorkerJobProcessing(0xc0000aa180)
	/workspace/pkg/queue/worker_test.go:34 +0x90
testing.tRunner(0xc0000aa180, 0x6e9a40)
	/usr/local/go/src/testing/testing.go:1595 +0xff
FAIL	github.com/hopper/backend/pkg/queue	0.045s
FAIL
Process completed with exit code 2.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Go runtime panic (SIGSEGV nil pointer dereference) in worker.go:78 when ProcessJob received a nil job pointer.",
    relevantEvidenceKeywords: ['invalid memory address or nil pointer dereference', 'worker.go:78', 'TestWorkerJobProcessing'],
    acceptableAlternatives: ['Missing nil guard on job pointer parameter'],
    recommendedRemediation: 'Add a nil check at the start of ProcessJob in pkg/queue/worker.go: `if job == nil { return ErrNilJob }`.',
    difficulty: 'standard',
    isSynthetic: true,
  },

  // ============================================================================
  // 3. Dependency Resolution Failures (5 Cases)
  // ============================================================================
  {
    id: 'CASE-11',
    name: 'NPM 404 Package Version Not Found',
    category: 'dependency_resolution',
    stepName: 'npm ci',
    exitCode: 1,
    modifiedFiles: ['package.json', 'package-lock.json'],
    rawLog: `
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/@acme%2fauth-sdk - Not found
npm error 404
npm error 404  '@acme/auth-sdk@^2.4.0' is not in this registry.
npm error 404 This is most likely not a problem with npm itself.
npm error 404 In most cases you or one of your dependencies are requesting
npm error 404 a package that doesn't exist.
npm error A complete log can be found in: /home/runner/.npm/_logs/2026-11-06T12_00_00_000Z-eresolve.log
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "NPM package registry 404: private scoped package '@acme/auth-sdk@^2.4.0' not found in public npm registry (missing npmrc auth or incorrect package name).",
    relevantEvidenceKeywords: ['npm error code E404', '404 Not Found', '@acme/auth-sdk@^2.4.0 is not in this registry'],
    acceptableAlternatives: ['Missing .npmrc credentials for private npm registry or typo in package name'],
    recommendedRemediation: 'Configure NPM_TOKEN in workflow or verify @acme/auth-sdk version on the internal registry.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-12',
    name: 'Python Pip Incompatible Dependency Versions',
    category: 'dependency_resolution',
    stepName: 'pip install -r requirements.txt',
    exitCode: 1,
    modifiedFiles: ['requirements.txt'],
    rawLog: `
Collecting fastapi==0.110.0 (from -r requirements.txt (line 1))
Collecting pydantic>=2.7.0 (from -r requirements.txt (line 2))
Collecting starlette<0.37.0,>=0.36.3 (from fastapi==0.110.0->-r requirements.txt (line 1))
ERROR: Cannot install -r requirements.txt (line 1) and starlette==0.38.2 because these package versions have conflicting dependencies.
The conflict is caused by:
    The user requested starlette==0.38.2
    fastapi 0.110.0 depends on starlette<0.37.0 and >=0.36.3
To fix this, you could try to:
1. Loosen the range of package versions you've specified
2. Remove package versions to allow pip to attempt to solve the dependency conflict
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Pip dependency conflict: explicit starlette==0.38.2 conflicts with fastapi 0.110.0 requirement for starlette<0.37.0.",
    relevantEvidenceKeywords: ['conflicting dependencies', 'fastapi 0.110.0 depends on starlette<0.37.0', 'user requested starlette==0.38.2'],
    acceptableAlternatives: ['Version pin conflict between direct and transitive dependencies'],
    recommendedRemediation: 'Downgrade starlette to ~0.36.3 or upgrade fastapi to a version supporting starlette 0.38+.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-13',
    name: 'Cargo Incompatible MSRV / Edition',
    category: 'dependency_resolution',
    stepName: 'cargo check',
    exitCode: 101,
    modifiedFiles: ['Cargo.toml'],
    rawLog: `
    Updating crates.io index
error: failed to select a version for \`tokio\`.
    ... required by package \`hopper-agent v0.1.0 (/workspace)\`
versions that meet the requirements \`=1.38.0\` are: 1.38.0
the package \`tokio\` requires rustc 1.70.0 or newer, but the current compiler is rustc 1.68.2 (9eb3afe9e 2023-03-27)
Process completed with exit code 101.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Cargo MSRV mismatch: dependency 'tokio = 1.38.0' requires rustc >= 1.70.0, but CI runner has rustc 1.68.2.",
    relevantEvidenceKeywords: ['failed to select a version for `tokio`', 'requires rustc 1.70.0 or newer', 'current compiler is rustc 1.68.2'],
    acceptableAlternatives: ['Rust toolchain in CI is outdated compared to package minimum supported rust version'],
    recommendedRemediation: 'Upgrade rust toolchain in GitHub Actions workflow: `actions-rs/toolchain` with toolchain: stable (>=1.70.0).',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-14',
    name: 'Maven Dependency Convergence Conflict',
    category: 'dependency_resolution',
    stepName: 'mvn verify',
    exitCode: 1,
    modifiedFiles: ['pom.xml'],
    rawLog: `
[INFO] --- maven-enforcer-plugin:3.3.0:enforce (enforce-dependency-convergence) @ core-service ---
[WARNING] 
Dependency convergence error for org.slf4j:slf4j-api:2.0.7 paths to dependency are:
+-com.hopper:core-service:1.0.0
  +-org.slf4j:slf4j-api:2.0.7
and
+-com.hopper:core-service:1.0.0
  +-org.springframework.boot:spring-boot-starter-web:3.1.2
    +-org.slf4j:slf4j-api:2.0.9
[ERROR] Rule 0: org.apache.maven.enforcer.rules.dependency.DependencyConvergence failed with message:
Failed while enforcing requirment: Dependency convergence error.
[INFO] BUILD FAILURE
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Maven enforcer plugin convergence violation: slf4j-api version conflict between 2.0.7 (direct) and 2.0.9 (transitive via spring-boot-starter-web).",
    relevantEvidenceKeywords: ['Dependency convergence error', 'slf4j-api:2.0.7', 'slf4j-api:2.0.9', 'BUILD FAILURE'],
    acceptableAlternatives: ['Mismatched transitive library versions violating dependencyManagement rules'],
    recommendedRemediation: 'Declare slf4j-api version 2.0.9 in <dependencyManagement> block in pom.xml.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-15',
    name: 'Bundler Ruby Gem Platform Incompatibility',
    category: 'dependency_resolution',
    stepName: 'bundle install',
    exitCode: 16,
    modifiedFiles: ['Gemfile', 'Gemfile.lock'],
    rawLog: `
Fetching gem metadata from https://rubygems.org/..........
Resolving dependencies...
Could not find gem 'nokogiri-1.15.4-x86_64-darwin' in rubygems.org.
Your bundle is locked to nokogiri (1.15.4-x86_64-darwin), but that version is only for
x86_64-darwin.
The current platform is x86_64-linux, which is not included in the Gemfile.lock platforms.
To add the current platform to the lockfile, run:
  bundle lock --add-platform x86_64-linux
Process completed with exit code 16.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Ruby Bundler platform mismatch: Gemfile.lock is locked to macOS 'x86_64-darwin' for nokogiri, but CI runner is 'x86_64-linux'.",
    relevantEvidenceKeywords: ['Could not find gem', 'x86_64-darwin', 'The current platform is x86_64-linux', 'bundle lock --add-platform'],
    acceptableAlternatives: ['Missing Linux native binary gem platform in lockfile'],
    recommendedRemediation: 'Run `bundle lock --add-platform x86_64-linux` locally and commit the updated Gemfile.lock.',
    difficulty: 'standard',
    isSynthetic: true,
  },

  // ============================================================================
  // 4. Environment & Configuration Failures (5 Cases)
  // ============================================================================
  {
    id: 'CASE-16',
    name: 'Missing Required Environment Variable',
    category: 'env_config',
    stepName: 'npm start',
    exitCode: 1,
    modifiedFiles: ['backend/src/config.ts'],
    rawLog: `
> hopper-backend@1.0.0 start
> node dist/server/index.js

[ConfigError]: Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY
    at validateConfig (/workspace/backend/src/config.ts:42:11)
    at Object.<anonymous> (/workspace/backend/src/server/index.ts:18:1)
    at Module._compile (node:internal/modules/cjs/loader:1376:14)
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Configuration validation failed: required environment variable 'SUPABASE_SERVICE_ROLE_KEY' is missing in CI environment.",
    relevantEvidenceKeywords: ['Missing required environment variable', 'SUPABASE_SERVICE_ROLE_KEY', 'validateConfig'],
    acceptableAlternatives: ['Unset secret or missing env definition in GitHub Actions step'],
    recommendedRemediation: 'Add SUPABASE_SERVICE_ROLE_KEY to repository secrets and pass it under the `env:` block in workflow YAML.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-17',
    name: 'Invalid Node.js Engine Version Mismatch',
    category: 'env_config',
    stepName: 'npm install',
    exitCode: 1,
    modifiedFiles: ['package.json'],
    rawLog: `
npm error code EBADENGINE
npm error engine Unsupported engine
npm error engine Not compatible with your version of node/npm: hopper-core@1.0.0
npm error notsup Not compatible with your version of node/npm: hopper-core@1.0.0
npm error notsup Required: {"node":">=20.0.0"}
npm error notsup Actual:   {"npm":"9.5.1","node":"v18.16.0"}
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Node engine mismatch (EBADENGINE): package requires node >= 20.0.0, but CI runner is running node v18.16.0.",
    relevantEvidenceKeywords: ['npm error code EBADENGINE', 'Required: {"node":">=20.0.0"}', 'Actual: {"node":"v18.16.0"}'],
    acceptableAlternatives: ['CI runner Node.js version too low for project engine constraint'],
    recommendedRemediation: 'Update setup-node action in workflow: `node-version: 20` or relax engines in package.json.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-18',
    name: 'Invalid YAML Workflow Configuration Syntax',
    category: 'env_config',
    stepName: 'actions/validate-yaml',
    exitCode: 1,
    modifiedFiles: ['.github/workflows/ci.yml'],
    rawLog: `
yamllint .github/workflows/
.github/workflows/ci.yml:34:7: [error] syntax error: mapping values are not allowed here (syntax)
      env:
        PORT: 8080
      - name: Next Step
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "YAML indentation syntax error: line 34 in .github/workflows/ci.yml has invalid indentation on 'env:' block preceding step list.",
    relevantEvidenceKeywords: ['syntax error: mapping values are not allowed here', 'ci.yml:34:7', 'yamllint'],
    acceptableAlternatives: ['Improper indentation level breaking YAML list hierarchy'],
    recommendedRemediation: 'Indent `- name: Next Step` properly or align `env:` under the preceding step.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-19',
    name: 'Missing Host Shared Library (libssl-dev)',
    category: 'env_config',
    stepName: 'cargo build',
    exitCode: 101,
    modifiedFiles: ['Cargo.toml'],
    rawLog: `
   Compiling openssl-sys v0.9.92
error: failed to run custom build command for \`openssl-sys v0.9.92\`
--- stderr
Could not find directory of OpenSSL installation, and this \`-sys\` crate cannot
proceed without this knowledge. If OpenSSL is installed and you would like to
use that installation, set the \`OPENSSL_DIR\` environment variable.
Package \`openssl\`, required by \`virtual:world\`, not found
Process completed with exit code 101.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Missing system dependency: OpenSSL headers / pkg-config (libssl-dev) not installed on CI runner host.",
    relevantEvidenceKeywords: ['Could not find directory of OpenSSL installation', 'Package openssl, required by virtual:world, not found', 'openssl-sys'],
    acceptableAlternatives: ['OPENSSL_DIR unset and libssl-dev missing from host system packages'],
    recommendedRemediation: 'Add `sudo apt-get update && sudo apt-get install -y libssl-dev pkg-config` before cargo build step.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-20',
    name: 'Working Directory Path Does Not Exist',
    category: 'env_config',
    stepName: 'Run tests in client dir',
    exitCode: 1,
    modifiedFiles: ['.github/workflows/ci.yml'],
    rawLog: `
/usr/bin/bash -e -o pipefail -c cd frontend/client && npm test
/usr/bin/bash: line 1: cd: frontend/client: No such file or directory
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Working directory error: `cd frontend/client` failed because the folder path does not exist in repository root.",
    relevantEvidenceKeywords: ['cd: frontend/client: No such file or directory', 'exit code 1'],
    acceptableAlternatives: ['Typo in working-directory setting or directory was moved/renamed'],
    recommendedRemediation: 'Update working-directory to `frontend` instead of `frontend/client` in workflow YAML.',
    difficulty: 'standard',
    isSynthetic: true,
  },

  // ============================================================================
  // 5. Docker & Container Failures (5 Cases)
  // ============================================================================
  {
    id: 'CASE-21',
    name: 'Docker Build Missing File in Context',
    category: 'container_docker',
    stepName: 'docker build -t app:latest .',
    exitCode: 1,
    modifiedFiles: ['Dockerfile', '.dockerignore'],
    rawLog: `
Step 1/8 : FROM node:20-alpine AS builder
 ---> f4886659c26f
Step 2/8 : WORKDIR /app
 ---> Using cache
Step 3/8 : COPY package*.json ./
 ---> Using cache
Step 4/8 : COPY prisma ./prisma
COPY failed: file not found in build context or excluded by .dockerignore: stat prisma: file does not exist
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Docker build error: `COPY prisma ./prisma` failed because 'prisma' directory does not exist in build context or is excluded by .dockerignore.",
    relevantEvidenceKeywords: ['COPY failed: file not found in build context', 'excluded by .dockerignore', 'stat prisma: file does not exist'],
    acceptableAlternatives: ['Directory ignored by .dockerignore or path typo in Dockerfile'],
    recommendedRemediation: 'Check .dockerignore to ensure prisma/ is not ignored, or create the prisma directory before building.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-22',
    name: 'Container Entrypoint Permission Denied',
    category: 'container_docker',
    stepName: 'docker run app:test',
    exitCode: 126,
    modifiedFiles: ['docker/entrypoint.sh'],
    rawLog: `
docker: Error response from daemon: failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: exec: "/app/docker/entrypoint.sh": permission denied: unknown.
Process completed with exit code 126.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Container startup failure (OCI exit code 126): entrypoint script '/app/docker/entrypoint.sh' lacks executable permissions (+x).",
    relevantEvidenceKeywords: ['exec: "/app/docker/entrypoint.sh": permission denied', 'OCI runtime create failed', 'exit code 126'],
    acceptableAlternatives: ['Entrypoint shell script missing executable bit chmod +x'],
    recommendedRemediation: 'Run `git update-index --chmod=+x docker/entrypoint.sh` or add `RUN chmod +x /app/docker/entrypoint.sh` in Dockerfile.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-23',
    name: 'Docker Base Image Tag Not Found',
    category: 'container_docker',
    stepName: 'docker build .',
    exitCode: 1,
    modifiedFiles: ['Dockerfile'],
    rawLog: `
Sending build context to Docker daemon  42.5MB
Step 1/12 : FROM python:3.11-alpine3.99
manifest for python:3.11-alpine3.99 not found: manifest unknown: manifest unknown
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Docker image pull failure: base image tag 'python:3.11-alpine3.99' does not exist in Docker Hub registry.",
    relevantEvidenceKeywords: ['manifest for python:3.11-alpine3.99 not found', 'manifest unknown'],
    acceptableAlternatives: ['Typo in base image tag version'],
    recommendedRemediation: 'Correct base image tag in Dockerfile to a valid version such as `python:3.11-alpine3.19`.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-24',
    name: 'Docker Daemon Socket Connection Refused',
    category: 'container_docker',
    stepName: 'docker compose up -d',
    exitCode: 1,
    modifiedFiles: ['.github/workflows/ci.yml'],
    rawLog: `
Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Docker daemon connection error: Docker service is not running or runner user does not have access to /var/run/docker.sock.",
    relevantEvidenceKeywords: ['Cannot connect to the Docker daemon at unix:///var/run/docker.sock', 'Is the docker daemon running'],
    acceptableAlternatives: ['Docker daemon not started on self-hosted runner'],
    recommendedRemediation: 'Ensure docker service is started: `sudo systemctl start docker` or check runner permissions.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-25',
    name: 'Container Host Port Already Allocated',
    category: 'container_docker',
    stepName: 'docker run -p 5432:5432 postgres:16',
    exitCode: 1,
    modifiedFiles: ['docker-compose.yml'],
    rawLog: `
docker: Error response from daemon: driver failed programming external connectivity on endpoint festive_mccarthy (a1b2c3d4): Bind for 0.0.0.0:5432 failed: port is already allocated.
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Port allocation conflict: Host port 5432 is already bound by another container or a local PostgreSQL service.",
    relevantEvidenceKeywords: ['Bind for 0.0.0.0:5432 failed', 'port is already allocated'],
    acceptableAlternatives: ['Competing service or stale container holding port 5432'],
    recommendedRemediation: 'Stop conflicting local service (`sudo systemctl stop postgresql`) or bind container to an alternative port (`-p 5433:5432`).',
    difficulty: 'standard',
    isSynthetic: true,
  },

  // ============================================================================
  // 6. Database Connectivity Failures (5 Cases)
  // ============================================================================
  {
    id: 'CASE-26',
    name: 'PostgreSQL Connection Refused on Localhost',
    category: 'database_connectivity',
    stepName: 'npm run test:db',
    exitCode: 1,
    modifiedFiles: ['backend/src/db/client.ts'],
    rawLog: `
> hopper-backend@1.0.0 test:db
> vitest run tests/database.test.ts

[DB Error] Failed to connect to postgresql://postgres:postgres@127.0.0.1:5432/hopper_test
connect ECONNREFUSED 127.0.0.1:5432
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1494:16) {
  errno: -111,
  code: 'ECONNREFUSED',
  syscall: 'connect',
  address: '127.0.0.1',
  port: 5432
}
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Database connection refused: PostgreSQL is not listening on 127.0.0.1:5432 (container down or service step omitted).",
    relevantEvidenceKeywords: ['connect ECONNREFUSED 127.0.0.1:5432', 'postgresql://postgres:postgres@127.0.0.1:5432'],
    acceptableAlternatives: ['Database container not started before running integration tests'],
    recommendedRemediation: 'Add postgresql service container in workflow `services:` or ensure `docker run -d -p 5432:5432 postgres:16` runs first.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-27',
    name: 'PostgreSQL Database Password Authentication Failed',
    category: 'database_connectivity',
    stepName: 'npm run migrate',
    exitCode: 1,
    modifiedFiles: ['backend/src/db/migrator.ts'],
    rawLog: `
> hopper-backend@1.0.0 migrate
> tsx src/db/migrator.ts

error: password authentication failed for user "hopper_admin"
    at Parser.parseErrorMessage (/workspace/node_modules/pg-protocol/dist/parser.js:287:98)
    at Parser.handlePacket (/workspace/node_modules/pg-protocol/dist/parser.js:126:29) {
  length: 104,
  severity: 'FATAL',
  code: '28P01',
  routine: 'auth_failed'
}
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "PostgreSQL authentication error (FATAL 28P01): password authentication failed for database user 'hopper_admin'.",
    relevantEvidenceKeywords: ['password authentication failed for user', 'code: 28P01', 'severity: FATAL'],
    acceptableAlternatives: ['Incorrect DB_PASSWORD environment variable or user not granted access'],
    recommendedRemediation: 'Verify POSTGRES_PASSWORD secret matches the password configured in PostgreSQL instance.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-28',
    name: 'Redis Connection Timeout on Hostname',
    category: 'database_connectivity',
    stepName: 'node start-worker.js',
    exitCode: 1,
    modifiedFiles: ['backend/src/queue/redis.ts'],
    rawLog: `
[ioredis] Unhandled error event: Error: connect ETIMEDOUT 10.0.4.15:6379
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1494:16)
[BullMQ] Failed to connect to Redis queue after 3 retries: Connection timeout
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Redis connectivity timeout: BullMQ worker failed to connect to 10.0.4.15:6379 after 3 retries (firewall block or incorrect IP).",
    relevantEvidenceKeywords: ['connect ETIMEDOUT', 'BullMQ Failed to connect to Redis queue', 'after 3 retries'],
    acceptableAlternatives: ['Network security group / firewall blocking port 6379 or Redis host down'],
    recommendedRemediation: 'Check REDIS_HOST configuration and verify security group rules allow traffic on port 6379.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-29',
    name: 'PostgreSQL Migration Concurrency Deadlock',
    category: 'database_connectivity',
    stepName: 'npm run migrate',
    exitCode: 1,
    modifiedFiles: ['backend/supabase/migrations/0004_workspace_tables.sql'],
    rawLog: `
Applying migration 0004_workspace_tables.sql...
error: deadlock detected
DETAIL:  Process 14210 waits for ShareLock on relation 16402; blocked by process 14211.
Process 14211 waits for ExclusiveLock on relation 16402; blocked by process 14210.
HINT:  See server log for query details.
CONTEXT:  while altering table "organizations"
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Database deadlock detected (Postgres code 40P01): competing transactions locked relation 'organizations' in reverse order during migration.",
    relevantEvidenceKeywords: ['deadlock detected', 'Process waits for ShareLock', 'while altering table "organizations"'],
    acceptableAlternatives: ['Concurrent migration runner or uncommitted active transaction holding locks on table'],
    recommendedRemediation: 'Ensure migrations execute with an advisory lock (`pg_advisory_lock`) to serialize schema alterations.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-30',
    name: 'MongoDB Topology Closed / Pool Destroyed',
    category: 'database_connectivity',
    stepName: 'npm test',
    exitCode: 1,
    modifiedFiles: ['src/db/mongo.ts'],
    rawLog: `
MongoServerSelectionError: Server selection timed out after 30000 ms
    at Topology.selectServer (/workspace/node_modules/mongodb/lib/sdam/topology.js:278:38)
    at Topology.executeOperation (/workspace/node_modules/mongodb/lib/sdam/topology.js:472:21)
    at Collection.find (/workspace/node_modules/mongodb/lib/collection.js:154:19)
    at runMicrotasks (<anonymous>)
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "MongoDB ServerSelectionError: server selection timed out after 30000ms because replica set topology could not be reached.",
    relevantEvidenceKeywords: ['MongoServerSelectionError', 'Server selection timed out after 30000 ms', 'Topology.selectServer'],
    acceptableAlternatives: ['MongoDB daemon not running or invalid connection string replicaSet parameter'],
    recommendedRemediation: 'Verify MONGODB_URI points to a running instance and check directConnection=true for standalone CI test containers.',
    difficulty: 'standard',
    isSynthetic: true,
  },

  // ============================================================================
  // 7. Network & Infrastructure Failures (5 Cases)
  // ============================================================================
  {
    id: 'CASE-31',
    name: 'DNS Host Resolution Failure (EAI_AGAIN)',
    category: 'network_infra',
    stepName: 'curl external api',
    exitCode: 6,
    modifiedFiles: ['src/services/rates.ts'],
    rawLog: `
curl: (6) Could not resolve host: api.rates-provider.com
FetchError: request to https://api.rates-provider.com/v1/latest failed, reason: getaddrinfo EAI_AGAIN api.rates-provider.com
    at ClientRequest.<anonymous> (/workspace/node_modules/node-fetch/lib/index.js:1491:11)
Process completed with exit code 6.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 30 },
    groundTruthRootCause: "DNS resolution failure: getaddrinfo EAI_AGAIN on api.rates-provider.com caused by transient runner DNS outage or invalid domain.",
    relevantEvidenceKeywords: ['Could not resolve host', 'getaddrinfo EAI_AGAIN', 'exit code 6'],
    acceptableAlternatives: ['Transient runner DNS timeout or domain does not exist'],
    recommendedRemediation: 'Add mock for external rates API in integration test suite or verify DNS configuration in runner /etc/resolv.conf.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-32',
    name: 'Upstream HTTP 502 Bad Gateway',
    category: 'network_infra',
    stepName: 'npm run test:e2e',
    exitCode: 1,
    modifiedFiles: ['tests/e2e/payments.spec.ts'],
    rawLog: `
payments.spec.ts:45:7 › Payments › processes card checkout
Error: Upstream gateway responded with HTTP 502 Bad Gateway
<html><head><title>502 Bad Gateway</title></head>
<body><center><h1>502 Bad Gateway</h1></center><hr><center>cloudflare</center></body></html>
    at PaymentClient.post (/workspace/src/lib/payment.ts:58:15)
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 2, uniquePrsAffected: 1, sameShaRetryPasses: 1, computedFlakinessScore: 60 },
    groundTruthRootCause: "External infrastructure failure: Cloudflare returned HTTP 502 Bad Gateway indicating payment provider origin server was down.",
    relevantEvidenceKeywords: ['HTTP 502 Bad Gateway', 'cloudflare', 'PaymentClient.post'],
    acceptableAlternatives: ['Third-party provider outage or reverse proxy connection failure'],
    recommendedRemediation: 'Stub payment gateway in CI using MSW or Playwright route mock.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-33',
    name: 'GitHub API Rate Limit Exceeded (429 / 403)',
    category: 'network_infra',
    stepName: 'actions/github-script',
    exitCode: 1,
    modifiedFiles: ['.github/workflows/labeler.yml'],
    rawLog: `
HttpError: API rate limit exceeded for user ID 1049283.
If you reach out to GitHub Support for help, please include the following details:
  Request ID: 9F12:4A18:23019:40B1
  Status: 403 Forbidden
  Documentation: https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 3, uniquePrsAffected: 2, sameShaRetryPasses: 0, computedFlakinessScore: 40 },
    groundTruthRootCause: "GitHub REST API rate limit exceeded (403 Forbidden): shared runner IP or token quota exhausted.",
    relevantEvidenceKeywords: ['API rate limit exceeded', 'Status: 403 Forbidden', 'resources-in-the-rest-api#rate-limiting'],
    acceptableAlternatives: ['Exhaustion of unauthenticated or authenticated GitHub API hourly quota'],
    recommendedRemediation: 'Provide a personal access token (GITHUB_TOKEN) with higher quota or cache API responses.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-34',
    name: 'TLS Certificate Validation Expired',
    category: 'network_infra',
    stepName: 'curl staging environment',
    exitCode: 60,
    modifiedFiles: ['scripts/smoke-test.sh'],
    rawLog: `
curl: (60) SSL certificate problem: certificate has expired
More details here: https://curl.se/docs/sslcerts.html
curl failed to verify the legitimacy of the server and therefore could not
establish a secure connection to it.
Process completed with exit code 60.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "TLS handshake failure (curl exit code 60): target server SSL/TLS certificate has expired.",
    relevantEvidenceKeywords: ['SSL certificate problem: certificate has expired', 'curl: (60)'],
    acceptableAlternatives: ['Expired certificate authority or invalid server certificate timestamp'],
    recommendedRemediation: 'Renew TLS certificate on target host or pass `-k` / `--insecure` strictly for isolated staging environments.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-35',
    name: 'Git Clone Host Key Verification Failed',
    category: 'network_infra',
    stepName: 'git submodule update --init',
    exitCode: 128,
    modifiedFiles: ['.gitmodules'],
    rawLog: `
Cloning into '/workspace/vendor/submodule'...
Host key verification failed.
fatal: Could not read from remote repository.
Please make sure you have the correct access rights
and the repository exists.
fatal: clone of 'git@github.com:acme/submodule.git' into submodule path 'vendor/submodule' failed
Process completed with exit code 128.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "SSH connection failure: Host key verification failed for github.com (known_hosts does not contain host key).",
    relevantEvidenceKeywords: ['Host key verification failed', 'Could not read from remote repository', 'exit code 128'],
    acceptableAlternatives: ['Missing github.com public key in ~/.ssh/known_hosts or missing SSH deploy key'],
    recommendedRemediation: 'Add `ssh-keyscan github.com >> ~/.ssh/known_hosts` before cloning submodules.',
    difficulty: 'standard',
    isSynthetic: true,
  },

  // ============================================================================
  // 8. Resource Exhaustion (5 Cases)
  // ============================================================================
  {
    id: 'CASE-36',
    name: 'Node.js V8 Heap Out Of Memory (Exit Code 137)',
    category: 'resource_exhaustion',
    stepName: 'npm run build',
    exitCode: 137,
    modifiedFiles: ['package.json', 'src/assets/large-dataset.json'],
    rawLog: `
vite v5.2.0 building for production...
transforming (1420/2840)
<--- Last few GCs --->
[1428:0x55a1200]    42150 ms: Mark-sweep 2045.2 (2055.8) -> 2040.1 (2056.8) MB, 412.3 / 0.0 ms  allocation failure; scavenge might not succeed
[1428:0x55a1200]    42680 ms: Mark-sweep 2046.8 (2056.8) -> 2041.5 (2057.8) MB, 520.1 / 0.0 ms  allocation failure; scavenge might not succeed

<--- JS stacktrace --->
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
 1: 0xb09c10 node::Abort() [node]
 2: 0xa1c285 node::FatalError(char const*, char const*) [node]
 3: 0xcf8e4e v8::Utils::ReportOOMFailure(v8::internal::Isolate*, char const*, bool) [node]
Process exited with code 137
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 10 },
    groundTruthRootCause: "Node.js V8 heap limit exceeded (2048MB ceiling): process received SIGKILL (exit code 137) during asset compilation.",
    relevantEvidenceKeywords: ['JavaScript heap out of memory', 'Ineffective mark-compacts near heap limit', 'Process exited with code 137'],
    acceptableAlternatives: ['Out of memory error due to large JSON asset bundling'],
    recommendedRemediation: 'Set `NODE_OPTIONS="--max-old-space-size=4096"` in workflow environment variables.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-37',
    name: 'Disk Space Exhaustion (ENOSPC)',
    category: 'resource_exhaustion',
    stepName: 'docker build -t test .',
    exitCode: 1,
    modifiedFiles: ['Dockerfile'],
    rawLog: `
[+] Building 45.2s (8/12)
 => [internal] load build definition from Dockerfile
 => => transferring dockerfile: 1.2kB
 => ERROR [builder 4/7] RUN npm run build:all
------
 > [builder 4/7] RUN npm run build:all:
#12 42.11 Error: ENOSPC: no space left on device, write
#12 42.12     at Object.writeSync (node:fs:948:3)
#12 42.12     at SyncWriteStream.write (node:internal/fs/sync_write_stream:12:11)
------
failed to solve: process "/bin/sh -c npm run build:all" did not complete successfully: exit code: 1
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Filesystem storage exhaustion (ENOSPC): runner disk ran out of space during build asset generation.",
    relevantEvidenceKeywords: ['ENOSPC: no space left on device', 'Error: ENOSPC', 'writeSync'],
    acceptableAlternatives: ['Disk partition filled up by docker build cache'],
    recommendedRemediation: 'Clean docker cache (`docker system prune -af`) or increase runner disk partition size.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-38',
    name: 'Java JVM OutOfMemoryError Metaspace',
    category: 'resource_exhaustion',
    stepName: 'mvn test',
    exitCode: 1,
    modifiedFiles: ['pom.xml'],
    rawLog: `
[INFO] Running com.hopper.AppTest
java.lang.OutOfMemoryError: Metaspace
	at java.lang.ClassLoader.defineClass1(Native Method)
	at java.lang.ClassLoader.defineClass(ClassLoader.java:1017)
[ERROR] Command execution failed.
org.apache.commons.exec.ExecuteException: Process exited with an error: 1 (Exit value: 1)
[INFO] BUILD FAILURE
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "JVM resource exhaustion: java.lang.OutOfMemoryError: Metaspace exceeded during test classloading.",
    relevantEvidenceKeywords: ['java.lang.OutOfMemoryError: Metaspace', 'defineClass1', 'BUILD FAILURE'],
    acceptableAlternatives: ['JVM Metaspace size ceiling exceeded by dynamic classloading'],
    recommendedRemediation: 'Configure MAVEN_OPTS: `-XX:MaxMetaspaceSize=512m -Xmx2048m`.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-39',
    name: 'Linux cgroup OOM Killer Terminated Process',
    category: 'resource_exhaustion',
    stepName: 'pytest tests/ml',
    exitCode: 137,
    modifiedFiles: ['tests/ml/test_embeddings.py'],
    rawLog: `
tests/ml/test_embeddings.py::test_large_matrix_multiplication 
Killed
dmesg: [ 412.981240] oom-killer: gfp_mask=0x1100cca(GFP_HIGHUSER_MOVABLE), order=0, oom_score_adj=0
dmesg: [ 412.981242] oom_reaper: reaped process 18420 (python), now anon-rss:0kB, file-rss:0kB, shmem-rss:0kB
Process completed with exit code 137.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Linux kernel OOM killer triggered: process 18420 (python) was SIGKILLed (code 137) due to cgroup memory exhaustion in test_large_matrix_multiplication.",
    relevantEvidenceKeywords: ['Killed', 'oom-killer', 'reaped process', 'exit code 137'],
    acceptableAlternatives: ['Container cgroup memory limit reached by PyTorch/NumPy matrix operation'],
    recommendedRemediation: 'Reduce batch size in test_large_matrix_multiplication or allocate higher container memory in runner.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-40',
    name: 'Thread Fork Exhaustion (EAGAIN)',
    category: 'resource_exhaustion',
    stepName: 'go test -race ./...',
    exitCode: 2,
    modifiedFiles: ['pkg/concurrency/pool.go'],
    rawLog: `
runtime/cgo: pthread_create failed: Resource temporarily unavailable
SIGABRT: abort
PC=0x7f9a1284b18b m=2 sigcode=18446744073709551610
goroutine 0 [idle]:
runtime: failed to create new OS thread (have 10001 already; errno=11)
fatal error: runtime: failed to create new OS thread
Process completed with exit code 2.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "OS thread exhaustion (errno 11 EAGAIN): runtime failed to create new OS thread after spawning 10,001 threads, hitting system ulimit (nproc).",
    relevantEvidenceKeywords: ['pthread_create failed: Resource temporarily unavailable', 'have 10001 already', 'failed to create new OS thread'],
    acceptableAlternatives: ['Unbounded thread pool spawning exceeding max OS user process limit'],
    recommendedRemediation: 'Bound goroutine/worker thread pool concurrency in pkg/concurrency/pool.go instead of spawning unbounded threads.',
    difficulty: 'standard',
    isSynthetic: true,
  },

  // ============================================================================
  // 9. Permission & Authentication Failures (5 Cases)
  // ============================================================================
  {
    id: 'CASE-41',
    name: 'AWS S3 Access Denied (403 Forbidden)',
    category: 'auth_permission',
    stepName: 'aws s3 sync dist s3://hopper-assets',
    exitCode: 1,
    modifiedFiles: ['.github/workflows/deploy.yml'],
    rawLog: `
upload failed: dist/assets/index.js to s3://hopper-assets/assets/index.js An error occurred (AccessDenied) when calling the PutObject operation: Access Denied
upload failed: dist/index.html to s3://hopper-assets/index.html An error occurred (AccessDenied) when calling the PutObject operation: Access Denied
fatal error: An error occurred (AccessDenied) when calling the PutObject operation: Access Denied
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "AWS IAM Authorization failure: AccessDenied calling s3:PutObject on s3://hopper-assets (IAM role lacks write permissions or bucket policy restricts access).",
    relevantEvidenceKeywords: ['AccessDenied', 'PutObject operation: Access Denied', 'upload failed'],
    acceptableAlternatives: ['Missing s3:PutObject permission on IAM role or invalid KMS key access'],
    recommendedRemediation: 'Grant `s3:PutObject` and `s3:PutObjectAcl` permissions on `arn:aws:s3:::hopper-assets/*` in IAM policy.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-42',
    name: 'GitHub GITHUB_TOKEN Insufficient Scope',
    category: 'auth_permission',
    stepName: 'gh release create v1.0.0',
    exitCode: 1,
    modifiedFiles: ['.github/workflows/release.yml'],
    rawLog: `
GraphQL: Resource not accessible by integration (createRelease)
HTTP 403: Forbidden
To use GitHub CLI with GitHub Actions, add 'permissions: contents: write' to your workflow.
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "GitHub Actions permission restriction: GITHUB_TOKEN lacks 'contents: write' scope required to create a release.",
    relevantEvidenceKeywords: ['Resource not accessible by integration (createRelease)', 'HTTP 403: Forbidden', 'contents: write'],
    acceptableAlternatives: ['Default read-only workflow permissions blocking release creation'],
    recommendedRemediation: 'Add `permissions: contents: write` at workflow or job level in .github/workflows/release.yml.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-43',
    name: 'File System Permission Denied (EACCES)',
    category: 'auth_permission',
    stepName: 'npm run test:cache',
    exitCode: 1,
    modifiedFiles: ['src/cache/disk.ts'],
    rawLog: `
[Error: EACCES: permission denied, mkdir '/var/cache/hopper'] {
  errno: -13,
  code: 'EACCES',
  syscall: 'mkdir',
  path: '/var/cache/hopper'
}
    at Object.mkdirSync (node:fs:1398:3)
    at initDiskCache (/workspace/src/cache/disk.ts:14:6)
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Filesystem permission denied (EACCES errno 13): non-root runner user cannot write to system directory '/var/cache/hopper'.",
    relevantEvidenceKeywords: ['EACCES: permission denied, mkdir', '/var/cache/hopper', 'errno: -13'],
    acceptableAlternatives: ['Attempting to write to root-owned system path without sudo'],
    recommendedRemediation: 'Use a local temporary directory (e.g. `os.tmpdir()` or `./.cache/hopper`) instead of system `/var/cache`.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-44',
    name: 'Docker Private Registry Authentication Failed',
    category: 'auth_permission',
    stepName: 'docker push ghcr.io/acme/hopper:latest',
    exitCode: 1,
    modifiedFiles: ['.github/workflows/publish.yml'],
    rawLog: `
The push refers to repository [ghcr.io/acme/hopper]
a1b2c3d4e5f6: Preparing
unauthorized: unauthenticated: User cannot be authenticated with the given credentials.
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "Docker registry authentication error: push to ghcr.io rejected with 'unauthorized: unauthenticated' (missing docker login step or expired token).",
    relevantEvidenceKeywords: ['unauthorized: unauthenticated', 'User cannot be authenticated with the given credentials', 'ghcr.io'],
    acceptableAlternatives: ['Missing docker/login-action step prior to docker push'],
    recommendedRemediation: 'Add `docker login ghcr.io -u ${{ github.actor }} -p ${{ secrets.GITHUB_TOKEN }}` before pushing.',
    difficulty: 'standard',
    isSynthetic: true,
  },
  {
    id: 'CASE-45',
    name: 'SSH Private Key Passphrase Mismatch',
    category: 'auth_permission',
    stepName: 'ssh-add /root/.ssh/id_rsa',
    exitCode: 1,
    modifiedFiles: ['.github/workflows/deploy.yml'],
    rawLog: `
Enter passphrase for /root/.ssh/id_rsa: 
Bad passphrase, try again for /root/.ssh/id_rsa: 
ssh-add: failed to read passphrase
fatal: Could not read from remote server
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 1, uniquePrsAffected: 1, sameShaRetryPasses: 0, computedFlakinessScore: 0 },
    groundTruthRootCause: "SSH authentication failure: Bad passphrase supplied for encrypted private key /root/.ssh/id_rsa.",
    relevantEvidenceKeywords: ['Bad passphrase', 'ssh-add: failed to read passphrase', 'exit code 1'],
    acceptableAlternatives: ['Incorrect SSH_PASSPHRASE secret or key requires unhandled passphrase in non-interactive shell'],
    recommendedRemediation: 'Use an unencrypted deploy key for CI automation or verify the SSH_PASSPHRASE secret.',
    difficulty: 'standard',
    isSynthetic: true,
  },

  // ============================================================================
  // 10. Flaky Tests & Intermittent Failures (5 Cases)
  // ============================================================================
  {
    id: 'CASE-46',
    name: 'Async Race Condition with Confirmed Retry Pass',
    category: 'flaky_test',
    stepName: 'npx playwright test tests/checkout.spec.ts',
    exitCode: 1,
    modifiedFiles: ['tests/checkout.spec.ts'],
    rawLog: `
1) [chromium] › tests/checkout.spec.ts:42:5 › Checkout Flow › renders 3D Secure modal
    Error: Timeout of 30000ms exceeded waiting for selector "[data-testid='3ds-frame']"
      at tests/checkout.spec.ts:48:19
      at Frame.waitForSelector (node_modules/playwright-core/lib/client/frame.js:321:12)
    Pending selector request:
      - waiting for locator('[data-testid=\\'3ds-frame\\']') to be visible
      - locator resolved to <iframe id="stripe-3ds-frame"> hidden
  1 failed, 24 passed (32.1s)
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 14, uniquePrsAffected: 6, sameShaRetryPasses: 4, computedFlakinessScore: 92 },
    groundTruthRootCause: "Flaky test async race condition: 3DS iframe modal render latency exceeds 30000ms threshold under CI virtual machine load, verified by 4 same-SHA retry passes.",
    relevantEvidenceKeywords: ['Timeout of 30000ms exceeded', 'data-testid=\'3ds-frame\'', 'locator resolved to <iframe id="stripe-3ds-frame"> hidden'],
    acceptableAlternatives: ['Intermittent third-party iframe render delay passing on rerun'],
    recommendedRemediation: 'Mock payment gateway response or wait for network idle before asserting modal visibility.',
    difficulty: 'ambiguous',
    isSynthetic: true,
  },
  {
    id: 'CASE-47',
    name: 'Shared Database State Pollution Across Parallel Test Workers',
    category: 'flaky_test',
    stepName: 'npm run test:parallel',
    exitCode: 1,
    modifiedFiles: ['tests/integration/user-repo.spec.ts'],
    rawLog: `
FAIL tests/integration/user-repo.spec.ts > UserRepository > creates unique user
  error: duplicate key value violates unique constraint "users_email_key"
  DETAIL: Key (email)=(test@example.com) already exists.
    at Parser.parseErrorMessage (/workspace/node_modules/pg-protocol/dist/parser.js:287:98)
    at UserRepository.create (/workspace/src/repositories/user.repository.ts:45:12)
    at /workspace/tests/integration/user-repo.spec.ts:24:5
Test Suites: 1 failed, 15 passed, 16 total
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 8, uniquePrsAffected: 4, sameShaRetryPasses: 2, computedFlakinessScore: 78 },
    groundTruthRootCause: "Flaky test state pollution: parallel test workers inserting static email 'test@example.com' without transactional rollback or isolated schemas.",
    relevantEvidenceKeywords: ['duplicate key value violates unique constraint "users_email_key"', 'Key (email)=(test@example.com) already exists'],
    acceptableAlternatives: ['Database test concurrency collision between parallel worker threads'],
    recommendedRemediation: 'Use dynamic randomized emails (e.g. `test-${Date.now()}-${workerId}@example.com`) or run tests in database transactions.',
    difficulty: 'multi_cause',
    isSynthetic: true,
  },
  {
    id: 'CASE-48',
    name: 'Timezone Midnight Date Rollover Flakiness',
    category: 'flaky_test',
    stepName: 'npm test',
    exitCode: 1,
    modifiedFiles: ['src/utils/date.ts'],
    rawLog: `
FAIL src/utils/date.spec.ts > DateUtils > formats relative date correctly
  AssertionError: expected 'Yesterday' to equal 'Today'
  - Expected: "Today"
  + Received: "Yesterday"
    at src/utils/date.spec.ts:38:15
    at runTest (node_modules/vitest/dist/runner.js:142:12)
Test Suites: 1 failed, 32 passed, 33 total
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 6, uniquePrsAffected: 3, sameShaRetryPasses: 2, computedFlakinessScore: 72 },
    groundTruthRootCause: "Flaky test date boundary condition: relative date calculation depends on runner local time during midnight UTC rollover.",
    relevantEvidenceKeywords: ['expected \'Yesterday\' to equal \'Today\'', 'date.spec.ts:38', 'AssertionError'],
    acceptableAlternatives: ['Unmocked system clock in test causing midnight flakiness'],
    recommendedRemediation: 'Freeze system time in tests using `vi.useFakeTimers()` and `vi.setSystemTime(new Date("2026-06-15T12:00:00Z"))`.',
    difficulty: 'ambiguous',
    isSynthetic: true,
  },
  {
    id: 'CASE-49',
    name: 'Unseeded Random Test Generator Intermittent Failure',
    category: 'flaky_test',
    stepName: 'pytest tests/fuzz',
    exitCode: 1,
    modifiedFiles: ['tests/fuzz/test_parser.py'],
    rawLog: `
tests/fuzz/test_parser.py:65: in test_parser_fuzz_random
    assert parsed.is_valid() is True
E   AssertionError: assert False is True
E    +  where False = <ParsedResult valid=False errors=['unclosed quote at pos 4']>.is_valid()
---------------------------- Captured stdout call -----------------------------
Generated random seed: 948102
Failing input payload: "abc\\"def"
=========================== 1 failed, 49 passed in 4.12s ===========================
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 5, uniquePrsAffected: 2, sameShaRetryPasses: 1, computedFlakinessScore: 68 },
    groundTruthRootCause: "Flaky fuzz test: unseeded random input generation intermittently discovers unhandled escaped quote edge case in parser.",
    relevantEvidenceKeywords: ['assert parsed.is_valid() is True', 'Generated random seed: 948102', 'unclosed quote at pos 4'],
    acceptableAlternatives: ['Edge case uncovered by property-based random testing requiring parser fix or fixed test seed'],
    recommendedRemediation: 'Handle escaped quote sequence in parser and pin property test seeds using `@settings(derandomize=True)`.',
    difficulty: 'multi_cause',
    isSynthetic: true,
  },
  {
    id: 'CASE-50',
    name: 'Dynamic Test Web Server Port Collision',
    category: 'flaky_test',
    stepName: 'npm run test:e2e:api',
    exitCode: 1,
    modifiedFiles: ['tests/e2e/server.ts'],
    rawLog: `
[E2E Server Setup] Starting test server on port 8080...
Error: listen EADDRINUSE: address already in use :::8080
    at Server.setupListenHandle [as _listen2] (node:net:1898:16)
    at listenInCluster (node:net:1946:12)
    at Server.listen (node:net:2034:7)
    at startTestServer (/workspace/tests/e2e/server.ts:18:10)
Process completed with exit code 1.
    `,
    historicalStats: { totalOccurrences: 9, uniquePrsAffected: 5, sameShaRetryPasses: 3, computedFlakinessScore: 84 },
    groundTruthRootCause: "Flaky test environment collision: fixed port 8080 is already bound by a previous test worker or background service.",
    relevantEvidenceKeywords: ['listen EADDRINUSE: address already in use :::8080', 'server.ts:18', 'startTestServer'],
    acceptableAlternatives: ['Competing parallel worker or unclosed server socket from prior run'],
    recommendedRemediation: 'Bind to port 0 (`server.listen(0)`) to let the OS allocate a random available port dynamically.',
    difficulty: 'standard',
    isSynthetic: true,
  },
];

