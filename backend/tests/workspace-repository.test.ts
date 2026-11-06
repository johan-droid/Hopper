import { describe, it, expect } from 'vitest';
import { WorkspaceRepository } from '../src/db/repositories/workspace.repository.js';
import { UserProfileRepository } from '../src/db/repositories/user-profile.repository.js';
import { DatabaseExecutor, QueryResultLike } from '../src/db/client.js';
import { Workspace, WorkspaceMember, UserProfile } from '../src/db/types.js';

describe('Workspace & User Profile Repositories', () => {
  describe('WorkspaceRepository', () => {
    it('creates workspace and queries members using mock executor', async () => {
      const executedQueries: Array<{ sql: string; params?: any[] }> = [];
      const mockWorkspace: Workspace = {
        id: 'ws-123',
        name: 'Acme Payments',
        type: 'organization',
        owner_id: 'up-456',
        parent_workspace_id: null,
        description: 'Core billing and payment services',
        is_public: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockMember: WorkspaceMember = {
        id: 'wm-789',
        workspace_id: 'ws-123',
        user_id: 'up-456',
        role: 'owner',
        joined_at: new Date(),
      };

      const executor: DatabaseExecutor = {
        query: async <T = any>(sql: string, params?: any[]): Promise<QueryResultLike<T>> => {
          executedQueries.push({ sql, params });
          if (sql.includes('INSERT INTO workspaces')) {
            return { rows: [mockWorkspace as unknown as T], rowCount: 1 };
          }
          if (sql.includes('INSERT INTO workspace_members')) {
            return { rows: [mockMember as unknown as T], rowCount: 1 };
          }
          if (sql.includes('SELECT * FROM workspaces WHERE id = $1')) {
            return { rows: [mockWorkspace as unknown as T], rowCount: 1 };
          }
          return { rows: [] as T[], rowCount: 0 };
        },
      };

      const repo = new WorkspaceRepository(executor);
      const created = await repo.create({
        name: 'Acme Payments',
        type: 'organization',
        ownerId: 'up-456',
        description: 'Core billing and payment services',
      });

      expect(created.id).toBe('ws-123');
      expect(created.name).toBe('Acme Payments');
      expect(executedQueries.length).toBe(2);
      expect(executedQueries[0].sql).toContain('INSERT INTO workspaces');
      expect(executedQueries[1].sql).toContain('INSERT INTO workspace_members');
      expect(executedQueries[1].params).toEqual(['ws-123', 'up-456', 'owner']);

      const found = await repo.findById('ws-123');
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Acme Payments');
    });

    it('manages member roles and permissions', async () => {
      const executor: DatabaseExecutor = {
        query: async <T = any>(sql: string, params?: any[]): Promise<QueryResultLike<T>> => {
          if (sql.includes('SELECT role FROM workspace_members')) {
            return { rows: [{ role: 'admin' }] as unknown as T[], rowCount: 1 };
          }
          if (sql.includes('UPDATE workspace_members')) {
            return {
              rows: [{ id: 'wm-1', workspace_id: params?.[1], user_id: params?.[2], role: params?.[0], joined_at: new Date() }] as unknown as T[],
              rowCount: 1,
            };
          }
          if (sql.includes('DELETE FROM workspace_members')) {
            return { rows: [], rowCount: 1 };
          }
          return { rows: [] as T[], rowCount: 0 };
        },
      };

      const repo = new WorkspaceRepository(executor);
      const role = await repo.getUserRoleInWorkspace('ws-123', 'up-456');
      expect(role).toBe('admin');

      const updated = await repo.updateMemberRole('ws-123', 'up-456', 'developer');
      expect(updated.role).toBe('developer');

      const removed = await repo.removeMember('ws-123', 'up-456');
      expect(removed).toBe(true);
    });
  });

  describe('UserProfileRepository', () => {
    it('upserts and retrieves user profiles', async () => {
      const mockProfile: UserProfile = {
        id: 'up-001',
        user_id: 'auth-user-999',
        username: 'dev_alex',
        full_name: 'Alex Johnson',
        avatar_url: 'https://avatars.githubusercontent.com/u/12345',
        bio: 'Staff Reliability Engineer',
        role: 'developer',
        current_workspace_id: 'ws-123',
        created_at: new Date(),
        updated_at: new Date(),
      };

      const executor: DatabaseExecutor = {
        query: async <T = any>(sql: string): Promise<QueryResultLike<T>> => {
          if (sql.includes('INSERT INTO user_profiles')) {
            return { rows: [mockProfile as unknown as T], rowCount: 1 };
          }
          if (sql.includes('SELECT * FROM user_profiles WHERE user_id = $1')) {
            return { rows: [mockProfile as unknown as T], rowCount: 1 };
          }
          return { rows: [] as T[], rowCount: 0 };
        },
      };

      const repo = new UserProfileRepository(executor);
      const upserted = await repo.upsert({
        userId: 'auth-user-999',
        username: 'dev_alex',
        fullName: 'Alex Johnson',
      });

      expect(upserted.username).toBe('dev_alex');
      expect(upserted.full_name).toBe('Alex Johnson');

      const found = await repo.findByUserId('auth-user-999');
      expect(found).not.toBeNull();
      expect(found?.bio).toBe('Staff Reliability Engineer');
    });
  });
});

