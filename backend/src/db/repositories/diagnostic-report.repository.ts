/**
 * Diagnostic Report Data Access Repository.
 * Stores generated AI diagnoses, relevant log lines, and PR comment references.
 */

import { DatabaseExecutor, getDatabaseExecutor } from '../client.js';
import { CreateDiagnosticReportInput, DiagnosticReport } from '../types.js';

export class DiagnosticReportRepository {
  constructor(private executor?: DatabaseExecutor) {}

  private get db(): DatabaseExecutor {
    return this.executor || getDatabaseExecutor();
  }

  async findById(id: string): Promise<DiagnosticReport | null> {
    const res = await this.db.query<DiagnosticReport>(
      'SELECT * FROM diagnostic_reports WHERE id = $1 LIMIT 1',
      [id]
    );
    return res.rows[0] || null;
  }

  async findByFailureId(failureId: string): Promise<DiagnosticReport | null> {
    const res = await this.db.query<DiagnosticReport>(
      'SELECT * FROM diagnostic_reports WHERE failure_id = $1 LIMIT 1',
      [failureId]
    );
    return res.rows[0] || null;
  }

  async create(input: CreateDiagnosticReportInput): Promise<DiagnosticReport> {
    const sql = `
      INSERT INTO diagnostic_reports (
        failure_id,
        root_cause_clues,
        likely_flaky_test,
        flaky_confidence,
        relevant_log_lines,
        suggested_next_check,
        local_repro_command,
        correlating_commit_files,
        github_comment_id,
        llm_model_used,
        prompt_tokens,
        completion_tokens
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (failure_id)
      DO UPDATE SET
        root_cause_clues = EXCLUDED.root_cause_clues,
        likely_flaky_test = EXCLUDED.likely_flaky_test,
        flaky_confidence = EXCLUDED.flaky_confidence,
        relevant_log_lines = EXCLUDED.relevant_log_lines,
        suggested_next_check = EXCLUDED.suggested_next_check,
        local_repro_command = EXCLUDED.local_repro_command,
        correlating_commit_files = EXCLUDED.correlating_commit_files,
        github_comment_id = COALESCE(EXCLUDED.github_comment_id, diagnostic_reports.github_comment_id),
        llm_model_used = EXCLUDED.llm_model_used,
        prompt_tokens = EXCLUDED.prompt_tokens,
        completion_tokens = EXCLUDED.completion_tokens
      RETURNING *;
    `;

    const res = await this.db.query<DiagnosticReport>(sql, [
      input.failureId,
      input.rootCauseClues,
      input.likelyFlakyTest || null,
      input.flakyConfidence ?? 0.0,
      JSON.stringify(input.relevantLogLines),
      input.suggestedNextCheck,
      input.localReproCommand || null,
      input.correlatingCommitFiles ? JSON.stringify(input.correlatingCommitFiles) : null,
      input.githubCommentId || null,
      input.llmModelUsed,
      input.promptTokens ?? 0,
      input.completionTokens ?? 0,
    ]);

    return res.rows[0];
  }

  async updateGithubCommentId(
    reportId: string,
    commentId: number
  ): Promise<DiagnosticReport> {
    const sql = `
      UPDATE diagnostic_reports
      SET github_comment_id = $2
      WHERE id = $1
      RETURNING *;
    `;
    const res = await this.db.query<DiagnosticReport>(sql, [reportId, commentId]);
    if (!res.rows[0]) {
      throw new Error(`DiagnosticReport with id ${reportId} not found`);
    }
    return res.rows[0];
  }

  async listRecentForWorkspace(
    workspaceId: string,
    limit = 50
  ): Promise<any[]> {
    const sql = `
      SELECT dr.*,
             wf.job_name,
             wf.workflow_name,
             wf.failed_step_name,
             wf.commit_sha,
             wf.branch,
             wf.pr_number,
             wf.failed_at,
             fs.signature_hash,
             fs.error_category,
             fs.flakiness_score,
             r.full_name as repo_full_name
      FROM diagnostic_reports dr
      JOIN workflow_failures wf ON dr.failure_id = wf.id
      JOIN repositories r ON wf.repo_id = r.id
      LEFT JOIN failure_signatures fs ON wf.signature_id = fs.id
      LEFT JOIN organizations o ON r.org_id = o.id
      WHERE r.workspace_id = $1 OR o.workspace_id = $1
      ORDER BY dr.created_at DESC
      LIMIT $2
    `;
    const res = await this.db.query(sql, [workspaceId, limit]);
    return res.rows;
  }
}
