/**
 * Diagnostic Router (Ad-hoc CLI, manual developer failure triage, and diagnosis history).
 */

import { Router, Request, Response, NextFunction } from 'express';
import { sliceFailedStepLog } from '../../lib/parser/log-slicer.js';
import { computeFailureSignature } from '../../lib/parser/fingerprinter.js';
import { calculateFlakinessScore } from '../../lib/moat/flakiness-engine.js';
import { synthesizeDiagnosis } from '../../lib/ai/diagnose.js';
import { DiagnosticReportRepository } from '../../db/repositories/diagnostic-report.repository.js';
import { WorkspaceRepository } from '../../db/repositories/workspace.repository.js';
import { UserProfileRepository } from '../../db/repositories/user-profile.repository.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/error-handler.js';

export function createDiagnoseRouter(
  diagnosticReportRepo: DiagnosticReportRepository = new DiagnosticReportRepository(),
  workspaceRepo: WorkspaceRepository = new WorkspaceRepository(),
  userProfileRepo: UserProfileRepository = new UserProfileRepository()
): Router {
  const router = Router();
  const auth = requireAuth(userProfileRepo);

  // Live diagnosis history for the active workspace
  router.get('/history', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaceId = req.query.workspaceId as string | undefined;
      if (!workspaceId) {
        return res.json({ success: true, count: 0, diagnoses: [] });
      }

      const ws = await workspaceRepo.findById(workspaceId);
      if (!ws) {
        throw ApiError.notFound(`Workspace with ID ${workspaceId} not found`);
      }

      if (!ws.is_public) {
        const role = req.userProfileId ? await workspaceRepo.getUserRoleInWorkspace(workspaceId, req.userProfileId) : null;
        if (!role && ws.owner_id !== req.userProfileId) {
          throw ApiError.forbidden('You do not have access to this private workspace');
        }
      }

      const rawDiagnoses = await diagnosticReportRepo.listRecentForWorkspace(workspaceId, 50);

      return res.json({
        success: true,
        count: rawDiagnoses.length,
        diagnoses: rawDiagnoses.map((d) => ({
          id: d.id,
          failureId: d.failure_id,
          repoFullName: d.repo_full_name,
          workflowName: d.workflow_name,
          jobName: d.job_name,
          failedStepName: d.failed_step_name,
          commitSha: d.commit_sha,
          branch: d.branch,
          prNumber: d.pr_number,
          signatureHash: d.signature_hash,
          errorCategory: d.error_category || 'test_assertion',
          flakinessScore: d.flakiness_score ? Number(d.flakiness_score) : 0,
          rootCauseClues: d.root_cause_clues,
          likelyFlakyTest: d.likely_flaky_test,
          suggestedNextCheck: d.suggested_next_check,
          localReproCommand: d.local_repro_command,
          llmModelUsed: d.llm_model_used,
          promptTokens: d.prompt_tokens,
          completionTokens: d.completion_tokens,
          createdAt: d.created_at,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  // Ad-hoc diagnostic endpoint for developer CLI or manual testing
  router.post('/adhoc', async (req: Request, res: Response) => {
    const { rawLog, jobName = 'build', stepName = 'test', modifiedFiles = [] } = req.body;

    if (!rawLog || typeof rawLog !== 'string') {
      return res.status(400).json({ error: 'rawLog string is required' });
    }

    const sliced = sliceFailedStepLog(rawLog);
    const signature = computeFailureSignature(jobName, stepName, sliced.detectedTestIdentifier, sliced.cleanedSnippet);
    const flakinessScore = calculateFlakinessScore({
      sameShaRetryPasses: 0,
      uniquePrsAffected: 1,
      totalOccurrences: 1,
      mainBranchOccurrences: 0,
      cleanedSnippet: sliced.cleanedSnippet,
    });

    const diagnosis = await synthesizeDiagnosis({
      workflowName: 'Adhoc Diagnostic',
      jobName,
      stepName,
      exitCode: sliced.detectedExitCode,
      commitSha: '0000000000000000000000000000000000000000',
      modifiedFiles,
      historicalStats: {
        totalOccurrences: 1,
        uniquePrsAffected: 1,
        sameShaRetryPasses: 0,
        computedFlakinessScore: flakinessScore,
      },
      slicedLogSnippet: sliced.cleanedSnippet,
    });

    return res.json({
      signatureHash: signature.signatureHash,
      detectedFramework: sliced.detectedFramework,
      detectedExitCode: sliced.detectedExitCode,
      flakinessScore,
      diagnosis: {
        ...diagnosis,
        root_cause_clues: diagnosis.root_cause_clues,
        likely_flaky_test: {
          ...diagnosis.likely_flaky_test,
          is_flaky: diagnosis.likely_flaky_test.is_likely_flaky,
          confidence: flakinessScore,
          test_name: diagnosis.likely_flaky_test.test_name || stepName,
        },
        relevant_log_lines: diagnosis.relevant_log_lines,
        recommended_next_checks: [
          diagnosis.suggested_next_check,
          diagnosis.local_repro_command ? `Local repro: ${diagnosis.local_repro_command}` : 'Inspect failure patterns across recent runs.',
        ].filter(Boolean),
      },
    });
  });

  return router;
}

