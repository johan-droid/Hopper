/**
 * GitHub Authentication & Synchronization Router.
 * Implements pure GitHub OAuth, Personal Access Token (PAT) authentication,
 * current user session inspection, and full organization/repository sync.
 */

import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import {
  getGitHubOAuthUrl,
  exchangeCodeForToken,
  fetchGitHubUser,
  verifyGitHubToken,
  createSessionToken,
  githubIdToUuid,
  GitHubUserProfile,
} from '../../lib/github/user-auth.js';
import { GitHubSyncService } from '../../lib/github/sync-service.js';
import { UserProfileRepository } from '../../db/repositories/user-profile.repository.js';
import { WorkspaceRepository } from '../../db/repositories/workspace.repository.js';
import { OrganizationRepository } from '../../db/repositories/organization.repository.js';
import { RepositoryRepository } from '../../db/repositories/repository.repository.js';
import { requireAuth } from '../middleware/auth.js';
import { ApiError } from '../middleware/error-handler.js';

// In-memory OAuth state cache (10 min expiry)
const oauthStateCache = new Set<string>();

export function createAuthRouter(
  userProfileRepo: UserProfileRepository = new UserProfileRepository(),
  workspaceRepo: WorkspaceRepository = new WorkspaceRepository(),
  orgRepo: OrganizationRepository = new OrganizationRepository(),
  repoRepo: RepositoryRepository = new RepositoryRepository()
): Router {
  const router = Router();
  const auth = requireAuth(userProfileRepo);
  const syncService = new GitHubSyncService(orgRepo, repoRepo, workspaceRepo, userProfileRepo);

  /**
   * GET /api/auth/github
   * Initiates GitHub OAuth flow.
   */
  router.get('/github', (req: Request, res: Response) => {
    const state = crypto.randomBytes(16).toString('hex');
    oauthStateCache.add(state);
    setTimeout(() => oauthStateCache.delete(state), 10 * 60 * 1000);

    const redirectUri = (req.query.redirect_uri as string) || undefined;
    const authUrl = getGitHubOAuthUrl(state, redirectUri);

    if (req.headers.accept?.includes('application/json') || req.query.format === 'json') {
      res.json({ url: authUrl, state });
    } else {
      res.redirect(authUrl);
    }
  });

  /**
   * GET /api/auth/github/callback
   * Handles GitHub OAuth callback.
   */
  router.get('/github/callback', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;

      if (!code) {
        throw ApiError.badRequest('Missing GitHub authorization code');
      }

      // Verify state unless in test environment
      if (process.env.NODE_ENV !== 'test' && state && !oauthStateCache.has(state)) {
        throw ApiError.unauthorized('Invalid or expired OAuth state parameter');
      }
      if (state) {
        oauthStateCache.delete(state);
      }

      // 1. Exchange code for access token
      const { accessToken } = await exchangeCodeForToken(code);

      // 2. Fetch authoritative user details from GitHub
      const ghUser = await fetchGitHubUser(accessToken);

      // 3. Resolve or upsert UserProfile
      // Deterministic UUID for the GitHub user ID
      const userUuid = githubIdToUuid(ghUser.id);

      const profile = await userProfileRepo.upsert({
        userId: userUuid,
        username: ghUser.login,
        fullName: ghUser.name,
        avatarUrl: ghUser.avatarUrl,
        bio: ghUser.company || undefined,
        role: 'developer',
      });

      // 4. Resolve or create default personal workspace
      const userWorkspaces = await workspaceRepo.listByUserId(profile.id);
      let activeWorkspaceId = profile.current_workspace_id;

      if (!activeWorkspaceId || !userWorkspaces.some((w) => w.id === activeWorkspaceId)) {
        if (userWorkspaces.length > 0) {
          activeWorkspaceId = userWorkspaces[0].id;
        } else {
          const newWs = await workspaceRepo.create({
            name: `${ghUser.login}'s Workspace`,
            type: 'personal',
            ownerId: profile.id,
            description: `Default personal workspace for @${ghUser.login}`,
            isPublic: false,
          });
          activeWorkspaceId = newWs.id;
        }
        await userProfileRepo.updateCurrentWorkspace(profile.id, activeWorkspaceId);
      }

      // 5. Run initial GitHub Resource Sync
      try {
        await syncService.syncUserGitHubResources({
          githubToken: accessToken,
          githubUser: ghUser,
          userProfileId: profile.id,
          workspaceId: activeWorkspaceId,
        });
      } catch (syncErr: any) {
        console.warn(`[AuthCallback] Initial sync warning: ${syncErr.message}`);
      }

      // 6. Mint Hopper Session Token with authoritative GitHub access token
      const token = createSessionToken(ghUser, userUuid, profile.id, activeWorkspaceId, {
        githubToken: accessToken,
      });

      // 7. Complete login
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const redirectTarget = `${frontendUrl}/login/callback?token=${token}&login=${encodeURIComponent(ghUser.login)}`;

      if (req.headers.accept?.includes('application/json') || req.query.format === 'json') {
        res.json({
          success: true,
          token,
          user: ghUser,
          profileId: profile.id,
          workspaceId: activeWorkspaceId,
        });
      } else {
        res.redirect(redirectTarget);
      }
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/auth/github/token
   * Direct authentication via GitHub Personal Access Token or OAuth token.
   */
  router.post('/github/token', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token: ghToken } = req.body;

      if (!ghToken || typeof ghToken !== 'string') {
        throw ApiError.badRequest('GitHub token is required');
      }

      // 1. Verify GitHub Token directly
      const ghUser = await verifyGitHubToken(ghToken);

      // 2. Resolve or upsert UserProfile
      const userUuid = githubIdToUuid(ghUser.id);

      const profile = await userProfileRepo.upsert({
        userId: userUuid,
        username: ghUser.login,
        fullName: ghUser.name,
        avatarUrl: ghUser.avatarUrl,
        bio: ghUser.company || undefined,
        role: 'developer',
      });

      // 3. Resolve or create default personal workspace
      const userWorkspaces = await workspaceRepo.listByUserId(profile.id);
      let activeWorkspaceId = profile.current_workspace_id;

      if (!activeWorkspaceId || !userWorkspaces.some((w) => w.id === activeWorkspaceId)) {
        if (userWorkspaces.length > 0) {
          activeWorkspaceId = userWorkspaces[0].id;
        } else {
          const newWs = await workspaceRepo.create({
            name: `${ghUser.login}'s Workspace`,
            type: 'personal',
            ownerId: profile.id,
            description: `Default personal workspace for @${ghUser.login}`,
            isPublic: false,
          });
          activeWorkspaceId = newWs.id;
        }
        await userProfileRepo.updateCurrentWorkspace(profile.id, activeWorkspaceId);
      }

      // 4. Initial Sync
      const syncResult = await syncService.syncUserGitHubResources({
        githubToken: ghToken,
        githubUser: ghUser,
        userProfileId: profile.id,
        workspaceId: activeWorkspaceId,
      });

      // 5. Mint Hopper Session JWT
      const sessionToken = createSessionToken(ghUser, userUuid, profile.id, activeWorkspaceId, {
        githubToken: ghToken,
      });

      res.json({
        success: true,
        token: sessionToken,
        user: ghUser,
        profile,
        workspaceId: activeWorkspaceId,
        sync: {
          organizationsSynced: syncResult.stats.organizationsSynced,
          repositoriesSynced: syncResult.stats.repositoriesSynced,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/auth/dev-login
   * One-click development authentication using the default GitHub profile.
   * Eliminates the need for manual API tokens during development.
   */
  router.post('/dev-login', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction) {
        throw ApiError.forbidden('Development authentication is disabled in production environments');
      }

      const login = (req.body?.login as string) || 'johan-droid';
      const ghUser = await fetchGitHubUser(`gho_dev_${login}`);
      const userUuid = githubIdToUuid(ghUser.id);

      const profile = await userProfileRepo.upsert({
        userId: userUuid,
        username: ghUser.login,
        fullName: ghUser.name,
        avatarUrl: ghUser.avatarUrl,
        bio: ghUser.company || undefined,
        role: 'developer',
      });

      const userWorkspaces = await workspaceRepo.listByUserId(profile.id);
      let activeWorkspaceId = profile.current_workspace_id;

      if (!activeWorkspaceId || !userWorkspaces.some((w) => w.id === activeWorkspaceId)) {
        if (userWorkspaces.length > 0) {
          activeWorkspaceId = userWorkspaces[0].id;
        } else {
          const newWs = await workspaceRepo.create({
            name: `${ghUser.login}'s Workspace`,
            type: 'personal',
            ownerId: profile.id,
            description: `Default personal workspace for @${ghUser.login}`,
            isPublic: false,
          });
          activeWorkspaceId = newWs.id;
        }
        await userProfileRepo.updateCurrentWorkspace(profile.id, activeWorkspaceId);
      }

      // Initial sync using authoritative session
      const syncResult = await syncService.syncUserGitHubResources({
        githubToken: `gho_dev_${login}`,
        githubUser: ghUser,
        userProfileId: profile.id,
        workspaceId: activeWorkspaceId,
      });

      const sessionToken = createSessionToken(ghUser, userUuid, profile.id, activeWorkspaceId, {
        githubToken: `gho_dev_${login}`,
      });

      res.json({
        success: true,
        token: sessionToken,
        user: ghUser,
        profile,
        workspaceId: activeWorkspaceId,
        sync: {
          organizationsSynced: syncResult.stats.organizationsSynced,
          repositoriesSynced: syncResult.stats.repositoriesSynced,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/auth/me
   * Inspect currently authenticated GitHub session.
   */
  router.get('/me', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = req.userProfileId ? await userProfileRepo.findById(req.userProfileId) : null;
      const workspaces = req.userProfileId ? await workspaceRepo.listByUserId(req.userProfileId) : [];
      const currentWorkspace = profile?.current_workspace_id
        ? await workspaceRepo.findById(profile.current_workspace_id)
        : workspaces[0] || null;

      res.json({
        authenticated: true,
        user: req.user,
        profile,
        currentWorkspace,
        workspaces,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/auth/sync
   * Triggers explicit GitHub synchronization of organizations and repositories.
   */
  router.post('/sync', auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.userProfileId) {
        throw ApiError.unauthorized('Authenticated profile not resolved');
      }

      const profile = await userProfileRepo.findById(req.userProfileId);
      if (!profile) {
        throw ApiError.notFound('User profile not found');
      }

      const ghUser: GitHubUserProfile = {
        id: req.user?.github_user_id || 1029384,
        login: req.user?.login || profile.username || 'developer',
        name: profile.full_name || profile.username || 'Developer',
        email: req.user?.email || null,
        avatarUrl: profile.avatar_url || `https://github.com/${profile.username || 'developer'}.png`,
        htmlUrl: `https://github.com/${profile.username || 'developer'}`,
      };

      const githubToken =
        req.user?.github_token ||
        (req.body?.githubToken as string) ||
        (req.headers['x-github-token'] as string) ||
        undefined;

      const targetWorkspaceId = req.body?.workspaceId || profile.current_workspace_id;

      const syncResult = await syncService.syncUserGitHubResources({
        githubToken,
        githubUser: ghUser,
        userProfileId: profile.id,
        workspaceId: targetWorkspaceId,
      });

      res.json(syncResult);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /api/auth/logout
   * Clears authenticated session.
   */
  router.post('/logout', (_req: Request, res: Response) => {
    res.json({ success: true, message: 'Logged out successfully' });
  });

  return router;
}
