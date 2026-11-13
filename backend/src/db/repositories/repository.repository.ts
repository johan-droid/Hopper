/**
 * Repository Data Access Repository.
 * Manages GitHub repository records linked to organizations.
 */

import { DatabaseExecutor, getDatabaseExecutor } from '../client.js';
import { Repository, UpsertRepositoryInput } from '../types.js';

export class RepositoryRepository {
  constructor(private executor?: DatabaseExecutor) {}

  private get db(): DatabaseExecutor {
    return this.executor || getDatabaseExecutor();
  }

  async findById(id: string): Promise<Repository | null> {
    const res = await this.db.query<Repository>(
      'SELECT * FROM repositories WHERE id = $1 LIMIT 1',
      [id]
    );
    return res.rows[0] || null;
  }

  async findByGithubRepoId(githubRepoId: number): Promise<Repository | null> {
    const res = await this.db.query<Repository>(
      'SELECT * FROM repositories WHERE github_repo_id = $1 LIMIT 1',
      [githubRepoId]
    );
    return res.rows[0] || null;
  }

  async findByFullName(fullName: string): Promise<Repository | null> {
    const res = await this.db.query<Repository>(
      'SELECT * FROM repositories WHERE full_name = $1 LIMIT 1',
      [fullName]
    );
    return res.rows[0] || null;
  }

  async upsert(input: UpsertRepositoryInput): Promise<Repository> {
    const sql = `
      INSERT INTO repositories (
        org_id,
        github_repo_id,
        full_name,
        default_branch,
        is_active,
        workspace_id
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (github_repo_id)
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        default_branch = EXCLUDED.default_branch,
        is_active = EXCLUDED.is_active,
        workspace_id = COALESCE(EXCLUDED.workspace_id, repositories.workspace_id)
      RETURNING *;
    `;

    const res = await this.db.query<Repository>(sql, [
      input.orgId,
      input.githubRepoId,
      input.fullName,
      input.defaultBranch || 'main',
      input.isActive ?? true,
      input.workspaceId ?? null,
    ]);

    return res.rows[0];
  }

  async listByOrgId(orgId: string): Promise<Repository[]> {
    const res = await this.db.query<Repository>(
      'SELECT * FROM repositories WHERE org_id = $1 ORDER BY full_name ASC',
      [orgId]
    );
    return res.rows;
  }

  async listByWorkspaceId(workspaceId: string): Promise<Repository[]> {
    const res = await this.db.query<Repository>(
      `SELECT r.* FROM repositories r
       LEFT JOIN organizations o ON r.org_id = o.id
       WHERE r.workspace_id = $1 OR o.workspace_id = $1
       ORDER BY r.full_name ASC`,
      [workspaceId]
    );
    return res.rows;
  }

  async linkWorkspace(repoId: string, workspaceId: string): Promise<Repository> {
    const res = await this.db.query<Repository>(
      'UPDATE repositories SET workspace_id = $2 WHERE id = $1 RETURNING *',
      [repoId, workspaceId]
    );
    if (!res.rows[0]) {
      throw new Error(`Repository with id ${repoId} not found`);
    }
    return res.rows[0];
  }

  async deactivateByOrgId(orgId: string): Promise<number> {
    const res = await this.db.query(
      'UPDATE repositories SET is_active = FALSE WHERE org_id = $1',
      [orgId]
    );
    return res.rowCount ?? 0;
  }

  async deactivateByGithubRepoId(githubRepoId: number): Promise<boolean> {
    const res = await this.db.query(
      'UPDATE repositories SET is_active = FALSE WHERE github_repo_id = $1',
      [githubRepoId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  async updateSyncMetadata(
    githubRepoId: number,
    metadata: {
      visibility?: 'public' | 'private' | 'internal';
      isArchived?: boolean;
      lastSyncedAt?: Date;
      fullName?: string;
      defaultBranch?: string;
    }
  ): Promise<Repository | null> {
    const res = await this.db.query<Repository>(
      `UPDATE repositories
       SET visibility = COALESCE($2, visibility),
           is_archived = COALESCE($3, is_archived),
           last_synced_at = COALESCE($4, last_synced_at),
           full_name = COALESCE($5, full_name),
           default_branch = COALESCE($6, default_branch)
       WHERE github_repo_id = $1
       RETURNING *;`,
      [
        githubRepoId,
        metadata.visibility || null,
        metadata.isArchived ?? null,
        metadata.lastSyncedAt ? metadata.lastSyncedAt.toISOString() : null,
        metadata.fullName || null,
        metadata.defaultBranch || null,
      ]
    );
    return res.rows[0] || null;
  }
}
