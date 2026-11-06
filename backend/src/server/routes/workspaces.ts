import { Router, Request, Response } from 'express';
import { WorkspaceRepository } from '../../db/repositories/workspace.repository.js';
import { UserProfileRepository } from '../../db/repositories/user-profile.repository.js';
import { OrganizationRepository } from '../../db/repositories/organization.repository.js';
import { RepositoryRepository } from '../../db/repositories/repository.repository.js';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkspaceRole } from '../middleware/rbac.js';
import { ApiError } from '../middleware/error-handler.js';
import { UserRole } from '../../db/types.js';

export function createWorkspaceRouter(
  workspaceRepo: WorkspaceRepository = new WorkspaceRepository(),
  userProfileRepo: UserProfileRepository = new UserProfileRepository(),
  orgRepo: OrganizationRepository = new OrganizationRepository(),
  repoRepo: RepositoryRepository = new RepositoryRepository()
): Router {
  const router = Router();
  const auth = requireAuth(userProfileRepo);

  // List all workspaces for the authenticated user
  router.get('/', auth, async (req: Request, res: Response, next) => {
    try {
      if (!req.userProfileId) {
        // Automatically ensure user profile exists
        const profile = await userProfileRepo.upsert({
          userId: req.user!.id,
          username: req.user!.email ? req.user!.email.split('@')[0] : `user-${req.user!.id.slice(0, 8)}`,
        });
        req.userProfileId = profile.id;
      }

      const workspaces = await workspaceRepo.listByUserId(req.userProfileId);
      res.json({ success: true, count: workspaces.length, workspaces });
    } catch (err) {
      next(err);
    }
  });

  // Create a new workspace
  router.post('/', auth, async (req: Request, res: Response, next) => {
    try {
      const { name, type = 'organization', description, isPublic } = req.body;
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw ApiError.badRequest('Workspace name is required');
      }

      if (!req.userProfileId) {
        const profile = await userProfileRepo.upsert({
          userId: req.user!.id,
          username: req.user!.email ? req.user!.email.split('@')[0] : `user-${req.user!.id.slice(0, 8)}`,
        });
        req.userProfileId = profile.id;
      }

      const workspace = await workspaceRepo.create({
        name: name.trim(),
        type: type === 'personal' ? 'personal' : 'organization',
        ownerId: req.userProfileId,
        description: description || null,
        isPublic: Boolean(isPublic),
      });

      // Update current workspace if none selected
      await userProfileRepo.updateCurrentWorkspace(req.userProfileId, workspace.id);

      res.status(201).json({ success: true, workspace });
    } catch (err) {
      next(err);
    }
  });

  // Get workspace by ID
  router.get('/:id', auth, async (req: Request, res: Response, next) => {
    try {
      const id = req.params.id as string;
      const workspace = await workspaceRepo.findById(id);
      if (!workspace) {
        throw ApiError.notFound(`Workspace with ID ${id} not found`);
      }

      // Check membership or public visibility
      if (!workspace.is_public) {
        if (!req.userProfileId) {
          throw ApiError.forbidden('You do not have access to this private workspace');
        }
        const role = await workspaceRepo.getUserRoleInWorkspace(id, req.userProfileId);
        if (!role && workspace.owner_id !== req.userProfileId) {
          throw ApiError.forbidden('You do not have access to this private workspace');
        }
      }

      res.json({ success: true, workspace });
    } catch (err) {
      next(err);
    }
  });

  // Update workspace
  router.patch(
    '/:id',
    auth,
    requireWorkspaceRole(['owner', 'admin'], workspaceRepo),
    async (req: Request, res: Response, next) => {
      try {
        const id = req.params.id as string;
        const { name, description, isPublic } = req.body;

        const updated = await workspaceRepo.update(id, {
          name: name ? name.trim() : undefined,
          description,
          isPublic,
        });

        res.json({ success: true, workspace: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  // Delete workspace (owner only)
  router.delete(
    '/:id',
    auth,
    requireWorkspaceRole(['owner'], workspaceRepo),
    async (req: Request, res: Response, next) => {
      try {
        const id = req.params.id as string;
        await workspaceRepo.delete(id);
        res.json({ success: true, message: `Workspace ${id} deleted successfully` });
      } catch (err) {
        next(err);
      }
    }
  );

  // List workspace members
  router.get(
    '/:id/members',
    auth,
    requireWorkspaceRole(['owner', 'admin', 'developer', 'viewer'], workspaceRepo),
    async (req: Request, res: Response, next) => {
      try {
        const id = req.params.id as string;
        const members = await workspaceRepo.getMembers(id);
        res.json({ success: true, count: members.length, members });
      } catch (err) {
        next(err);
      }
    }
  );

  // Add member to workspace
  router.post(
    '/:id/members',
    auth,
    requireWorkspaceRole(['owner', 'admin'], workspaceRepo),
    async (req: Request, res: Response, next) => {
      try {
        const id = req.params.id as string;
        const { userId, role = 'developer' } = req.body;

        if (!userId) {
          throw ApiError.badRequest('userId is required');
        }

        const validRoles: UserRole[] = ['owner', 'admin', 'developer', 'viewer'];
        if (!validRoles.includes(role)) {
          throw ApiError.badRequest(`Invalid role. Valid roles are: ${validRoles.join(', ')}`);
        }

        const member = await workspaceRepo.addMember({
          workspaceId: id,
          userId,
          role,
        });

        res.status(201).json({ success: true, member });
      } catch (err) {
        next(err);
      }
    }
  );

  // Update member role
  router.patch(
    '/:id/members/:userId',
    auth,
    requireWorkspaceRole(['owner', 'admin'], workspaceRepo),
    async (req: Request, res: Response, next) => {
      try {
        const id = req.params.id as string;
        const userId = req.params.userId as string;
        const { role } = req.body;

        const validRoles: UserRole[] = ['owner', 'admin', 'developer', 'viewer'];
        if (!role || !validRoles.includes(role)) {
          throw ApiError.badRequest(`Invalid role. Valid roles are: ${validRoles.join(', ')}`);
        }

        const updated = await workspaceRepo.updateMemberRole(id, userId, role);
        res.json({ success: true, member: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  // Remove member from workspace
  router.delete(
    '/:id/members/:userId',
    auth,
    async (req: Request, res: Response, next) => {
      try {
        const id = req.params.id as string;
        const userId = req.params.userId as string;

        // Allow user to leave themselves, or requires admin/owner
        const isSelf = req.userProfileId === userId;
        if (!isSelf) {
          const userRole = await workspaceRepo.getUserRoleInWorkspace(id, req.userProfileId!);
          if (!userRole || !['owner', 'admin'].includes(userRole)) {
            throw ApiError.forbidden('Only workspace owners or admins can remove other members');
          }

          // Owners cannot be removed by admins
          const targetRole = await workspaceRepo.getUserRoleInWorkspace(id, userId);
          if (targetRole === 'owner' && userRole !== 'owner') {
            throw ApiError.forbidden('Only workspace owners can remove an owner');
          }
        }

        await workspaceRepo.removeMember(id, userId);
        res.json({ success: true, message: `Member ${userId} removed from workspace ${id}` });
      } catch (err) {
        next(err);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Workspace GitHub Organizations & Repositories Linking (Phase C Bridge)
  // ---------------------------------------------------------------------------

  // List linked GitHub organizations for this workspace
  router.get('/:id/organizations', auth, async (req: Request, res: Response, next) => {
    try {
      const id = req.params.id as string;
      const workspace = await workspaceRepo.findById(id);
      if (!workspace) {
        throw ApiError.notFound(`Workspace with ID ${id} not found`);
      }

      if (!workspace.is_public) {
        const role = await workspaceRepo.getUserRoleInWorkspace(id, req.userProfileId!);
        if (!role && workspace.owner_id !== req.userProfileId) {
          throw ApiError.forbidden('You do not have access to this workspace');
        }
      }

      const orgs = await orgRepo.findByWorkspaceId(id);
      res.json({ success: true, count: orgs.length, organizations: orgs });
    } catch (err) {
      next(err);
    }
  });

  // Link a GitHub organization to this workspace
  router.post(
    '/:id/organizations/link',
    auth,
    requireWorkspaceRole(['owner', 'admin'], workspaceRepo),
    async (req: Request, res: Response, next) => {
      try {
        const id = req.params.id as string;
        const { orgId } = req.body;

        if (!orgId) {
          throw ApiError.badRequest('orgId is required');
        }

        const org = await orgRepo.findById(orgId);
        if (!org) {
          throw ApiError.notFound(`Organization with ID ${orgId} not found`);
        }

        // IDOR Defense: If organization is already linked to another workspace,
        // user must have owner or admin rights on that existing workspace.
        if (org.workspace_id && org.workspace_id !== id) {
          const existingWs = await workspaceRepo.findById(org.workspace_id);
          const existingRole = req.userProfileId ? await workspaceRepo.getUserRoleInWorkspace(org.workspace_id, req.userProfileId) : null;
          if (existingRole !== 'owner' && existingRole !== 'admin' && existingWs?.owner_id !== req.userProfileId) {
            throw ApiError.forbidden('You do not have permission to transfer this organization from its current workspace');
          }
        }

        const linkedOrg = await orgRepo.linkWorkspace(orgId, id);
        res.json({ success: true, organization: linkedOrg });
      } catch (err) {
        next(err);
      }
    }
  );

  // List all repositories accessible within this workspace
  router.get('/:id/repositories', auth, async (req: Request, res: Response, next) => {
    try {
      const id = req.params.id as string;
      const workspace = await workspaceRepo.findById(id);
      if (!workspace) {
        throw ApiError.notFound(`Workspace with ID ${id} not found`);
      }

      if (!workspace.is_public) {
        const role = await workspaceRepo.getUserRoleInWorkspace(id, req.userProfileId!);
        if (!role && workspace.owner_id !== req.userProfileId) {
          throw ApiError.forbidden('You do not have access to this workspace');
        }
      }

      const repos = await repoRepo.listByWorkspaceId(id);
      res.json({ success: true, count: repos.length, repositories: repos });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
