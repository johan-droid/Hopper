import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { createServer } from '../src/server/index.js';
import { DEFAULT_DEV_JWT_SECRET } from '../src/server/middleware/auth.js';

function createDevToken(userId: string) {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(
    JSON.stringify({
      sub: userId,
      email: `${userId}@hopper.local`,
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', DEFAULT_DEV_JWT_SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

describe('Workspace REST API & Security Middleware', () => {
  it('enforces security headers across responses', async () => {
    const app = createServer();
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(res.status).toBe(200);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('x-xss-protection')).toBe('0');
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('rejects unauthenticated requests to /api/workspaces with standardized error envelope', async () => {
    const app = createServer();
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/workspaces`);
      expect(res.status).toBe(401);
      const data = await res.json() as any;
      expect(data.success).toBe(false);
      expect(data.status).toBe('error');
      expect(data.error.code).toBe('UNAUTHORIZED');
      expect(data.error.message).toContain('Missing or malformed Authorization header');
      expect(data.error.path).toBe('/api/workspaces');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('allows authenticated requests and performs workspace lifecycle operations', async () => {
    const token = createDevToken('00000000-0000-0000-0000-000000000001');
    const authHeaders = {
      Authorization: `Bearer ${token}`,
    };

    const app = createServer();
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      // 1. Fetch profile with dev identity
      const profileRes = await fetch(`http://127.0.0.1:${port}/api/user/profile`, {
        headers: authHeaders,
      });
      expect(profileRes.status).toBe(200);
      const profileData = (await profileRes.json()) as any;
      expect(profileData.success).toBe(true);
      expect(profileData.profile).toBeDefined();

      // 2. Create workspace
      const createRes = await fetch(`http://127.0.0.1:${port}/api/workspaces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          name: 'Core Platform Engineering',
          type: 'organization',
          description: 'Platform and infrastructure teams',
        }),
      });
      expect(createRes.status).toBe(201);
      const createData = (await createRes.json()) as any;
      expect(createData.success).toBe(true);
      expect(createData.workspace.name).toBe('Core Platform Engineering');
      const workspaceId = createData.workspace.id;

      // 3. List workspaces
      const listRes = await fetch(`http://127.0.0.1:${port}/api/workspaces`, {
        headers: authHeaders,
      });
      expect(listRes.status).toBe(200);
      const listData = (await listRes.json()) as any;
      expect(listData.success).toBe(true);
      expect(listData.workspaces.length).toBeGreaterThanOrEqual(1);

      // 4. Get workspace by ID
      const getRes = await fetch(`http://127.0.0.1:${port}/api/workspaces/${workspaceId}`, {
        headers: authHeaders,
      });
      expect(getRes.status).toBe(200);
      const getData = (await getRes.json()) as any;
      expect(getData.success).toBe(true);
      expect(getData.workspace.id).toBe(workspaceId);

      // 5. Update workspace details
      const updateRes = await fetch(`http://127.0.0.1:${port}/api/workspaces/${workspaceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          description: 'Updated description for platform teams',
        }),
      });
      expect(updateRes.status).toBe(200);
      const updateData = (await updateRes.json()) as any;
      expect(updateData.success).toBe(true);
      expect(updateData.workspace.description).toBe('Updated description for platform teams');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

