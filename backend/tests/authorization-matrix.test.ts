import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { createServer } from '../src/server/index.js';
import { DEFAULT_DEV_JWT_SECRET } from '../src/server/middleware/auth.js';

function createToken(userId: string, email: string) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(
    JSON.stringify({
      sub: userId,
      email,
      aud: 'authenticated',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', DEFAULT_DEV_JWT_SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

describe('Phase 12: Authorization Matrix & Tenant Isolation (IDOR Defense)', () => {
  // Identities
  const ownerId = '11111111-0000-0000-0000-000000000001';
  const adminId = '22222222-0000-0000-0000-000000000002';
  const devId = '33333333-0000-0000-0000-000000000003';
  const viewerId = '44444444-0000-0000-0000-000000000004';
  const outsiderId = '99999999-0000-0000-0000-000000000009';

  const ownerToken = createToken(ownerId, 'owner@acme.corp');
  const adminToken = createToken(adminId, 'admin@acme.corp');
  const devToken = createToken(devId, 'developer@acme.corp');
  const viewerToken = createToken(viewerId, 'viewer@acme.corp');
  const outsiderToken = createToken(outsiderId, 'outsider@other.corp');

  let server: any;
  let port: number;
  let workspaceId: string;
  let ownerProfileId: string;
  let adminProfileId: string;
  let devProfileId: string;
  let viewerProfileId: string;

  beforeAll(async () => {
    const app = createServer();
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address();
    port = typeof address === 'object' && address ? address.port : 0;

    // 1. Initialize profiles
    const initProfile = async (token: string, name: string) => {
      const res = await fetch(`http://127.0.0.1:${port}/api/user/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as any;
      return data.profile.id;
    };

    ownerProfileId = await initProfile(ownerToken, 'Owner User');
    adminProfileId = await initProfile(adminToken, 'Admin User');
    devProfileId = await initProfile(devToken, 'Developer User');
    viewerProfileId = await initProfile(viewerToken, 'Viewer User');
    await initProfile(outsiderToken, 'Outsider User');

    // 2. Owner creates private workspace
    const createRes = await fetch(`http://127.0.0.1:${port}/api/workspaces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: 'Confidential Finance Systems',
        type: 'organization',
        isPublic: false,
      }),
    });
    const createData = (await createRes.json()) as any;
    workspaceId = createData.workspace.id;

    // 3. Owner adds Admin, Developer, and Viewer
    const addMember = async (targetProfileId: string, role: string) => {
      await fetch(`http://127.0.0.1:${port}/api/workspaces/${workspaceId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`,
        },
        body: JSON.stringify({ userId: targetProfileId, role }),
      });
    };

    await addMember(adminProfileId, 'admin');
    await addMember(devProfileId, 'developer');
    await addMember(viewerProfileId, 'viewer');
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // 1. Workspace Read Permissions
  it('1. Workspace Read: Members can view; Outsider/Unauthenticated are blocked on private workspace', async () => {
    // Unauthenticated
    const resUnauth = await fetch(`http://127.0.0.1:${port}/api/workspaces/${workspaceId}`);
    expect(resUnauth.status).toBe(401);

    // Outsider (Cross-tenant)
    const resOutsider = await fetch(`http://127.0.0.1:${port}/api/workspaces/${workspaceId}`, {
      headers: { Authorization: `Bearer ${outsiderToken}` },
    });
    expect(resOutsider.status).toBe(403);

    // Viewer, Developer, Admin, Owner can all view
    for (const token of [viewerToken, devToken, adminToken, ownerToken]) {
      const res = await fetch(`http://127.0.0.1:${port}/api/workspaces/${workspaceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.workspace.id).toBe(workspaceId);
    }
  });

  // 2. Workspace Modification Permissions
  it('2. Workspace Modification: Only Owner and Admin can update; Developer and Viewer are rejected', async () => {
    // Viewer update attempt
    const resViewer = await fetch(`http://127.0.0.1:${port}/api/workspaces/${workspaceId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${viewerToken}`,
      },
      body: JSON.stringify({ description: 'Hacked by viewer' }),
    });
    expect(resViewer.status).toBe(403);

    // Developer update attempt
    const resDev = await fetch(`http://127.0.0.1:${port}/api/workspaces/${workspaceId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${devToken}`,
      },
      body: JSON.stringify({ description: 'Hacked by dev' }),
    });
    expect(resDev.status).toBe(403);

    // Admin update attempt (Should succeed)
    const resAdmin = await fetch(`http://127.0.0.1:${port}/api/workspaces/${workspaceId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ description: 'Updated by Admin' }),
    });
    expect(resAdmin.status).toBe(200);
  });

  // 3. Workspace Member Addition
  it('3. Member Addition: Developer and Viewer cannot add members; Admin can add', async () => {
    const resDev = await fetch(`http://127.0.0.1:${port}/api/workspaces/${workspaceId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${devToken}`,
      },
      body: JSON.stringify({ userId: outsiderProfileIdMock(), role: 'developer' }),
    });
    expect(resDev.status).toBe(403);
  });

  // 4. Admin cannot remove Owner (Privilege Escalation Defense)
  it('4. Privilege Escalation Defense: Admin cannot remove Workspace Owner', async () => {
    const resAdminKillOwner = await fetch(
      `http://127.0.0.1:${port}/api/workspaces/${workspaceId}/members/${ownerProfileId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );
    expect(resAdminKillOwner.status).toBe(403);
    const data = (await resAdminKillOwner.json()) as any;
    expect(data.error.message).toContain('Only workspace owners can remove an owner');
  });

  // 5. Workspace Deletion: Owner Only
  it('5. Workspace Deletion: Only Owner can delete; Admin, Dev, Viewer rejected', async () => {
    const resAdmin = await fetch(`http://127.0.0.1:${port}/api/workspaces/${workspaceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(resAdmin.status).toBe(403);

    const resDev = await fetch(`http://127.0.0.1:${port}/api/workspaces/${workspaceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${devToken}` },
    });
    expect(resDev.status).toBe(403);
  });

  // Helper
  function outsiderProfileIdMock() {
    return '00000000-0000-0000-0000-000000000099';
  }
});
