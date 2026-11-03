// src/server/index.ts
import express from "express";

// src/lib/github/app-auth.ts
import crypto from "crypto";
function verifyGitHubWebhookSignature(payloadRaw, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }
  if (!signatureHeader.startsWith("sha256=")) {
    return false;
  }
  const expectedSignature = signatureHeader.slice(7);
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payloadRaw);
  const computedSignature = hmac.digest("hex");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const computedBuffer = Buffer.from(computedSignature, "utf8");
  if (expectedBuffer.length !== computedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, computedBuffer);
}
function generateWebhookSignature(payloadRaw, secret) {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payloadRaw);
  return `sha256=${hmac.digest("hex")}`;
}

// src/lib/parser/ansi-stripper.ts
var ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
var GH_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s?/gm;
var GH_RUNNER_NOISE_REGEX = /^##\[(group|endgroup|command|debug)\].*$/gm;
function stripAnsiAndRunnerNoise(raw) {
  return raw.replace(ANSI_REGEX, "").replace(GH_TIMESTAMP_REGEX, "").replace(GH_RUNNER_NOISE_REGEX, "");
}

// src/lib/parser/secret-scrubber.ts
var SECRET_PATTERNS = [
  {
    name: "GitHub Personal/OAuth/App Token",
    pattern: /(gh[pousr]_[A-Za-z0-9_]{36,255})/g,
    replacement: "[REDACTED_GITHUB_TOKEN]"
  },
  {
    name: "OpenAI API Key",
    pattern: /(sk-[A-Za-z0-9]{20,})/g,
    replacement: "[REDACTED_API_KEY]"
  },
  {
    name: "Anthropic API Key",
    pattern: /(sk-ant-[A-Za-z0-9\-]{20,})/g,
    replacement: "[REDACTED_ANTHROPIC_KEY]"
  },
  {
    name: "AWS Access Key ID",
    pattern: /(AKIA[0-9A-Z]{16})/g,
    replacement: "[REDACTED_AWS_KEY]"
  },
  {
    name: "Bearer Token / JWT",
    pattern: /(Bearer\s+[A-Za-z0-9\-._~+/]+=*)/gi,
    replacement: "Bearer [REDACTED_JWT]"
  },
  {
    name: "Database Connection URI with Credentials",
    pattern: /(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"']+/gi,
    replacement: "$1://[REDACTED_DB_URI]"
  },
  {
    name: "RSA / EC / OpenSSH Private Key Block",
    pattern: /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g,
    replacement: "[REDACTED_PRIVATE_KEY]"
  }
];
function scrubSecrets(input) {
  let scrubbed = input;
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, replacement);
  }
  return scrubbed;
}

// src/lib/parser/log-slicer.ts
var ERROR_ANCHOR_PATTERNS = [
  /^\s*●\s+(.+)$/,
  // Jest / Vitest test failure header
  /^\s*FAIL\s+([^\s]+\.(?:test|spec)\.[jt]sx?)/,
  // Jest / Vitest / Playwright suite fail
  /^_{3,}\s+(.+?)\s+_{3,}$/,
  // Pytest failure section header
  /^E\s+(AssertionError|.*Error|.*Exception):/,
  // Pytest assertion line
  /^--- FAIL:\s+([^\s]+)\s+\(/,
  // Go test failure
  /^thread '([^']+)' panicked at/,
  // Rust / Cargo panic
  /^\s*\d+\)\s+(.+?)\s+FAILED$/,
  // RSpec / Cypress failure
  /##\[error\](.+)$/,
  // GitHub Actions explicit step error
  /(?:FATAL|Error|Exception|panic|Segmentation fault|Out of memory|Killed|ELIFECYCLE|ERR!)(?:\b|:)/i,
  /Process completed with exit code (\d+)/i
];
function sliceFailedStepLog(rawLog, maxLines = 45) {
  const boundedRaw = rawLog.length > 3e5 ? rawLog.slice(-3e5) : rawLog;
  const cleanText = scrubSecrets(stripAnsiAndRunnerNoise(boundedRaw));
  const lines = cleanText.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length > 0);
  let detectedExitCode = null;
  let detectedTestIdentifier = null;
  let detectedFramework = "generic";
  const anchorIndices = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const exitMatch = line.match(/Process completed with exit code (\d+)/i);
    if (exitMatch && detectedExitCode === null) {
      detectedExitCode = parseInt(exitMatch[1], 10);
    }
    const jestMatch = line.match(/^\s*●\s+(.+)$/);
    if (jestMatch && !detectedTestIdentifier) {
      detectedTestIdentifier = jestMatch[1].trim();
      detectedFramework = "jest";
    }
    const pytestMatch = line.match(/^FAILED\s+([^\s]+::[^\s]+)/);
    if (pytestMatch && !detectedTestIdentifier) {
      detectedTestIdentifier = pytestMatch[1].trim();
      detectedFramework = "pytest";
    }
    const goMatch = line.match(/^--- FAIL:\s+([^\s]+)/);
    if (goMatch && !detectedTestIdentifier) {
      detectedTestIdentifier = goMatch[1].trim();
      detectedFramework = "go";
    }
    if (ERROR_ANCHOR_PATTERNS.some((rx) => rx.test(line))) {
      anchorIndices.push(i);
      if (anchorIndices.length >= 3) break;
    }
  }
  const selectedLineNumbers = /* @__PURE__ */ new Set();
  const anchorSet = new Set(anchorIndices);
  if (anchorIndices.length > 0) {
    for (const anchorIdx of anchorIndices) {
      const start = Math.max(0, anchorIdx - 20);
      const end = Math.min(lines.length - 1, anchorIdx + 15);
      for (let idx = start; idx <= end; idx++) {
        selectedLineNumbers.add(idx);
      }
    }
  }
  for (let idx = Math.max(0, lines.length - 15); idx < lines.length; idx++) {
    selectedLineNumbers.add(idx);
  }
  const sortedIndices = Array.from(selectedLineNumbers).sort((a, b) => a - b).slice(-maxLines);
  const highlightedLines = sortedIndices.map((idx) => ({
    lineNo: idx + 1,
    text: lines[idx].slice(0, 300),
    // Guard against minified single-line dumps
    isErrorAnchor: anchorSet.has(idx)
  }));
  return {
    cleanedSnippet: highlightedLines.map((l) => `[L${l.lineNo}] ${l.text}`).join("\n"),
    highlightedLines,
    detectedExitCode,
    detectedTestIdentifier,
    detectedFramework
  };
}

// src/lib/parser/fingerprinter.ts
import crypto2 from "crypto";
function computeFailureSignature(jobName, stepName, testIdentifier, cleanedLogSnippet) {
  const normalizedLog = cleanedLogSnippet.replace(/^\[L\d+\]\s*/gm, "").replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<UUID>").replace(/\b0x[0-9a-fA-F]+\b/g, "<HEX>").replace(/\b[0-9a-f]{7,40}\b/g, "<HASH>").replace(/:(\d+):(\d+)/g, ":<LN>:<COL>").replace(/:(\d+)\b/g, ":<LN>").replace(/\b\d+(?:\.\d+)?\s*(?:ms|s|sec|seconds|minutes)\b/gi, "<DURATION>").replace(/\b(?:port|pid)\s+\d+\b/gi, "port <NUM>").replace(/\s+/g, " ").trim().slice(0, 1500);
  const canonicalKey = [
    `job:${jobName.toLowerCase().trim()}`,
    `step:${stepName.toLowerCase().trim()}`,
    `test:${(testIdentifier || "none").toLowerCase().trim()}`,
    `trace:${normalizedLog}`
  ].join("|");
  const signatureHash = crypto2.createHash("sha256").update(canonicalKey).digest("hex");
  return {
    signatureHash,
    normalizedTemplate: canonicalKey
  };
}

// src/lib/moat/flakiness-engine.ts
var TRANSIENT_PATTERNS = [
  /timeout\s+of\s+\d+ms\s+exceeded/i,
  /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i,
  /Test timeout of \d+ms exceeded/i,
  /waiting for (?:selector|locator|navigation)/i,
  /exit code 137/i,
  // Docker OOM / SIGKILL
  /Deadlock found when trying to get lock/i,
  /rate limit exceeded|429 Too Many Requests/i,
  /Connection reset by peer/i,
  /Socket closed unexpectedly/i
];
function calculateFlakinessScore(input) {
  let score = 0;
  if (input.sameShaRetryPasses >= 2) {
    score += 75;
  } else if (input.sameShaRetryPasses === 1) {
    score += 55;
  }
  if (input.uniquePrsAffected >= 4) {
    score += 25;
  } else if (input.uniquePrsAffected >= 2) {
    score += 15;
  }
  if (input.mainBranchOccurrences >= 2) {
    score += 10;
  }
  const matchesTransient = TRANSIENT_PATTERNS.some((rx) => rx.test(input.cleanedSnippet));
  if (matchesTransient) {
    score += 20;
  }
  return Math.min(99, Math.max(2, score));
}

// src/lib/ai/diagnose.ts
import { z } from "zod";
var DiagnosisOutputSchema = z.object({
  error_category: z.enum([
    "test_assertion",
    "timeout",
    "infra_oom",
    "build_compile",
    "network",
    "env_config"
  ]),
  root_cause_clues: z.string().describe("1-2 concise sentences explaining the exact technical root cause and why it happened."),
  likely_flaky_test: z.object({
    test_name: z.string().nullable().describe("Exact test name or file path if a test failed, else null."),
    is_likely_flaky: z.boolean(),
    reasoning: z.string().describe("Why this failure looks deterministic vs intermittent/flaky.")
  }),
  relevant_log_lines: z.array(
    z.object({
      line_number: z.number(),
      content: z.string(),
      explanation: z.string().describe("Short 5-8 word note on why this line matters")
    })
  ).min(3).max(12).describe("The 3-12 highest-signal log lines that prove the root cause."),
  suggested_next_check: z.string().describe("Concrete, actionable next step for the developer to fix or verify the failure."),
  local_repro_command: z.string().nullable().describe("Exact CLI command the developer can copy-paste to reproduce locally (e.g., npx vitest run auth.spec.ts).")
});
function buildDiagnosisSystemPrompt() {
  return `You are a Principal CI/CD Reliability Engineer diagnosing a failed GitHub Actions build.
Your job is to save the developer 20 minutes of log scrolling by producing an ultra-concise, high-signal diagnosis.

STRICT RULES:
1. Be direct, technical, and specific. Never write generic filler like "Check the logs for more details."
2. Correlate the stack trace with the 'Modified Files in Commit' list. If a modified file appears in the stack trace, explicitly name that file and line number in root_cause_clues.
3. If historical stats show 'same_sha_retry_passes > 0' or 'unique_prs_affected > 1', highlight that this is a recurring cross-run pattern.
4. For suggested_next_check and local_repro_command, provide the exact CLI test filter command (e.g., pytest path/to/test.py -k test_name, npx playwright test file.spec.ts, go test ./... -run TestName).
5. Respond ONLY with valid JSON matching the schema.`;
}
function buildDiagnosisUserPrompt(params) {
  return JSON.stringify(
    {
      context: {
        workflow: params.workflowName,
        job: params.jobName,
        failed_step: params.stepName,
        exit_code: params.exitCode,
        commit_sha: params.commitSha.slice(0, 7),
        modified_files_in_commit: params.modifiedFiles.slice(0, 25)
      },
      cross_run_history: params.historicalStats,
      sanitized_log_window: params.slicedLogSnippet
    },
    null,
    2
  );
}
async function synthesizeDiagnosis(params) {
  const snippet = params.slicedLogSnippet;
  const isOOM = params.exitCode === 137 || /exit code 137|Out of memory|Killed/i.test(snippet);
  const isTimeout = /timeout|timed out|exceeded/i.test(snippet);
  const isNetwork = /ECONNREFUSED|ECONNRESET|ETIMEDOUT|502 Bad Gateway/i.test(snippet);
  const isAssertion = /AssertionError|expect\(|expected.*to equal|FAILED/i.test(snippet);
  const isCompile = /SyntaxError|TypeError|TS\d+|cannot find module|compile error/i.test(snippet);
  let category = "test_assertion";
  if (isOOM) category = "infra_oom";
  else if (isTimeout) category = "timeout";
  else if (isNetwork) category = "network";
  else if (isCompile) category = "build_compile";
  const isFlaky = params.historicalStats.computedFlakinessScore >= 50;
  const rawLines = snippet.split("\n").filter((l) => l.trim().length > 0);
  const extractedLines = rawLines.slice(0, 6).map((line, idx) => {
    const lineMatch = line.match(/^\[L(\d+)\]\s*(.*)$/);
    const lineNum = lineMatch ? parseInt(lineMatch[1], 10) : idx + 1;
    const content = lineMatch ? lineMatch[2] : line;
    return {
      line_number: lineNum,
      content: content.slice(0, 180),
      explanation: idx === 0 ? "Primary error header" : idx === 1 ? "Failure assertion context" : "Stack execution frame"
    };
  });
  while (extractedLines.length < 3) {
    extractedLines.push({
      line_number: 100 + extractedLines.length,
      content: `Process failed during step "${params.stepName}" with exit code ${params.exitCode ?? 1}`,
      explanation: "Exit code termination confirmation"
    });
  }
  const matchingFiles = params.modifiedFiles.filter((f) => snippet.includes(f));
  const fileContext = matchingFiles.length > 0 ? `Directly correlated with recently modified file "${matchingFiles[0]}".` : `No recently modified files directly present in immediate stack frame.`;
  const rootCause = isOOM ? `Container process exceeded memory ceiling and received SIGKILL (exit code 137). ${fileContext}` : isTimeout ? `Operation exceeded execution deadline during "${params.stepName}". ${fileContext}` : isAssertion ? `Test assertion failed against expectation in "${params.stepName}". ${fileContext}` : `Build execution terminated with non-zero exit code (${params.exitCode ?? 1}). ${fileContext}`;
  const reproCommand = snippet.includes(".spec.ts") || snippet.includes(".test.ts") ? "npx vitest run --reporter=verbose" : snippet.includes("pytest") ? "pytest -v --tb=short" : snippet.includes("go test") ? "go test -v ./..." : "npm test";
  const result = {
    error_category: category,
    root_cause_clues: rootCause,
    likely_flaky_test: {
      test_name: params.stepName,
      is_likely_flaky: isFlaky,
      reasoning: isFlaky ? `High flakiness score (${params.historicalStats.computedFlakinessScore}%): observed across ${params.historicalStats.uniquePrsAffected} PRs with ${params.historicalStats.sameShaRetryPasses} retry passes.` : `Deterministic failure: reproducible assertion mismatch correlated with recent commit ${params.commitSha.slice(0, 7)}.`
    },
    relevant_log_lines: extractedLines,
    suggested_next_check: isOOM ? "Increase container memory limit or profile peak heap allocation during build/test execution." : isTimeout ? "Check for unbounded async promises, slow network mocks, or increase step timeout parameter." : "Review expected versus received values in the failing assertion and inspect correlated commit changes.",
    local_repro_command: reproCommand
  };
  return DiagnosisOutputSchema.parse(result);
}

// src/lib/github/pr-reporter.ts
var STICKY_COMMENT_MARKER = "<!-- ci-failure-diagnosis-sticky-marker -->";
function renderGitHubPrComment(p) {
  const shortSha = p.commitSha.slice(0, 7);
  const flakyBadge = p.flakinessScore >= 65 ? `\u{1F7E1} **Likely Flaky (${p.flakinessScore}% confidence)**` : p.flakinessScore >= 35 ? `\u{1F7E0} **Possible Intermittent (${p.flakinessScore}% confidence)**` : `\u{1F534} **Deterministic Failure (${100 - p.flakinessScore}% confidence)**`;
  const logBlock = p.diagnosis.relevant_log_lines.map((l) => `L${l.line_number}: ${l.content}  # <-- ${l.explanation}`).join("\n");
  let crossRunSection = "";
  if (p.orgPlan === "free") {
    crossRunSection = p.historicalStats.totalOccurrences > 1 ? `> \u{1F512} **Cross-Run Pattern Detected:** This exact error signature has failed **${p.historicalStats.totalOccurrences} times** across **${p.historicalStats.uniquePrsAffected} PRs** recently. [Unlock 30-day failure history, flaky test matrices & Slack alerts ($9/mo) \u2192](${p.billingUpgradeUrl})` : `> \u{1F4A1} *Tip: [Upgrade to Pro ($9/mo)](${p.billingUpgradeUrl}) to track cross-run failure history, auto-detect flaky tests across branches, and route alerts to Slack.*`;
  } else {
    crossRunSection = `> \u{1F4CA} **Cross-Run History:** Seen **${p.historicalStats.totalOccurrences}x** across **${p.historicalStats.uniquePrsAffected} PRs** (${p.historicalStats.sameShaRetryPasses} same-SHA retry passes). [View full timeline & branch breakdown \u2192](${p.dashboardReportUrl})`;
  }
  return `${STICKY_COMMENT_MARKER}
### \u26A1 CI Failure Report \u2014 \`${p.jobName}\` (${p.stepName})

| Commit | Status / Flakiness | Failed Test / Target | CI Run |
| :--- | :--- | :--- | :--- |
| \`${shortSha}\` | ${flakyBadge} | \`${p.diagnosis.likely_flaky_test.test_name ?? p.stepName}\` | [View GitHub Log \u2197](${p.runUrl}) |

#### 1. Root-Cause Clues
${p.diagnosis.root_cause_clues}

#### 2. Flaky Test Assessment
${p.diagnosis.likely_flaky_test.reasoning}

#### 3. Relevant Log Lines
\`\`\`text
${logBlock}
\`\`\`

#### 4. Suggested Next Check
* **Action:** ${p.diagnosis.suggested_next_check}
${p.diagnosis.local_repro_command ? `* **Run Locally:** \`${p.diagnosis.local_repro_command}\`` : ""}

---
${crossRunSection}
`;
}

// src/lib/billing/quota-guard.ts
var PLAN_LIMITS = {
  free: {
    monthlyRuns: 30,
    retentionDays: 1,
    slackAlerts: false,
    crossRunMoatUnlocked: false,
    autoRetryFlaky: false
  },
  pro_dev: {
    monthlyRuns: 250,
    retentionDays: 30,
    slackAlerts: false,
    crossRunMoatUnlocked: true,
    autoRetryFlaky: false
  },
  team: {
    monthlyRuns: 1e3,
    retentionDays: 90,
    slackAlerts: true,
    crossRunMoatUnlocked: true,
    autoRetryFlaky: true
  }
};
function checkQuota(plan, runsUsed, billingUrl = "https://hopper.dev/billing") {
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const allowed = runsUsed < limits.monthlyRuns;
  const remaining = Math.max(0, limits.monthlyRuns - runsUsed);
  let exhaustionNotice;
  if (!allowed) {
    if (plan === "free") {
      exhaustionNotice = `\u26A0\uFE0F **Hopper Monthly Free Quota Reached (${limits.monthlyRuns}/${limits.monthlyRuns} builds diagnosed).** [Upgrade to Pro ($9/mo) for 250 runs + full flaky test history \u2192](${billingUrl})`;
    } else {
      exhaustionNotice = `\u26A0\uFE0F **Hopper Plan Quota Reached (${limits.monthlyRuns}/${limits.monthlyRuns} runs).** [Upgrade plan to maintain automated CI diagnosis \u2192](${billingUrl})`;
    }
  }
  return {
    allowed,
    plan,
    runsUsed,
    limit: limits.monthlyRuns,
    remainingRuns: remaining,
    exhaustionNotice
  };
}

// src/server/index.ts
function createServer() {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "healthy",
      service: "Hopper CI Failure Diagnosis Engine",
      version: "1.0.0",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      uptimeSeconds: Math.floor(process.uptime())
    });
  });
  app.post("/api/webhooks/github", async (req, res) => {
    const signature = req.headers["x-hub-signature-256"];
    const eventName = req.headers["x-github-event"];
    const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET || "whsec_hopper_super_secret_signing_key_42";
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const isValid = verifyGitHubWebhookSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid HMAC-SHA256 signature" });
    }
    const payload = req.body;
    const isJobFailure = eventName === "workflow_job" && payload.action === "completed" && payload.workflow_job?.conclusion === "failure";
    const isWorkflowFailure = eventName === "workflow_run" && payload.action === "completed" && payload.workflow_run?.conclusion === "failure";
    if (!isJobFailure && !isWorkflowFailure) {
      return res.status(200).json({ status: "ignored", reason: "Not a failing CI completion event" });
    }
    const plan = payload.organization?.plan || "free";
    const runsUsed = payload.organization?.runs_used || 5;
    const quota = checkQuota(plan, runsUsed);
    if (!quota.allowed) {
      return res.status(402).json({
        status: "quota_exceeded",
        notice: quota.exhaustionNotice
      });
    }
    const jobName = payload.workflow_job?.name || payload.workflow_run?.name || "test / build";
    const stepName = payload.workflow_job?.steps?.find((s) => s.conclusion === "failure")?.name || "Execute Test Suite";
    const rawLog = payload.mock_log || "FAIL src/auth/jwt.spec.ts\n\u25CF Test failed\nProcess completed with exit code 1";
    const commitSha = payload.workflow_job?.head_sha || payload.workflow_run?.head_sha || "abcdef1234567890abcdef1234567890abcdef12";
    const sliced = sliceFailedStepLog(rawLog);
    const signatureObj = computeFailureSignature(jobName, stepName, sliced.detectedTestIdentifier, sliced.cleanedSnippet);
    const flakinessScore = calculateFlakinessScore({
      sameShaRetryPasses: 0,
      uniquePrsAffected: 1,
      totalOccurrences: 1,
      mainBranchOccurrences: 0,
      cleanedSnippet: sliced.cleanedSnippet
    });
    const diagnosis = await synthesizeDiagnosis({
      workflowName: payload.workflow_run?.name || "CI Pipeline",
      jobName,
      stepName,
      exitCode: sliced.detectedExitCode,
      commitSha,
      modifiedFiles: ["src/auth/jwt.ts", "src/auth/jwt.spec.ts"],
      historicalStats: {
        totalOccurrences: 1,
        uniquePrsAffected: 1,
        sameShaRetryPasses: 0,
        computedFlakinessScore: flakinessScore
      },
      slicedLogSnippet: sliced.cleanedSnippet
    });
    const prComment = renderGitHubPrComment({
      orgPlan: plan,
      repoFullName: payload.repository?.full_name || "acme/service",
      workflowName: "CI",
      jobName,
      stepName,
      commitSha,
      runUrl: payload.workflow_run?.html_url || "https://github.com/acme/service/actions/runs/12345",
      dashboardReportUrl: `https://hopper.dev/reports/${signatureObj.signatureHash}`,
      billingUpgradeUrl: "https://hopper.dev/billing",
      flakinessScore,
      historicalStats: {
        totalOccurrences: 1,
        uniquePrsAffected: 1,
        sameShaRetryPasses: 0
      },
      diagnosis
    });
    return res.status(200).json({
      status: "diagnosed",
      signatureHash: signatureObj.signatureHash,
      flakinessScore,
      diagnosis,
      prComment
    });
  });
  app.post("/api/diagnose/adhoc", async (req, res) => {
    const { rawLog, jobName = "build", stepName = "test", modifiedFiles = [] } = req.body;
    if (!rawLog || typeof rawLog !== "string") {
      return res.status(400).json({ error: "rawLog string is required" });
    }
    const sliced = sliceFailedStepLog(rawLog);
    const signature = computeFailureSignature(jobName, stepName, sliced.detectedTestIdentifier, sliced.cleanedSnippet);
    const flakinessScore = calculateFlakinessScore({
      sameShaRetryPasses: 0,
      uniquePrsAffected: 1,
      totalOccurrences: 1,
      mainBranchOccurrences: 0,
      cleanedSnippet: sliced.cleanedSnippet
    });
    const diagnosis = await synthesizeDiagnosis({
      workflowName: "Adhoc Diagnostic",
      jobName,
      stepName,
      exitCode: sliced.detectedExitCode,
      commitSha: "0000000000000000000000000000000000000000",
      modifiedFiles,
      historicalStats: {
        totalOccurrences: 1,
        uniquePrsAffected: 1,
        sameShaRetryPasses: 0,
        computedFlakinessScore: flakinessScore
      },
      slicedLogSnippet: sliced.cleanedSnippet
    });
    return res.json({
      signatureHash: signature.signatureHash,
      detectedFramework: sliced.detectedFramework,
      detectedExitCode: sliced.detectedExitCode,
      flakinessScore,
      diagnosis
    });
  });
  app.get("/api/dashboard/:orgSlug", (req, res) => {
    const { orgSlug } = req.params;
    res.json({
      orgSlug,
      plan: "pro_dev",
      monthlyRunsLimit: 250,
      runsUsedThisPeriod: 42,
      flakyTestLeaderboard: [
        {
          rank: 1,
          identifier: "src/auth/jwt-verifier.spec.ts > should verify valid signed JWT token",
          flakinessScore: 92.5,
          occurrences30d: 14,
          sameShaRetryPasses: 4,
          lastSeen: (/* @__PURE__ */ new Date()).toISOString()
        },
        {
          rank: 2,
          identifier: "tests/checkout.spec.ts \u203A Checkout Flow \u203A 3D Secure verification",
          flakinessScore: 78,
          occurrences30d: 9,
          sameShaRetryPasses: 2,
          lastSeen: new Date(Date.now() - 864e5).toISOString()
        }
      ]
    });
  });
  return app;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT || 3e3;
  const app = createServer();
  app.listen(port, () => {
    console.log(`[Hopper] Webhook Gateway listening on port ${port}`);
  });
}

export {
  ANSI_REGEX,
  GH_TIMESTAMP_REGEX,
  GH_RUNNER_NOISE_REGEX,
  stripAnsiAndRunnerNoise,
  SECRET_PATTERNS,
  scrubSecrets,
  ERROR_ANCHOR_PATTERNS,
  sliceFailedStepLog,
  computeFailureSignature,
  TRANSIENT_PATTERNS,
  calculateFlakinessScore,
  DiagnosisOutputSchema,
  buildDiagnosisSystemPrompt,
  buildDiagnosisUserPrompt,
  synthesizeDiagnosis,
  PLAN_LIMITS,
  checkQuota,
  verifyGitHubWebhookSignature,
  generateWebhookSignature,
  STICKY_COMMENT_MARKER,
  renderGitHubPrComment,
  createServer
};
//# sourceMappingURL=chunk-URF3AEHA.js.map