import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/server/app.js';
import { UserProfileRepository } from '../src/db/repositories/user-profile.repository.js';
import { WorkspaceRepository } from '../src/db/repositories/workspace.repository.js';
import { OrganizationRepository } from '../src/db/repositories/organization.repository.js';
import { RepositoryRepository } from '../src/db/repositories/repository.repository.js';

describe('GitHub Authentication & Synchronization Engine', () => {
  let server: any;
  let baseUrl: string;
  const repoRepo = new RepositoryRepository();

  beforeAll(async () => {
    const app = createApp();
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('initiates GitHub OAuth flow with correct scopes and parameters', async () => {
    const res = await fetch(`${baseUrl}/api/auth/github?format=json`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.url).toBeDefined();
    expect(body.url).toContain('https://github.com/login/oauth/authorize');
    expect(body.url).toContain('client_id=');
    expect(body.url).toContain('scope=read%3Auser%2Cuser%3Aemail%2Cread%3Aorg%2Crepo');
    expect(body.state).toBeDefined();
  });

  it('authenticates via GitHub token, creates profile, default workspace, and syncs initial resources', async () => {
    const res = await fetch(`${baseUrl}/api/auth/github/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'ghp_mock_developer_access_token' }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.token).toBeDefined();
    expect(data.user).toBeDefined();
    expect(data.user.login).toBe('johan-droid');
    expect(data.workspaceId).toBeDefined();
    expect(data.sync).toBeDefined();
    expect(data.sync.organizationsSynced).toBeGreaterThanOrEqual(1);
    expect(data.sync.repositoriesSynced).toBeGreaterThanOrEqual(1);

    // Verify session inspection with GET /api/auth/me
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${data.token}` },
    });

    expect(meRes.status).toBe(200);
    const meData = (await meRes.json()) as any;
    expect(meData.authenticated).toBe(true);
    expect(meData.user.login).toBe('johan-droid');
    expect(meData.user.github_user_id).toBe(1029384);
    expect(meData.currentWorkspace).toBeDefined();
    expect(meData.currentWorkspace.id).toBe(data.workspaceId);
  });

  it('handles GitHub OAuth callback and returns session payload', async () => {
    const res = await fetch(`${baseUrl}/api/auth/github/callback?code=mock_oauth_code_123&format=json`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.token).toBeDefined();
    expect(data.user.login).toBe('johan-droid');
    expect(data.workspaceId).toBeDefined();
  });

  it('executes GitHub resource sync and discovers organizations and repositories', async () => {
    // 1. Authenticate to obtain token
    const authRes = await fetch(`${baseUrl}/api/auth/github/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'ghp_mock_sync_token' }),
    });
    const authData = (await authRes.json()) as any;
    const token = authData.token;
    const workspaceId = authData.workspaceId;

    // 2. Execute explicit sync
    const syncRes = await fetch(`${baseUrl}/api/auth/sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        githubToken: 'ghp_mock_sync_token',
        workspaceId,
      }),
    });

    expect(syncRes.status).toBe(200);
    const syncData = (await syncRes.json()) as any;
    expect(syncData.success).toBe(true);
    expect(syncData.user.login).toBe('johan-droid');
    expect(syncData.stats.organizationsSynced).toBeGreaterThanOrEqual(1);
    expect(syncData.stats.repositoriesSynced).toBeGreaterThanOrEqual(1);
    expect(syncData.repositories.length).toBeGreaterThanOrEqual(1);

    // 3. Verify repositories are now queryable via RepositoryRepository in the workspace
    const reposInWs = await repoRepo.listByWorkspaceId(workspaceId);
    expect(reposInWs.length).toBeGreaterThanOrEqual(1);
    const hopperRepo = reposInWs.find((r) => r.full_name.includes('Hopper'));
    expect(hopperRepo).toBeDefined();
    expect(hopperRepo?.is_active).toBe(true);

    // 4. Verify API route GET /api/repositories with the authenticated token
    const apiReposRes = await fetch(`${baseUrl}/api/repositories?workspaceId=${workspaceId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(apiReposRes.status).toBe(200);
    const apiReposData = (await apiReposRes.json()) as any;
    expect(apiReposData.success).toBe(true);
    expect(apiReposData.repositories.length).toBeGreaterThanOrEqual(1);
    expect(apiReposData.repositories.some((r: any) => r.full_name.includes('Hopper'))).toBe(true);
  });

  it('rejects unauthenticated sync request with 401 Unauthorized', async () => {
    const res = await fetch(`${baseUrl}/api/auth/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it('rejects token login when token is empty or invalid', async () => {
    const res = await fetch(`${baseUrl}/api/auth/github/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: '' }),
    });
    expect(res.status).toBe(400);
  });
});
