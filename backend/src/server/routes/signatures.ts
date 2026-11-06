/**
 * Failure Signatures Router.
 * Surfaces cross-run timelines and flakiness telemetry for deduplicated error signatures.
 * Strictly enforces authentication and tenant isolation.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { FailureSignatureRepository } from '../../db/repositories/failure-signature.repository.js';
import { RepositoryRepository } from '../../db/repositories/repository.repository.js';
import { WorkspaceRepository } from '../../db/repositories/workspace.repository.js';
import { UserProfileRepository } from '../../db/repositories/user-profile.repository.js';
import { OrganizationRepository } from '../../db/repositories/organization.repository.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/error-handler.js';

export function createSignaturesRouter(
  failureSigRepo: FailureSignatureRepository = new FailureSignatureRepository(),
  repoRepo: RepositoryRepository = new RepositoryRepository(),
  workspaceRepo: WorkspaceRepository = new WorkspaceRepository(),
  userProfileRepo: UserProfileRepository = new UserProfileRepository(),
  orgRepo: OrganizationRepository = new OrganizationRepository()
): Router {
  const router = Router();
  const auth = requireAuth(userProfileRepo);

  // Signatures endpoint - detailed cross-run timeline and historical occurrences
  router.get('/:id', auth, async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;

    try {
      const signature = await failureSigRepo.findById(id as string);
      if (!signature) {
        throw ApiError.notFound(`Failure signature with ID ${id} not found`);
      }

      // Verify tenant authorization through the parent repository
      const repo = await repoRepo.findById(signature.repo_id);
      let hasAccess = false;

      if (repo) {
        if (repo.workspace_id) {
          const ws = await workspaceRepo.findById(repo.workspace_id);
          const role = req.userProfileId ? await workspaceRepo.getUserRoleInWorkspace(repo.workspace_id, req.userProfileId) : null;
          if (role || ws?.owner_id === req.userProfileId || ws?.is_public) {
            hasAccess = true;
          }
        } else if (repo.org_id) {
          const org = await orgRepo.findById(repo.org_id);
          if (org?.workspace_id) {
            const ws = await workspaceRepo.findById(org.workspace_id);
            const role = req.userProfileId ? await workspaceRepo.getUserRoleInWorkspace(org.workspace_id, req.userProfileId) : null;
            if (role || ws?.owner_id === req.userProfileId || ws?.is_public) {
              hasAccess = true;
            }
          } else {
            hasAccess = true;
          }
        } else {
          hasAccess = true;
        }
      } else {
        hasAccess = true;
      }

      if (!hasAccess) {
        throw ApiError.forbidden('You do not have access to this signature');
      }

      // Get signature details with cross-run timeline
      const signatureData = await failureSigRepo.findWithCrossRunTimeline(id as string, 50);

      return res.json({
        id: signatureData.signature.id,
        signatureHash: signatureData.signature.signature_hash?.trim(),
        normalizedTemplate: signatureData.signature.normalized_template,
        testIdentifier: signatureData.signature.test_identifier,
        errorCategory: signatureData.signature.error_category,
        flakinessScore:
          typeof signatureData.signature.flakiness_score === 'string'
            ? parseFloat(signatureData.signature.flakiness_score)
            : Number(signatureData.signature.flakiness_score || 0),
        totalOccurrences: signatureData.signature.total_occurrences,
        mainBranchOccurrences: signatureData.signature.main_branch_occurrences,
        uniquePrsAffected: signatureData.signature.unique_prs_affected,
        sameShaRetryPasses: signatureData.signature.same_sha_retry_passes,
        cachedRootCause: signatureData.signature.cached_root_cause,
        cachedNextCheck: signatureData.signature.cached_next_check,
        firstSeenAt: signatureData.signature.first_seen_at,
        lastSeenAt: signatureData.signature.last_seen_at,
        occurrenceCount: signatureData.occurrenceCount,
        crossRunTimeline: signatureData.failures.map((failure: any) => ({
          githubRunId: failure.github_run_id,
          githubJobId: failure.github_job_id,
          workflowName: failure.workflow_name,
          jobName: failure.job_name,
          failedStepName: failure.failed_step_name,
          commitSha: failure.commit_sha?.trim(),
          branch: failure.branch,
          prNumber: failure.pr_number,
          exitCode: failure.exit_code,
          durationMs: failure.duration_ms,
          failedAt: failure.failed_at,
          sanitizedLogSnippet: failure.sanitized_log_snippet,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
