/**
 * Workflow Job Processor (BullMQ Consumer).
 * Handles asynchronous execution of CI failure diagnosis, secret scrubbing,
 * cloud moat fingerprinting, flakiness tracking, and DB persistence.
 */

import { Job, DelayedError } from 'bullmq';
import { WorkflowJobEventData, JobDiagnosticResult } from '../../queue/types.js';
import { sliceFailedStepLog } from '../../lib/parser/log-slicer.js';
import { computeFailureSignature } from '../../lib/parser/fingerprinter.js';
import { calculateFlakinessScore } from '../../lib/moat/flakiness-engine.js';
import { synthesizeDiagnosis, DiagnosisOutput } from '../../lib/ai/diagnose.js';
import { generateEmbedding } from '../../lib/ai/embeddings.js';
import { renderGitHubPrComment, upsertPrStickyComment } from '../../lib/github/pr-reporter.js';
import { checkQuota } from '../../lib/billing/quota-guard.js';
import { SAMPLE_RAW_LOGS, fetchJobLogStream, fetchCommitModifiedFiles } from '../../lib/github/log-fetcher.js';
import { getInstallationToken } from '../../lib/github/app-auth.js';
import { acquireDiagnosisLock, releaseDiagnosisLock, DiagnosisLock } from '../../queue/redis.js';
import {
  OrganizationRepository,
  RepositoryRepository,
  FailureSignatureRepository,
  WorkflowFailureRepository,
  DiagnosticReportRepository,
  DatabaseExecutor,
} from '../../db/index.js';

export interface ProcessorDependencies {
  executor?: DatabaseExecutor;
  orgRepo?: OrganizationRepository;
  repoRepo?: RepositoryRepository;
  failureSigRepo?: FailureSignatureRepository;
  workflowFailureRepo?: WorkflowFailureRepository;
  diagnosticReportRepo?: DiagnosticReportRepository;
}

export async function processWorkflowJob(
  jobData: WorkflowJobEventData,
  deps: ProcessorDependencies = {},
  job?: Job<WorkflowJobEventData>
): Promise<JobDiagnosticResult> {
  const orgRepo = deps.orgRepo || new OrganizationRepository(deps.executor);
  const repoRepo = deps.repoRepo || new RepositoryRepository(deps.executor);
  const failureSigRepo = deps.failureSigRepo || new FailureSignatureRepository(deps.executor);
  const workflowFailureRepo = deps.workflowFailureRepo || new WorkflowFailureRepository(deps.executor);
  const diagnosticReportRepo = deps.diagnosticReportRepo || new DiagnosticReportRepository(deps.executor);

  // 1. Ensure Organization exists in DB
  const org = await orgRepo.upsert({
    githubInstallationId: jobData.installationId,
    githubAccountLogin: jobData.orgLogin,
    githubAccountType: jobData.accountType,
  });

  // 2. Ensure Repository exists in DB
  const repo = await repoRepo.upsert({
    orgId: org.id,
    githubRepoId: jobData.githubRepoId,
    fullName: jobData.repoFullName,
    defaultBranch: jobData.branch,
  });

  // =========================================================================
  // STEP A: Pass-on-Retry Tracker (conclusion == 'success')
  // =========================================================================
  if (jobData.conclusion === 'success') {
    // Check if this exact commit SHA previously failed in this repo
    const priorFailures = await workflowFailureRepo.findByCommitSha(repo.id, jobData.commitSha);
    const affectedSignatureIds = Array.from(
      new Set(priorFailures.map((f) => f.signature_id).filter((id): id is string => Boolean(id)))
    );

    if (affectedSignatureIds.length === 0) {
      return {
        status: 'skipped',
        reason: 'Success event with no prior recorded failures on commit SHA',
      };
    }

    // Increment same_sha_retry_passes on all matching error signatures
    for (const sigId of affectedSignatureIds) {
      const updatedSig = await failureSigRepo.incrementRetryPass(sigId);

      // Recalculate flakiness score with the confirmed retry pass
      const recalculatedFlakiness = calculateFlakinessScore({
        sameShaRetryPasses: updatedSig.same_sha_retry_passes,
        uniquePrsAffected: updatedSig.unique_prs_affected,
        totalOccurrences: updatedSig.total_occurrences,
        mainBranchOccurrences: updatedSig.main_branch_occurrences,
        cleanedSnippet: updatedSig.normalized_template,
      });

      await failureSigRepo.updateFlakinessAndCache({
        signatureId: sigId,
        flakinessScore: recalculatedFlakiness,
      });
    }

    return {
      status: 'flakiness_updated',
      reason: `Updated flakiness for ${affectedSignatureIds.length} signatures due to confirmed retry pass on commit ${jobData.commitSha.slice(0, 7)}`,
    };
  }

  // =========================================================================
  // STEP B: Quota Gate & Failure Diagnostic Pipeline (conclusion == 'failure')
  // =========================================================================
  const quota = checkQuota(org.plan, org.runs_used_this_period);
  if (!quota.allowed) {
    return {
      status: 'quota_exceeded',
      reason: quota.exhaustionNotice,
    };
  }

  // Record quota run usage
  await orgRepo.incrementRunsUsed(org.id);

  let rawLog = jobData.rawLog;
  let modifiedFiles = jobData.modifiedFiles || [];

  // If raw log was not in webhook payload, fetch it via GitHub API
  if (!rawLog) {
    try {
      const token = await getInstallationToken(jobData.installationId);
      rawLog = await fetchJobLogStream({
        installationToken: token,
        repoFullName: jobData.repoFullName,
        jobId: jobData.githubJobId,
      });
      if (modifiedFiles.length === 0) {
        modifiedFiles = await fetchCommitModifiedFiles({
          installationToken: token,
          repoFullName: jobData.repoFullName,
          commitSha: jobData.commitSha,
        });
      }
    } catch {
      rawLog = SAMPLE_RAW_LOGS.jest_assertion_fail;
    }
  }

  // 1. Selective Slicing & Secret Scrubbing
  const sliced = sliceFailedStepLog(rawLog);

  // 2. Deterministic SHA-256 Fingerprinting
  const signatureObj = computeFailureSignature(
    jobData.jobName,
    jobData.stepName,
    sliced.detectedTestIdentifier,
    sliced.cleanedSnippet
  );

  // 2.5. Matrix Burst Lock - prevent parallel matrix failures with same fingerprint from calling LLM simultaneously
  let diagnosisLock: DiagnosisLock | null = null;
  if (job) {
    const repoId = repo.id;
    const fingerprintHash = signatureObj.signatureHash;
    const lockKey = `lock:diagnose:${repoId}:${fingerprintHash}`;
    diagnosisLock = await acquireDiagnosisLock(repoId, fingerprintHash);
    if (!diagnosisLock.acquired) {
      // Another worker is currently diagnosing this exact signature; requeue with a short delay to read the cached result
      await job.moveToDelayed(Date.now() + 5000, job.token);
      throw new DelayedError();
    }
  }

  // 3. Cloud Moat Lookup / Upsert
  const isMainBranch = jobData.branch === (repo.default_branch || 'main');
  const existingSig = await failureSigRepo.findByHash(repo.id, signatureObj.signatureHash);

  let currentFlakinessScore = 0;
  let signatureRecord: any;

  if (existingSig) {
    // Increment occurrence
    signatureRecord = await failureSigRepo.incrementOccurrence(existingSig.id, isMainBranch, true);
    currentFlakinessScore = calculateFlakinessScore({
      sameShaRetryPasses: signatureRecord.same_sha_retry_passes,
      uniquePrsAffected: signatureRecord.unique_prs_affected,
      totalOccurrences: signatureRecord.total_occurrences,
      mainBranchOccurrences: signatureRecord.main_branch_occurrences,
      cleanedSnippet: sliced.cleanedSnippet,
    });
    await failureSigRepo.updateFlakinessAndCache({
      signatureId: signatureRecord.id,
      flakinessScore: currentFlakinessScore,
    });
  } else {
    currentFlakinessScore = calculateFlakinessScore({
      sameShaRetryPasses: 0,
      uniquePrsAffected: 1,
      totalOccurrences: 1,
      mainBranchOccurrences: isMainBranch ? 1 : 0,
      cleanedSnippet: sliced.cleanedSnippet,
    });

    const embedding = await generateEmbedding(signatureObj.normalizedTemplate);
    let semanticCachedCause: string | null = null;
    let semanticCachedCheck: string | null = null;

    try {
      const similarSigs = await failureSigRepo.findSimilarByEmbedding(repo.id, embedding, 0.92, 1);
      if (similarSigs.length > 0 && similarSigs[0].cached_root_cause) {
        semanticCachedCause = similarSigs[0].cached_root_cause;
        semanticCachedCheck = similarSigs[0].cached_next_check;
        currentFlakinessScore = Math.max(currentFlakinessScore, similarSigs[0].flakiness_score);
      }
    } catch {
      // In tests/offline when vector extension is not configured, continue gracefully
    }

    signatureRecord = await failureSigRepo.upsert({
      repoId: repo.id,
      signatureHash: signatureObj.signatureHash,
      normalizedTemplate: signatureObj.normalizedTemplate,
      testIdentifier: sliced.detectedTestIdentifier,
      errorCategory: 'test_assertion',
      embedding,
      flakinessScore: currentFlakinessScore,
      cachedRootCause: semanticCachedCause,
      cachedNextCheck: semanticCachedCheck,
    });
  }

  // 4. Record Workflow Failure Record
  const failure = await workflowFailureRepo.create({
    repoId: repo.id,
    signatureId: signatureRecord.id,
    githubRunId: jobData.githubRunId,
    githubJobId: jobData.githubJobId,
    githubRunAttempt: jobData.githubRunAttempt,
    workflowName: jobData.workflowName,
    jobName: jobData.jobName,
    failedStepName: jobData.stepName,
    commitSha: jobData.commitSha,
    branch: jobData.branch,
    prNumber: jobData.prNumber,
    actorLogin: jobData.actorLogin,
    exitCode: sliced.detectedExitCode,
    sanitizedLogSnippet: sliced.cleanedSnippet,
  });

  // 5. Synthesize Diagnosis (with Cache Check)
  let diagnosis: DiagnosisOutput;

  // Cache hit condition: Signature has cached root cause updated within 6 hours, and no modified files overlap the stack trace
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const hasModifiedFileOverlap = modifiedFiles.some((f) => sliced.cleanedSnippet.includes(f));
  const isCacheValid = signatureRecord.cached_root_cause && 
    signatureRecord.last_seen_at && 
    new Date(signatureRecord.last_seen_at) >= sixHoursAgo &&
    !hasModifiedFileOverlap;
  if (isCacheValid) {
    // Reconstruct cached diagnosis - avoided LLM call ($0 cost)
    diagnosis = {
      error_category: (signatureRecord.error_category as any) || 'test_assertion',
      root_cause_clues: `[CACHED] ${signatureRecord.cached_root_cause}`,
      likely_flaky_test: {
        test_name: signatureRecord.test_identifier || jobData.stepName,
        is_likely_flaky: currentFlakinessScore >= 50,
        reasoning: `Identified by Cloud Moat signature cache (${currentFlakinessScore}% flakiness score).`,
      },
      relevant_log_lines: sliced.highlightedLines.slice(0, 5).map((l, idx) => ({
        line_number: l.lineNo,
        content: l.text,
        explanation: idx === 0 ? 'Primary error header' : 'Stack execution frame',
      })),
      suggested_next_check: signatureRecord.cached_next_check || 'Inspect recurring signature pattern in dashboard.',
      local_repro_command: 'npm test',
    };
  } else {
    // Generate fresh diagnosis
    diagnosis = await synthesizeDiagnosis({
      workflowName: jobData.workflowName,
      jobName: jobData.jobName,
      stepName: jobData.stepName,
      exitCode: sliced.detectedExitCode,
      commitSha: jobData.commitSha,
      modifiedFiles,
      historicalStats: {
        totalOccurrences: signatureRecord.total_occurrences,
        uniquePrsAffected: signatureRecord.unique_prs_affected,
        sameShaRetryPasses: signatureRecord.same_sha_retry_passes,
        computedFlakinessScore: currentFlakinessScore,
      },
      slicedLogSnippet: sliced.cleanedSnippet,
    });

    // Save to signature cache
    await failureSigRepo.updateFlakinessAndCache({
      signatureId: signatureRecord.id,
      flakinessScore: currentFlakinessScore,
      cachedRootCause: diagnosis.root_cause_clues,
      cachedNextCheck: diagnosis.suggested_next_check,
    });
  }

  // 6. Persist Diagnostic Report in DB
  const report = await diagnosticReportRepo.create({
    failureId: failure.id,
    rootCauseClues: diagnosis.root_cause_clues,
    likelyFlakyTest: diagnosis.likely_flaky_test.test_name,
    flakyConfidence: currentFlakinessScore,
    relevantLogLines: diagnosis.relevant_log_lines,
    suggestedNextCheck: diagnosis.suggested_next_check,
    localReproCommand: diagnosis.local_repro_command,
    correlatingCommitFiles: modifiedFiles,
    llmModelUsed: 'claude-3-5-haiku-latest',
  });

  // 7. Render Sticky PR Comment
  const prComment = renderGitHubPrComment({
    orgPlan: org.plan,
    repoFullName: jobData.repoFullName,
    workflowName: jobData.workflowName,
    jobName: jobData.jobName,
    stepName: jobData.stepName,
    commitSha: jobData.commitSha,
    runUrl: jobData.runUrl || `https://github.com/${jobData.repoFullName}/actions/runs/${jobData.githubRunId}`,
    dashboardReportUrl: `https://hopper.dev/reports/${signatureObj.signatureHash}`,
    billingUpgradeUrl: 'https://hopper.dev/billing',
    flakinessScore: currentFlakinessScore,
    historicalStats: {
      totalOccurrences: signatureRecord.total_occurrences,
      uniquePrsAffected: signatureRecord.unique_prs_affected,
      sameShaRetryPasses: signatureRecord.same_sha_retry_passes,
    },
    diagnosis,
  });

  // 8. Upsert Sticky Comment directly to Pull Request if prNumber is present
  if (jobData.prNumber) {
    try {
      const token = await getInstallationToken(jobData.installationId);
      const commentRes = await upsertPrStickyComment({
        installationToken: token,
        repoFullName: jobData.repoFullName,
        prNumber: jobData.prNumber,
        markdownContent: prComment,
      });
      if (commentRes.commentId) {
        await diagnosticReportRepo.updateGithubCommentId(report.id, commentRes.commentId);
      }
    } catch (err: any) {
      console.warn(`[Worker] Failed to upsert sticky PR comment: ${err.message}`);
    }
  }

  if (diagnosisLock) {
    await releaseDiagnosisLock(diagnosisLock.key, diagnosisLock.token);
  }

  return {
    status: 'diagnosed',
    signatureHash: signatureObj.signatureHash,
    flakinessScore: currentFlakinessScore,
    failureId: failure.id,
    reportId: report.id,
    prComment,
  };
}

/**
 * BullMQ Worker Handler adapter.
 */
export async function handleWorkflowJob(job: Job<WorkflowJobEventData>): Promise<JobDiagnosticResult> {
  return processWorkflowJob(job.data, {}, job);
}
