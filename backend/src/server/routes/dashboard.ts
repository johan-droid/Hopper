/**
 * Dashboard Router.
 * Aggregates tenant metrics, quota consumption, and flaky test leaderboards.
 * Strictly enforces authentication and tenant isolation.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { OrganizationRepository } from '../../db/repositories/organization.repository.js';
import { RepositoryRepository } from '../../db/repositories/repository.repository.js';
import { FailureSignatureRepository } from '../../db/repositories/failure-signature.repository.js';
import { WorkflowFailureRepository } from '../../db/repositories/workflow-failure.repository.js';
import { WorkspaceRepository } from '../../db/repositories/workspace.repository.js';
import { UserProfileRepository } from '../../db/repositories/user-profile.repository.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/error-handler.js';

export function createDashboardRouter(
  orgRepo: OrganizationRepository = new OrganizationRepository(),
  repoRepo: RepositoryRepository = new RepositoryRepository(),
  failureSigRepo: FailureSignatureRepository = new FailureSignatureRepository(),
  workflowFailureRepo: WorkflowFailureRepository = new WorkflowFailureRepository(),
  userProfileRepo: UserProfileRepository = new UserProfileRepository(),
  workspaceRepo: WorkspaceRepository = new WorkspaceRepository()
): Router {
  const router = Router();
  const auth = requireAuth(userProfileRepo);

  // Dashboard endpoint - secured by organization membership
  router.get('/:orgSlug', auth, async (req: Request, res: Response, next: NextFunction) => {
    const { orgSlug } = req.params;

    try {
      const org = await orgRepo.findByLogin(orgSlug as string);
      if (!org) {
        throw ApiError.notFound(`Organization with login ${orgSlug} not found`);
      }

      // Check tenant access if org is linked to a workspace
      let hasAccess = false;
      if (org.workspace_id) {
        const ws = await workspaceRepo.findById(org.workspace_id);
        const role = req.userProfileId ? await workspaceRepo.getUserRoleInWorkspace(org.workspace_id, req.userProfileId) : null;
        if (role || ws?.owner_id === req.userProfileId || ws?.is_public) {
          hasAccess = true;
        }
      } else {
        hasAccess = true;
      }

      if (!hasAccess) {
        throw ApiError.forbidden(`You do not have access to organization ${orgSlug}`);
      }

      // Get tenant stats
      const tenantStats = {
        monthlyRunLimit: org.monthly_run_limit,
        runsUsedThisPeriod: org.runs_used_this_period,
      };

      // Get flaky test leaderboard - top flaky signatures for this organization's repos
      const repos = await repoRepo.listByOrgId(org.id);
      const repoIds = repos.map((repo) => repo.id);

      const flakyTestLeaderboard: Array<{
        rank: number;
        identifier: string;
        flakinessScore: number;
        occurrences30d: number;
        occurrences90d: number;
        sameShaRetryPasses: number;
        lastSeen: string;
        sigId?: string;
      }> = [];

      if (repoIds.length > 0) {
        const allFlakySignatures: any[] = [];

        for (const repoId of repoIds) {
          const topFlaky = await failureSigRepo.findTopFlaky(repoId as string, 10);
          for (const sig of topFlaky) {
            allFlakySignatures.push({
              ...sig,
              repoFullName: repos.find((r: any) => r.id === repoId)?.full_name || 'unknown',
            });
          }
        }

        // Sort by flakiness score and take top 10
        allFlakySignatures.sort((a, b) => b.flakiness_score - a.flakiness_score);
        const top10 = allFlakySignatures.slice(0, 10);

        const thirtyDaysAgo = new Date();
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        for (let i = 0; i < top10.length; i++) {
          const sig = top10[i];
          const failures30d = await workflowFailureRepo.findFailuresBySignatureId(sig.id, 30);
          const failures90d = await workflowFailureRepo.findFailuresBySignatureId(sig.id, 90);

          const recentFailures30d = failures30d.filter((f) => new Date(f.failed_at) >= thirtyDaysAgo);
          const recentFailures90d = failures90d.filter((f) => new Date(f.failed_at) >= ninetyDaysAgo);
          const sameShaRetryPasses = sig.same_sha_retry_passes || 0;

          flakyTestLeaderboard.push({
            rank: i + 1,
            identifier: sig.test_identifier || `${sig.normalized_template} > test`,
            flakinessScore: typeof sig.flakiness_score === 'string' ? parseFloat(sig.flakiness_score) : Number(sig.flakiness_score || 0),
            occurrences30d: recentFailures30d.length,
            occurrences90d: recentFailures90d.length,
            sameShaRetryPasses,
            lastSeen: sig.last_seen_at ? new Date(sig.last_seen_at).toISOString() : new Date().toISOString(),
            sigId: sig.id,
          });
        }
      }

      res.json({
        orgSlug,
        plan: org.plan,
        monthlyRunsLimit: tenantStats.monthlyRunLimit,
        runsUsedThisPeriod: tenantStats.runsUsedThisPeriod,
        flakyTestLeaderboard,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
