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
        is_active
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (github_repo_id)
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        default_branch = EXCLUDED.default_branch,
        is_active = EXCLUDED.is_active
      RETURNING *;
    `;

    const res = await this.db.query<Repository>(sql, [
      input.orgId,
      input.githubRepoId,
      input.fullName,
      input.defaultBranch || 'main',
      input.isActive ?? true,
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
}
