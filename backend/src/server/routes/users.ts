import { Router, Request, Response } from 'express';
import { UserProfileRepository } from '../../db/repositories/user-profile.repository.js';
import { WorkspaceRepository } from '../../db/repositories/workspace.repository.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/error-handler.js';

export function createUserRouter(
  userProfileRepo: UserProfileRepository = new UserProfileRepository(),
  workspaceRepo: WorkspaceRepository = new WorkspaceRepository()
): Router {
  const router = Router();
  const auth = requireAuth(userProfileRepo);

  // Get current user profile
  router.get('/profile', auth, async (req: Request, res: Response, next) => {
    try {
      let profile = await userProfileRepo.findByUserId(req.user!.id);
      if (!profile) {
        // Auto-initialize profile on first query
        profile = await userProfileRepo.upsert({
          userId: req.user!.id,
          username: req.user!.email ? req.user!.email.split('@')[0] : `user-${req.user!.id.slice(0, 8)}`,
        });
      }

      res.json({ success: true, profile });
    } catch (err) {
      next(err);
    }
  });

  // Upsert profile data
  router.put('/profile', auth, async (req: Request, res: Response, next) => {
    try {
      const { username, fullName, avatarUrl, bio } = req.body;

      const profile = await userProfileRepo.upsert({
        userId: req.user!.id,
        username,
        fullName,
        avatarUrl,
        bio,
      });

      res.json({ success: true, profile });
    } catch (err) {
      next(err);
    }
  });

  // Switch current active workspace
  router.patch('/profile/workspace', auth, async (req: Request, res: Response, next) => {
    try {
      const { workspaceId } = req.body;
      if (!workspaceId) {
        throw ApiError.badRequest('workspaceId is required');
      }

      // Ensure user profile exists
      let profile = await userProfileRepo.findByUserId(req.user!.id);
      if (!profile) {
        profile = await userProfileRepo.upsert({
          userId: req.user!.id,
        });
      }

      // Verify user has access to target workspace
      const role = await workspaceRepo.getUserRoleInWorkspace(workspaceId, profile.id);
      const workspace = await workspaceRepo.findById(workspaceId);
      if (!role && workspace?.owner_id !== profile.id && !workspace?.is_public) {
        throw ApiError.forbidden('You do not have access to this workspace');
      }

      const updated = await userProfileRepo.updateCurrentWorkspace(profile.id, workspaceId);
      res.json({ success: true, profile: updated });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

