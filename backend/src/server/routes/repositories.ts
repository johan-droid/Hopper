/**
 * Repositories Router.
 * Manages repository listings, failure history feeds, and workspace linking.
 * Strictly enforces authentication and tenant isolation.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { RepositoryRepository } from '../../db/repositories/repository.repository.js';
import { WorkflowFailureRepository } from '../../db/repositories/workflow-failure.repository.js';
import { WorkspaceRepository } from '../../db/repositories/workspace.repository.js';
import { UserProfileRepository } from '../../db/repositories/user-profile.repository.js';
import { OrganizationRepository } from '../../db/repositories/organization.repository.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/error-handler.js';

export function createRepositoriesRouter(
  repoRepo: RepositoryRepository = new RepositoryRepository(),
  workflowFailureRepo: WorkflowFailureRepository = new WorkflowFailureRepository(),
  workspaceRepo: WorkspaceRepository = new WorkspaceRepository(),
  userProfileRepo: UserProfileRepository = new UserProfileRepository(),
  orgRepo: OrganizationRepository = new OrganizationRepository()
): Router {
  const router = Router();
  const auth = requireAuth(userProfileRepo);

  // List repositories (optionally filtered by workspaceId or orgId)
  router.get('/', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const workspaceId = (req.query.workspaceId as string) || (req.headers['x-workspace-id'] as string);
      const orgId = req.query.orgId as string;

      if (workspaceId) {
        // Assert workspace authorization
        const ws = await workspaceRepo.findById(workspaceId);
        if (!ws) {
          throw ApiError.notFound(`Workspace with ID ${workspaceId} not found`);
        }
        if (!ws.is_public) {
          const role = req.userProfileId ? await workspaceRepo.getUserRoleInWorkspace(workspaceId, req.userProfileId) : null;
          if (!role && ws.owner_id !== req.userProfileId) {
            throw ApiError.forbidden('You do not have access to this workspace');
          }
        }
        const repos = await repoRepo.listByWorkspaceId(workspaceId);
        return res.json({ success: true, count: repos.length, repositories: repos });
      }

      if (orgId) {
        const org = await orgRepo.findById(orgId);
        if (!org) {
          throw ApiError.notFound(`Organization with ID ${orgId} not found`);
        }
        if (org.workspace_id) {
          const ws = await workspaceRepo.findById(org.workspace_id);
          const role = req.userProfileId ? await workspaceRepo.getUserRoleInWorkspace(org.workspace_id, req.userProfileId) : null;
          if (!role && ws?.owner_id !== req.userProfileId && !ws?.is_public) {
            throw ApiError.forbidden('You do not have access to this organization');
          }
        }
        const repos = await repoRepo.listByOrgId(orgId);
        return res.json({ success: true, count: repos.length, repositories: repos });
      }

      // Default: List repositories across all workspaces the user has access to
      if (req.userProfileId) {
        const userWorkspaces = await workspaceRepo.listByUserId(req.userProfileId);
        const allRepos: any[] = [];
        const seenRepoIds = new Set<string>();
        for (const ws of userWorkspaces) {
          const wsRepos = await repoRepo.listByWorkspaceId(ws.id);
          for (const r of wsRepos) {
            if (!seenRepoIds.has(r.id)) {
              seenRepoIds.add(r.id);
              allRepos.push(r);
            }
          }
        }
        return res.json({ success: true, count: allRepos.length, repositories: allRepos });
      }

      return res.json({ success: true, count: 0, repositories: [] });
    } catch (err) {
      next(err);
    }
  });

  // Link repository to a workspace (owner or admin of both target workspace and repository)
  router.post('/:repoId/link-workspace', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { repoId } = req.params as { repoId: string };
      const { workspaceId } = req.body;

      if (!workspaceId) {
        throw ApiError.badRequest('workspaceId is required in request body');
      }

      // Verify target workspace exists and user has owner/admin role
      const ws = await workspaceRepo.findById(workspaceId);
      if (!ws) {
        throw ApiError.notFound(`Workspace with ID ${workspaceId} not found`);
      }
      const role = req.userProfileId ? await workspaceRepo.getUserRoleInWorkspace(workspaceId, req.userProfileId) : null;
      if (!['owner', 'admin'].includes(role || '') && ws.owner_id !== req.userProfileId) {
        throw ApiError.forbidden('Only workspace owners or admins can link repositories to this workspace');
      }

      const repo = await repoRepo.findById(repoId);
      if (!repo) {
        throw ApiError.notFound(`Repository with ID ${repoId} not found`);
      }

      // IDOR Defense: User must have admin/owner rights on repo's existing workspace if already assigned
      let hasRepoAccess = false;
      if (repo.workspace_id) {
        const repoWs = await workspaceRepo.findById(repo.workspace_id);
        const repoRole = req.userProfileId ? await workspaceRepo.getUserRoleInWorkspace(repo.workspace_id, req.userProfileId) : null;
        if (repoRole === 'owner' || repoRole === 'admin' || repoWs?.owner_id === req.userProfileId) {
          hasRepoAccess = true;
        }
      } else if (repo.org_id) {
        const org = await orgRepo.findById(repo.org_id);
        if (org?.workspace_id) {
          const repoWs = await workspaceRepo.findById(org.workspace_id);
          const repoRole = req.userProfileId ? await workspaceRepo.getUserRoleInWorkspace(org.workspace_id, req.userProfileId) : null;
          if (repoRole === 'owner' || repoRole === 'admin' || repoWs?.owner_id === req.userProfileId) {
            hasRepoAccess = true;
          }
        } else {
          hasRepoAccess = true;
        }
      } else {
        hasRepoAccess = true;
      }

      if (!hasRepoAccess) {
        throw ApiError.forbidden('You do not have permission to transfer this repository');
      }

      const updated = await repoRepo.linkWorkspace(repoId, workspaceId);
      res.json({ success: true, repository: updated });
    } catch (err) {
      next(err);
    }
  });

  // Repository failures endpoint - failure history feed with tenant verification
  router.get('/:repoId/failures', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { repoId } = req.params as { repoId: string };

      const repo = await repoRepo.findById(repoId);
      if (!repo) {
        throw ApiError.notFound(`Repository with ID ${repoId} not found`);
      }

      // Verify tenant access to repository
      let hasAccess = false;
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

      if (!hasAccess) {
        throw ApiError.forbidden('You do not have access to this repository');
      }

      // Get failures for this repository
      const failures = await workflowFailureRepo.listByRepoId(repoId, 100);

      res.json({
        repoId,
        failureCount: failures.length,
        failures: failures.map((failure: any) => ({
          id: failure.id,
          githubRunId: failure.github_run_id,
          githubJobId: failure.github_job_id,
          workflowName: failure.workflow_name,
          jobName: failure.job_name,
          failedStepName: failure.failed_step_name,
          commitSha: failure.commit_sha,
          branch: failure.branch,
          prNumber: failure.pr_number,
          actorLogin: failure.actor_login,
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
