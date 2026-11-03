/**
 * Failure Signature Data Access Repository (The Cloud Moat Engine).
 * Deduplicates failure patterns across runs, tracks retry passes,
 * flakiness scores, and provides pgvector semantic search.
 */

import { DatabaseExecutor, getDatabaseExecutor } from '../client.js';
import { FailureSignature, UpsertFailureSignatureInput, WorkflowFailure } from '../types.js';

export interface SemanticSearchResult extends FailureSignature {
  similarity: number;
}

export class FailureSignatureRepository {
  constructor(private executor?: DatabaseExecutor) {}

  private get db(): DatabaseExecutor {
    return this.executor || getDatabaseExecutor();
  }

  async findById(id: string): Promise<FailureSignature | null> {
    const res = await this.db.query<FailureSignature>(
      'SELECT * FROM failure_signatures WHERE id = $1 LIMIT 1',
      [id]
    );
    return res.rows[0] || null;
  }

  async findWithCrossRunTimeline(signatureId: string, limit = 20): Promise<{
    signature: FailureSignature;
    failures: WorkflowFailure[];
    occurrenceCount: number;
  }> {
    // Get the signature details
    const signature = await this.findById(signatureId);
    if (!signature) {
      throw new Error(`FailureSignature with id ${signatureId} not found`);
    }

    // Get the cross-run timeline - all failures associated with this signature
    const failures = await this.db.query<WorkflowFailure>(
      'SELECT * FROM workflow_failures WHERE signature_id = $1 ORDER BY failed_at DESC LIMIT $2',
      [signatureId, limit]
    );

    return {
      signature,
      failures: failures.rows,
      occurrenceCount: signature.total_occurrences,
    };
  }

  async findByHash(repoId: string, signatureHash: string): Promise<FailureSignature | null> {
    const res = await this.db.query<FailureSignature>(
      'SELECT * FROM failure_signatures WHERE repo_id = $1 AND signature_hash = $2 LIMIT 1',
      [repoId, signatureHash]
    );
    return res.rows[0] || null;
  }

  async upsert(input: UpsertFailureSignatureInput): Promise<FailureSignature> {
    // If embedding is supplied, format as pgvector literal string '[v1,v2,...]'
    const embeddingStr = input.embedding ? `[${input.embedding.join(',')}]` : null;

    const sql = `
      INSERT INTO failure_signatures (
        repo_id,
        signature_hash,
        normalized_template,
        test_identifier,
        error_category,
        embedding,
        flakiness_score,
        cached_root_cause,
        cached_next_check,
        total_occurrences,
        last_seen_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8, $9, 1, NOW())
      ON CONFLICT (repo_id, signature_hash)
      DO UPDATE SET
        total_occurrences = failure_signatures.total_occurrences + 1,
        test_identifier = COALESCE(EXCLUDED.test_identifier, failure_signatures.test_identifier),
        error_category = EXCLUDED.error_category,
        embedding = COALESCE(EXCLUDED.embedding, failure_signatures.embedding),
        cached_root_cause = COALESCE(EXCLUDED.cached_root_cause, failure_signatures.cached_root_cause),
        cached_next_check = COALESCE(EXCLUDED.cached_next_check, failure_signatures.cached_next_check),
        last_seen_at = NOW()
      RETURNING *;
    `;

    const res = await this.db.query<FailureSignature>(sql, [
      input.repoId,
      input.signatureHash,
      input.normalizedTemplate,
      input.testIdentifier || null,
      input.errorCategory,
      embeddingStr,
      input.flakinessScore ?? 0.0,
      input.cachedRootCause || null,
      input.cachedNextCheck || null,
    ]);

    return res.rows[0];
  }

  async incrementOccurrence(
    signatureId: string,
    isMainBranch: boolean,
    isNewPr: boolean
  ): Promise<FailureSignature> {
    const sql = `
      UPDATE failure_signatures
      SET
        total_occurrences = total_occurrences + 1,
        main_branch_occurrences = main_branch_occurrences + (CASE WHEN $2::boolean THEN 1 ELSE 0 END),
        unique_prs_affected = unique_prs_affected + (CASE WHEN $3::boolean THEN 1 ELSE 0 END),
        last_seen_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const res = await this.db.query<FailureSignature>(sql, [
      signatureId,
      isMainBranch,
      isNewPr,
    ]);
    if (!res.rows[0]) {
      throw new Error(`FailureSignature with id ${signatureId} not found`);
    }
    return res.rows[0];
  }

  async incrementRetryPass(signatureId: string): Promise<FailureSignature> {
    const sql = `
      UPDATE failure_signatures
      SET
        same_sha_retry_passes = same_sha_retry_passes + 1,
        last_seen_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const res = await this.db.query<FailureSignature>(sql, [signatureId]);
    if (!res.rows[0]) {
      throw new Error(`FailureSignature with id ${signatureId} not found`);
    }
    return res.rows[0];
  }

  async updateFlakinessAndCache(params: {
    signatureId: string;
    flakinessScore: number;
    cachedRootCause?: string | null;
    cachedNextCheck?: string | null;
  }): Promise<FailureSignature> {
    const sql = `
      UPDATE failure_signatures
      SET
        flakiness_score = $2,
        cached_root_cause = COALESCE($3, cached_root_cause),
        cached_next_check = COALESCE($4, cached_next_check),
        last_seen_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;
    const res = await this.db.query<FailureSignature>(sql, [
      params.signatureId,
      params.flakinessScore,
      params.cachedRootCause || null,
      params.cachedNextCheck || null,
    ]);
    if (!res.rows[0]) {
      throw new Error(`FailureSignature with id ${params.signatureId} not found`);
    }
    return res.rows[0];
  }

  async findTopFlaky(repoId: string, limit = 10): Promise<FailureSignature[]> {
    const sql = `
      SELECT *
      FROM failure_signatures
      WHERE repo_id = $1
      ORDER BY flakiness_score DESC, total_occurrences DESC
      LIMIT $2;
    `;
    const res = await this.db.query<FailureSignature>(sql, [repoId, limit]);
    return res.rows;
  }

  /**
   * Search for semantically similar signatures using pgvector cosine distance.
   */
  async findSimilarByEmbedding(
    repoId: string,
    embedding: number[],
    threshold = 0.85,
    limit = 5
  ): Promise<SemanticSearchResult[]> {
    const embeddingStr = `[${embedding.join(',')}]`;
    const sql = `
      SELECT
        *,
        1 - (embedding <=> $2::vector) AS similarity
      FROM failure_signatures
      WHERE
        repo_id = $1
        AND embedding IS NOT NULL
        AND (1 - (embedding <=> $2::vector)) >= $3
      ORDER BY embedding <=> $2::vector ASC
      LIMIT $4;
    `;
    const res = await this.db.query<SemanticSearchResult>(sql, [
      repoId,
      embeddingStr,
      threshold,
      limit,
    ]);
    return res.rows;
  }
}
