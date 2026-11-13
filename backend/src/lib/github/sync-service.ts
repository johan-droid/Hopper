/**
 * GitHub Resource Synchronization Service.
 * Syncs GitHub user organizations, installations, and accessible repositories
 * into Hopper workspaces with strict tenant isolation, bounded pagination,
 * and lifecycle tracking.
 */

import { OrganizationRepository } from '../../db/repositories/organization.repository.js';
import { RepositoryRepository } from '../../db/repositories/repository.repository.js';
import { WorkspaceRepository } from '../../db/repositories/workspace.repository.js';
import { UserProfileRepository } from '../../db/repositories/user-profile.repository.js';
import { GitHubUserProfile } from './user-auth.js';
import { defaultGitHubApiClient } from './api-client.js';
import { RequestPriority } from './rate-limiter.js';

export interface SyncOptions {
  githubToken?: string | null;
  githubUser: GitHubUserProfile;
  userProfileId: string;
  workspaceId?: string | null;
}

export interface SyncedOrgSummary {
  id: string;
  login: string;
  type: string;
  installationId: number;
}

export interface SyncedRepoSummary {
  id: string;
  githubRepoId: number;
  fullName: string;
  defaultBranch: string;
  orgLogin: string;
}

export interface GitHubSyncResult {
  success: boolean;
  syncedAt: string;
  user: {
    login: string;
    githubId: number;
    email: string | null;
  };
  workspaceId: string;
  stats: {
    organizationsSynced: number;
    repositoriesSynced: number;
  };
  organizations: SyncedOrgSummary[];
  repositories: SyncedRepoSummary[];
}

export class GitHubSyncService {
  constructor(
    private orgRepo: OrganizationRepository = new OrganizationRepository(),
    private repoRepo: RepositoryRepository = new RepositoryRepository(),
    private workspaceRepo: WorkspaceRepository = new WorkspaceRepository(),
    private profileRepo: UserProfileRepository = new UserProfileRepository()
  ) {}

  /**
   * Syncs user organizations and repositories from GitHub into Hopper.
   * Follows GitHub pagination up to 1000 repositories (10 pages).
   */
  async syncUserGitHubResources(options: SyncOptions): Promise<GitHubSyncResult> {
    const { githubToken, githubUser, userProfileId } = options;

    // 1. Resolve or create active personal workspace
    let activeWorkspaceId = options.workspaceId;
    if (!activeWorkspaceId) {
      const userWorkspaces = await this.workspaceRepo.listByUserId(userProfileId);
      if (userWorkspaces.length > 0) {
        activeWorkspaceId = userWorkspaces[0].id;
      } else {
        const newWs = await this.workspaceRepo.create({
          name: `${githubUser.login}'s Workspace`,
          type: 'personal',
          ownerId: userProfileId,
          description: `Personal workspace for @${githubUser.login}`,
          isPublic: false,
        });
        activeWorkspaceId = newWs.id;
      }
    }

    // Update active workspace on profile
    await this.profileRepo.updateCurrentWorkspace(userProfileId, activeWorkspaceId);

    // 2. Discover GitHub Organizations & Repositories
    let rawOrgs: Array<{ id: number; login: string; type: string }> = [];
    let rawRepos: Array<{
      id: number;
      full_name: string;
      default_branch: string;
      private?: boolean;
      archived?: boolean;
      visibility?: 'public' | 'private' | 'internal';
      owner: { login: string; type: string };
    }> = [];

    const isMock =
      process.env.NODE_ENV !== 'production' &&
      (!githubToken ||
        githubToken.includes('mock') ||
        process.env.AI_PROVIDER === 'mock' ||
        process.env.NODE_ENV === 'test');

    if (!isMock && githubToken) {
      try {
        // Fetch User's Organizations (paginated)
        let orgPage = 1;
        let hasMoreOrgs = true;
        while (hasMoreOrgs && orgPage <= 5) {
          const orgsRes = await defaultGitHubApiClient.request<any[]>(
            `https://api.github.com/user/orgs?per_page=100&page=${orgPage}`,
            {
              headers: { Authorization: `Bearer ${githubToken}` },
              priority: RequestPriority.TIER_4_LOW,
            }
          );
          const orgBatch = orgsRes.data || [];
          for (const o of orgBatch) {
            rawOrgs.push({ id: o.id, login: o.login, type: 'Organization' });
          }
          if (orgBatch.length < 100) {
            hasMoreOrgs = false;
          } else {
            orgPage += 1;
          }
        }

        // Fetch User's Repositories (paginated up to 10 pages / 1000 repos)
        let repoPage = 1;
        let hasMoreRepos = true;
        while (hasMoreRepos && repoPage <= 10) {
          const reposRes = await defaultGitHubApiClient.request<any[]>(
            `https://api.github.com/user/repos?per_page=100&page=${repoPage}&sort=updated&affiliation=owner,collaborator,organization_member`,
            {
              headers: { Authorization: `Bearer ${githubToken}` },
              priority: RequestPriority.TIER_4_LOW,
            }
          );
          const repoBatch = reposRes.data || [];
          rawRepos.push(...repoBatch);
          if (repoBatch.length < 100) {
            hasMoreRepos = false;
          } else {
            repoPage += 1;
          }
        }
      } catch (err: any) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error(`[GitHubSync] Production repository sync failed: ${err.message}`);
        }
        console.warn(`[GitHubSync] Network sync failed (${err.message}). Using local deterministic sync.`);
      }
    }

    // In mock mode or offline test only, provide synthetic sample data
    if (isMock) {
      if (rawOrgs.length === 0) {
        rawOrgs = [
          {
            id: githubUser.id + 1000000,
            login: githubUser.login,
            type: 'User',
          },
        ];
      }

      if (rawRepos.length === 0) {
        rawRepos = [
          {
            id: 88291024,
            full_name: `${githubUser.login}/Hopper`,
            default_branch: 'main',
            private: false,
            archived: false,
            visibility: 'public',
            owner: {
              login: githubUser.login,
              type: 'User',
            },
          },
        ];
      }
    }

    // 3. Sync Organizations to Hopper Database
    const syncedOrgs: SyncedOrgSummary[] = [];
    const orgMap = new Map<string, string>(); // login -> Hopper org.id

    // Always include user personal account as an organization tenant
    const userPersonalInstallationId = githubUser.id;
    const personalOrg = await this.orgRepo.upsert({
      githubInstallationId: userPersonalInstallationId,
      githubAccountLogin: githubUser.login,
      githubAccountType: 'User',
      plan: 'free',
      workspaceId: activeWorkspaceId,
    });
    orgMap.set(githubUser.login.toLowerCase(), personalOrg.id);
    syncedOrgs.push({
      id: personalOrg.id,
      login: personalOrg.github_account_login,
      type: personalOrg.github_account_type,
      installationId: personalOrg.github_installation_id,
    });

    for (const org of rawOrgs) {
      if (org.login.toLowerCase() === githubUser.login.toLowerCase()) continue;

      const synced = await this.orgRepo.upsert({
        githubInstallationId: org.id || Math.abs(hashCode(org.login)),
        githubAccountLogin: org.login,
        githubAccountType: 'Organization',
        plan: 'free',
        workspaceId: activeWorkspaceId,
      });

      orgMap.set(org.login.toLowerCase(), synced.id);
      syncedOrgs.push({
        id: synced.id,
        login: synced.github_account_login,
        type: synced.github_account_type,
        installationId: synced.github_installation_id,
      });
    }

    // 4. Sync Repositories to Hopper Database
    const syncedRepos: SyncedRepoSummary[] = [];

    for (const repo of rawRepos) {
      const ownerLogin = repo.owner?.login?.toLowerCase() || githubUser.login.toLowerCase();
      let orgId = orgMap.get(ownerLogin);

      // If org not found in map, link to personal org
      if (!orgId) {
        orgId = personalOrg.id;
      }

      const synced = await this.repoRepo.upsert({
        orgId,
        githubRepoId: repo.id,
        fullName: repo.full_name,
        defaultBranch: repo.default_branch || 'main',
        workspaceId: activeWorkspaceId,
        isActive: true,
      });

      // Update sync metadata: visibility, archived, last_synced_at
      const visibility: 'public' | 'private' | 'internal' =
        repo.visibility || (repo.private ? 'private' : 'public');
      await this.repoRepo.updateSyncMetadata(repo.id, {
        visibility,
        isArchived: repo.archived ?? false,
        lastSyncedAt: new Date(),
        fullName: repo.full_name,
        defaultBranch: repo.default_branch || 'main',
      });

      syncedRepos.push({
        id: synced.id,
        githubRepoId: Number(synced.github_repo_id),
        fullName: synced.full_name,
        defaultBranch: synced.default_branch,
        orgLogin: ownerLogin,
      });
    }

    return {
      success: true,
      syncedAt: new Date().toISOString(),
      user: {
        login: githubUser.login,
        githubId: githubUser.id,
        email: githubUser.email,
      },
      workspaceId: activeWorkspaceId,
      stats: {
        organizationsSynced: syncedOrgs.length,
        repositoriesSynced: syncedRepos.length,
      },
      organizations: syncedOrgs,
      repositories: syncedRepos,
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle Webhook Handlers
  // ---------------------------------------------------------------------------

  async handleInstallationCreated(payload: any, ipAddress?: string): Promise<void> {
    const installation = payload.installation;
    if (!installation) return;

    const account = installation.account || {};
    const orgLogin = account.login;
    const accountType = account.type === 'Organization' ? 'Organization' : 'User';

    const org = await this.orgRepo.upsert({
      githubInstallationId: installation.id,
      githubAccountLogin: orgLogin,
      githubAccountType: accountType,
      plan: 'free',
      installationStatus: 'active',
      permissions: installation.permissions || {},
      repositorySelection: installation.repository_selection || 'all',
    } as any);

    await this.orgRepo.recordAuditEvent({
      organizationId: org.id,
      installationId: installation.id,
      eventType: 'installation.created',
      actorLogin: payload.sender?.login || null,
      details: {
        accountLogin: orgLogin,
        accountType,
        repositorySelection: installation.repository_selection,
        repositoriesCount: payload.repositories?.length ?? 0,
      },
      ipAddress,
    });

    // If repositories list is supplied in payload, sync them
    if (Array.isArray(payload.repositories)) {
      for (const repo of payload.repositories) {
        await this.repoRepo.upsert({
          orgId: org.id,
          githubRepoId: repo.id,
          fullName: repo.full_name,
          defaultBranch: 'main',
          workspaceId: org.workspace_id,
          isActive: true,
        });
        await this.repoRepo.updateSyncMetadata(repo.id, {
          visibility: repo.private ? 'private' : 'public',
          lastSyncedAt: new Date(),
        });
      }
    }
  }

  async handleInstallationDeleted(payload: any, ipAddress?: string): Promise<void> {
    const installationId = payload.installation?.id;
    if (!installationId) return;

    const org = await this.orgRepo.findByGithubInstallationId(installationId);
    if (org) {
      await this.orgRepo.updateInstallationStatus(installationId, 'deleted');
      await this.repoRepo.deactivateByOrgId(org.id);

      await this.orgRepo.recordAuditEvent({
        organizationId: org.id,
        installationId,
        eventType: 'installation.deleted',
        actorLogin: payload.sender?.login || null,
        details: { accountLogin: org.github_account_login },
        ipAddress,
      });
    }
  }

  async handleInstallationSuspended(payload: any, ipAddress?: string): Promise<void> {
    const installationId = payload.installation?.id;
    if (!installationId) return;

    const org = await this.orgRepo.findByGithubInstallationId(installationId);
    if (org) {
      await this.orgRepo.updateInstallationStatus(installationId, 'suspended');

      await this.orgRepo.recordAuditEvent({
        organizationId: org.id,
        installationId,
        eventType: 'installation.suspend',
        actorLogin: payload.sender?.login || null,
        details: { accountLogin: org.github_account_login },
        ipAddress,
      });
    }
  }

  async handleInstallationUnsuspended(payload: any, ipAddress?: string): Promise<void> {
    const installationId = payload.installation?.id;
    if (!installationId) return;

    const org = await this.orgRepo.findByGithubInstallationId(installationId);
    if (org) {
      await this.orgRepo.updateInstallationStatus(installationId, 'active');

      await this.orgRepo.recordAuditEvent({
        organizationId: org.id,
        installationId,
        eventType: 'installation.unsuspend',
        actorLogin: payload.sender?.login || null,
        details: { accountLogin: org.github_account_login },
        ipAddress,
      });
    }
  }

  async handleRepositoriesAdded(payload: any, ipAddress?: string): Promise<void> {
    const installationId = payload.installation?.id;
    if (!installationId) return;

    const org = await this.orgRepo.findByGithubInstallationId(installationId);
    if (!org) return;

    const reposAdded = payload.repositories_added || [];
    for (const repo of reposAdded) {
      await this.repoRepo.upsert({
        orgId: org.id,
        githubRepoId: repo.id,
        fullName: repo.full_name,
        defaultBranch: 'main',
        workspaceId: org.workspace_id,
        isActive: true,
      });
      await this.repoRepo.updateSyncMetadata(repo.id, {
        visibility: repo.private ? 'private' : 'public',
        lastSyncedAt: new Date(),
        fullName: repo.full_name,
      });
    }

    await this.orgRepo.recordAuditEvent({
      organizationId: org.id,
      installationId,
      eventType: 'installation_repositories.added',
      actorLogin: payload.sender?.login || null,
      details: {
        added: reposAdded.map((r: any) => ({ id: r.id, fullName: r.full_name })),
      },
      ipAddress,
    });
  }

  async handleRepositoriesRemoved(payload: any, ipAddress?: string): Promise<void> {
    const installationId = payload.installation?.id;
    if (!installationId) return;

    const org = await this.orgRepo.findByGithubInstallationId(installationId);
    if (!org) return;

    const reposRemoved = payload.repositories_removed || [];
    for (const repo of reposRemoved) {
      await this.repoRepo.deactivateByGithubRepoId(repo.id);
    }

    await this.orgRepo.recordAuditEvent({
      organizationId: org.id,
      installationId,
      eventType: 'installation_repositories.removed',
      actorLogin: payload.sender?.login || null,
      details: {
        removed: reposRemoved.map((r: any) => ({ id: r.id, fullName: r.full_name })),
      },
      ipAddress,
    });
  }
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
