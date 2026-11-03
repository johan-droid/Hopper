/**
 * Workflow Failure Data Access Repository.
 * Stores individual CI build/job failure records and sanitized log snippets.
 */

import { DatabaseExecutor, getDatabaseExecutor } from '../client.js';
import { CreateWorkflowFailureInput, WorkflowFailure } from '../types.js';

export class WorkflowFailureRepository {
  constructor(private executor?: DatabaseExecutor) {}

  private get db(): DatabaseExecutor {
    return this.executor || getDatabaseExecutor();
  }

  async findById(id: string): Promise<WorkflowFailure | null> {
    const res = await this.db.query<WorkflowFailure>(
      'SELECT * FROM workflow_failures WHERE id = $1 LIMIT 1',
      [id]
    );
    return res.rows[0] || null;
  }

  async findByJobId(githubJobId: number): Promise<WorkflowFailure | null> {
    const res = await this.db.query<WorkflowFailure>(
      'SELECT * FROM workflow_failures WHERE github_job_id = $1 LIMIT 1',
      [githubJobId]
    );
    return res.rows[0] || null;
  }

  async create(input: CreateWorkflowFailureInput): Promise<WorkflowFailure> {
    const sql = `
      INSERT INTO workflow_failures (
        repo_id,
        signature_id,
        github_run_id,
        github_job_id,
        github_run_attempt,
        workflow_name,
        job_name,
        failed_step_name,
        commit_sha,
        branch,
        pr_number,
        actor_login,
        exit_code,
        duration_ms,
        sanitized_log_snippet
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (github_job_id)
      DO UPDATE SET
        signature_id = EXCLUDED.signature_id,
        github_run_attempt = EXCLUDED.github_run_attempt,
        exit_code = EXCLUDED.exit_code,
        duration_ms = EXCLUDED.duration_ms,
        sanitized_log_snippet = EXCLUDED.sanitized_log_snippet
      RETURNING *;
    `;

    const res = await this.db.query<WorkflowFailure>(sql, [
      input.repoId,
      input.signatureId || null,
      input.githubRunId,
      input.githubJobId,
      input.githubRunAttempt || 1,
      input.workflowName,
      input.jobName,
      input.failedStepName || null,
      input.commitSha,
      input.branch,
      input.prNumber || null,
      input.actorLogin || null,
      input.exitCode ?? null,
      input.durationMs ?? null,
      input.sanitizedLogSnippet,
    ]);

    return res.rows[0];
  }

  async findByCommitSha(repoId: string, commitSha: string): Promise<WorkflowFailure[]> {
    const res = await this.db.query<WorkflowFailure>(
      'SELECT * FROM workflow_failures WHERE repo_id = $1 AND commit_sha = $2 ORDER BY failed_at DESC',
      [repoId, commitSha]
    );
    return res.rows;
  }

  async listRecentByRepo(repoId: string, limit = 20): Promise<WorkflowFailure[]> {
    const res = await this.db.query<WorkflowFailure>(
      'SELECT * FROM workflow_failures WHERE repo_id = $1 ORDER BY failed_at DESC LIMIT $2',
      [repoId, limit]
    );
    return res.rows;
  }

  async findFailuresBySignatureId(signatureId: string, limit = 20): Promise<WorkflowFailure[]> {
    const res = await this.db.query<WorkflowFailure>(
      'SELECT * FROM workflow_failures WHERE signature_id = $1 ORDER BY failed_at DESC LIMIT $2',
      [signatureId, limit]
    );
    return res.rows;
  }

  async listByRepoId(repoId: string, limit = 20): Promise<WorkflowFailure[]> {
    const res = await this.db.query<WorkflowFailure>(
      'SELECT * FROM workflow_failures WHERE repo_id = $1 ORDER BY failed_at DESC LIMIT $2',
      [repoId, limit]
    );
    return res.rows;
  }
}
