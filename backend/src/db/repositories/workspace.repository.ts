/**
 * Workspace Data Access Repository.
 * Handles workspace multi-tenant lifecycles, membership, and RBAC associations.
 */

import { DatabaseExecutor, getDatabaseExecutor, withTransaction } from '../client.js';
import {
  Workspace,
  WorkspaceMember,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  AddWorkspaceMemberInput,
  UserRole,
} from '../types.js';

export interface WorkspaceMemberDetail extends WorkspaceMember {
  username?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
}

export class WorkspaceRepository {
  constructor(private executor?: DatabaseExecutor) {}

  private get db(): DatabaseExecutor {
    return this.executor || getDatabaseExecutor();
  }

  async findById(id: string): Promise<Workspace | null> {
    const res = await this.db.query<Workspace>(
      'SELECT * FROM workspaces WHERE id = $1 LIMIT 1',
      [id]
    );
    return res.rows[0] || null;
  }

  async listByUserId(userProfileId: string): Promise<Workspace[]> {
    const sql = `
      SELECT DISTINCT w.*
      FROM workspaces w
      LEFT JOIN workspace_members wm ON w.id = wm.workspace_id
      WHERE w.owner_id = $1 OR wm.user_id = $1
      ORDER BY w.created_at DESC
    `;
    const res = await this.db.query<Workspace>(sql, [userProfileId]);
    return res.rows;
  }

  async create(input: CreateWorkspaceInput): Promise<Workspace> {
    const execute = async (db: DatabaseExecutor) => {
      const sql = `
        INSERT INTO workspaces (name, type, owner_id, parent_workspace_id, description, is_public)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      const res = await db.query<Workspace>(sql, [
        input.name,
        input.type || 'organization',
        input.ownerId,
        input.parentWorkspaceId || null,
        input.description || null,
        input.isPublic || false,
      ]);
      const workspace = res.rows[0];

      // Automatically assign owner as member with 'owner' role inside the same atomic transaction
      const memberSql = `
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role
        RETURNING *
      `;
      await db.query(memberSql, [
        workspace.id,
        input.ownerId,
        'owner',
      ]);

      return workspace;
    };

    if (this.executor) {
      return execute(this.executor);
    }
    return withTransaction((tx) => execute(tx));
  }

  async update(id: string, input: UpdateWorkspaceInput): Promise<Workspace> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(input.description);
    }
    if (input.isPublic !== undefined) {
      updates.push(`is_public = $${paramIndex++}`);
      values.push(input.isPublic);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const sql = `UPDATE workspaces SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    const res = await this.db.query<Workspace>(sql, values);
    if (!res.rows[0]) {
      throw new Error(`Workspace with id ${id} not found`);
    }
    return res.rows[0];
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.db.query('DELETE FROM workspaces WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async getMembers(workspaceId: string): Promise<WorkspaceMemberDetail[]> {
    const sql = `
      SELECT 
        wm.*,
        up.username,
        up.full_name,
        up.avatar_url
      FROM workspace_members wm
      JOIN user_profiles up ON wm.user_id = up.id
      WHERE wm.workspace_id = $1
      ORDER BY wm.joined_at ASC
    `;
    const res = await this.db.query<WorkspaceMemberDetail>(sql, [workspaceId]);
    return res.rows;
  }

  async addMember(input: AddWorkspaceMemberInput): Promise<WorkspaceMember> {
    const sql = `
      INSERT INTO workspace_members (workspace_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role
      RETURNING *
    `;
    const res = await this.db.query<WorkspaceMember>(sql, [
      input.workspaceId,
      input.userId,
      input.role,
    ]);
    return res.rows[0];
  }

  async removeMember(workspaceId: string, userId: string): Promise<boolean> {
    const sql = 'DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2';
    const res = await this.db.query(sql, [workspaceId, userId]);
    return (res.rowCount ?? 0) > 0;
  }

  async updateMemberRole(workspaceId: string, userId: string, role: UserRole): Promise<WorkspaceMember> {
    const sql = `
      UPDATE workspace_members 
      SET role = $1 
      WHERE workspace_id = $2 AND user_id = $3 
      RETURNING *
    `;
    const res = await this.db.query<WorkspaceMember>(sql, [role, workspaceId, userId]);
    if (!res.rows[0]) {
      throw new Error(`Member with user_id ${userId} not found in workspace ${workspaceId}`);
    }
    return res.rows[0];
  }

  async getUserRoleInWorkspace(workspaceId: string, userProfileId: string): Promise<UserRole | null> {
    const sql = `
      SELECT role FROM workspace_members 
      WHERE workspace_id = $1 AND user_id = $2 
      LIMIT 1
    `;
    const res = await this.db.query<{ role: UserRole }>(sql, [workspaceId, userProfileId]);
    if (res.rows[0]?.role) {
      return res.rows[0].role;
    }

    // Defense-in-depth: If member row is missing, check if user is the explicit owner
    const ownerRes = await this.db.query<{ owner_id: string }>(
      'SELECT owner_id FROM workspaces WHERE id = $1 LIMIT 1',
      [workspaceId]
    );
    if (ownerRes.rows[0]?.owner_id === userProfileId) {
      return 'owner';
    }

    return null;
  }
}

