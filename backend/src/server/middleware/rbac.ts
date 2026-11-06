import { Request, Response, NextFunction } from 'express';
import { ApiError } from './error-handler.js';
import { WorkspaceRepository } from '../../db/repositories/workspace.repository.js';
import { UserRole } from '../../db/types.js';

/**
 * Tenant Role-Based Access Control (RBAC) Middleware.
 * Asserts that the authenticated user possesses one of the required roles in the target workspace.
 */
export function requireWorkspaceRole(
  allowedRoles: UserRole[],
  workspaceRepo?: WorkspaceRepository
) {
  const repo = workspaceRepo || new WorkspaceRepository();

  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized('Authentication required');
      }

      const rawWorkspaceId = req.params.workspaceId || req.params.id;
      const workspaceId = Array.isArray(rawWorkspaceId) ? rawWorkspaceId[0] : (rawWorkspaceId as string);
      if (!workspaceId) {
        throw ApiError.badRequest('Target workspace ID is missing from request route');
      }

      // Check if user has an associated profile
      const userProfileId = req.userProfileId;
      if (!userProfileId) {
        // If profile is not yet created, allow owner check or require profile completion
        throw ApiError.forbidden('User profile must be completed to access workspace resources');
      }

      const role = await repo.getUserRoleInWorkspace(workspaceId, userProfileId);
      if (!role) {
        throw ApiError.forbidden('You are not a member of this workspace');
      }

      if (!allowedRoles.includes(role)) {
        throw ApiError.forbidden(
          `Action requires one of the following roles: [${allowedRoles.join(', ')}]. Current role: ${role}`
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
