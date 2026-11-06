/**
 * Workflow Job Processor (BullMQ Consumer).
 * Handles asynchronous execution of CI failure diagnosis, secret scrubbing,
 * cloud moat fingerprinting, flakiness tracking, and DB persistence.
 * Delegates core orchestration directly to HopperEngine.
 */

import { Job, DelayedError } from 'bullmq';
import { WorkflowJobEventData, JobDiagnosticResult } from '../../queue/types.js';
import { HopperEngine, CanonicalCIEvent, HopperEngineDependencies } from '../../engine/index.js';
import { sliceFailedStepLog } from '../../lib/parser/log-slicer.js';
import { computeFailureSignature } from '../../lib/parser/fingerprinter.js';
import { acquireDiagnosisLock, releaseDiagnosisLock, DiagnosisLock } from '../../queue/redis.js';
import { RepositoryRepository } from '../../db/repositories/repository.repository.js';

export interface ProcessorDependencies extends HopperEngineDependencies {}

export async function processWorkflowJob(
  jobData: WorkflowJobEventData,
  deps: ProcessorDependencies = {},
  job?: Job<WorkflowJobEventData>
): Promise<JobDiagnosticResult> {
  const engine = new HopperEngine(deps);

  // Matrix Burst Lock: Prevent parallel matrix failures with same fingerprint from calling LLM simultaneously
  let diagnosisLock: DiagnosisLock | null = null;
  if (job && jobData.conclusion === 'failure') {
    const rawLog = jobData.rawLog || '';
    const sliced = sliceFailedStepLog(rawLog);
    const signatureObj = computeFailureSignature(
      jobData.jobName,
      jobData.stepName,
      sliced.detectedTestIdentifier,
      sliced.cleanedSnippet
    );
    const repoRepo = deps.repoRepo || new RepositoryRepository(deps.executor);
    let repoId = `repo-${jobData.githubRepoId}`;
    try {
      if (typeof repoRepo.findByGithubRepoId === 'function') {
        const repo = await repoRepo.findByGithubRepoId(jobData.githubRepoId);
        if (repo?.id) repoId = repo.id;
      }
    } catch {
      // In tests/offline fallback
    }

    diagnosisLock = await acquireDiagnosisLock(repoId, signatureObj.signatureHash);
    if (!diagnosisLock.acquired) {
      await job.moveToDelayed(Date.now() + 5000, job.token);
      throw new DelayedError();
    }
  }

  try {
    const canonicalEvent: CanonicalCIEvent = {
      eventId: job?.id ? String(job.id) : `job-${jobData.githubJobId}-${jobData.githubRunAttempt}`,
      source: 'github',
      installationId: jobData.installationId,
      orgLogin: jobData.orgLogin,
      accountType: jobData.accountType,
      githubRepoId: jobData.githubRepoId,
      repoFullName: jobData.repoFullName,
      githubRunId: jobData.githubRunId,
      githubJobId: jobData.githubJobId,
      githubRunAttempt: jobData.githubRunAttempt,
      workflowName: jobData.workflowName,
      jobName: jobData.jobName,
      stepName: jobData.stepName,
      conclusion: jobData.conclusion,
      commitSha: jobData.commitSha,
      branch: jobData.branch,
      prNumber: jobData.prNumber ?? undefined,
      actorLogin: jobData.actorLogin ?? undefined,
      rawLog: jobData.rawLog,
      modifiedFiles: jobData.modifiedFiles,
      runUrl: jobData.runUrl,
      timestamp: new Date().toISOString(),
    };

    const result = await engine.processEvent(canonicalEvent, {
      rawLog: jobData.rawLog,
      modifiedFiles: jobData.modifiedFiles,
    });

    return {
      status: result.status as any,
      signatureHash: result.signatureHash,
      flakinessScore: result.flakinessScore,
      failureId: result.failureId,
      reportId: result.reportId,
      prComment: result.prComment,
      reason: result.reason,
    };
  } finally {
    if (diagnosisLock) {
      await releaseDiagnosisLock(diagnosisLock.key, diagnosisLock.token);
    }
  }
}

/**
 * BullMQ Worker Handler adapter.
 */
export async function handleWorkflowJob(job: Job<WorkflowJobEventData>): Promise<JobDiagnosticResult> {
  return processWorkflowJob(job.data, {}, job);
}
