/**
 * Workflow Job Processor (transport-agnostic consumer core).
 *
 * Previously a BullMQ `Job` handler. The business logic is now independent of
 * any queue library so the same function is executed by:
 *   - the Vercel Queues push consumer
 *   - the cron drain (PostgreSQL job store)
 *   - the local polling worker
 *
 * Preserved behaviour: log extraction, secret redaction, failure
 * fingerprinting, flakiness scoring, AI diagnosis, database persistence,
 * GitHub PR comments and budget accounting (all inside HopperEngine), plus the
 * matrix-burst diagnosis lock.
 */

import { WorkflowJobEventData, JobDiagnosticResult } from '../../queue/types.js';
import { HopperEngine, CanonicalCIEvent, HopperEngineDependencies } from '../../engine/index.js';
import { sliceFailedStepLog } from '../../lib/parser/log-slicer.js';
import { computeFailureSignature } from '../../lib/parser/fingerprinter.js';
import {
  acquireDiagnosisLock,
  releaseDiagnosisLock,
  completeDiagnosisLock,
  getCoalescedDiagnosis,
  DiagnosisLock,
} from '../../queue/coordination.js';
import { RepositoryRepository } from '../../db/repositories/repository.repository.js';

export interface ProcessorDependencies extends HopperEngineDependencies {}

export interface ProcessorContext {
  /** Durable job row id, used for correlation in logs. */
  jobId?: string;
}

export async function processWorkflowJob(
  jobData: WorkflowJobEventData,
  deps: ProcessorDependencies = {},
  context: ProcessorContext = {}
): Promise<JobDiagnosticResult> {
  const engine = new HopperEngine(deps);

  // Matrix Burst Lock: prevent parallel matrix failures sharing one fingerprint
  // from calling the LLM simultaneously. Contention is *deferred*, not failed.
  let diagnosisLock: DiagnosisLock | null = null;

  if (jobData.conclusion === 'failure') {
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
      // Offline / mocked executor fallback
    }

    diagnosisLock = await acquireDiagnosisLock(
      repoId,
      `${jobData.commitSha}:${signatureObj.signatureHash}`
    );
    if (!diagnosisLock.acquired) {
      const coalescedReportId = await getCoalescedDiagnosis(diagnosisLock.key);
      if (coalescedReportId) {
        return {
          status: 'diagnosed',
          signatureHash: signatureObj.signatureHash,
          reportId: coalescedReportId,
          reason: 'Coalesced identical matrix burst failure to existing diagnostic report',
        };
      }
      return {
        status: 'deferred',
        reason: 'Another matrix job is diagnosing an identical failure signature',
      };
    }
  }

  try {
    const canonicalEvent: CanonicalCIEvent = {
      eventId:
        context.jobId ||
        `job-${jobData.githubJobId}-${jobData.githubRunAttempt}`,
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

    if (result.status === 'diagnosed' && result.reportId && diagnosisLock) {
      await completeDiagnosisLock(diagnosisLock.key, diagnosisLock.token, result.reportId);
    }

    return {
      status: result.status as JobDiagnosticResult['status'],
      signatureHash: result.signatureHash,
      flakinessScore: result.flakinessScore,
      failureId: result.failureId,
      reportId: result.reportId,
      prComment: result.prComment,
      reason: result.reason,
    };
  } finally {
    if (diagnosisLock) {
      const coalesced = await getCoalescedDiagnosis(diagnosisLock.key);
      if (!coalesced) {
        await releaseDiagnosisLock(diagnosisLock.key, diagnosisLock.token);
      }
    }
  }
}
