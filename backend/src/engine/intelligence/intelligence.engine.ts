/**
 * B5. Intelligence Engine — Cloud Moat Flakiness & Failure Correlation.
 * Responsibilities:
 * - Generates normalized template and deterministic SHA-256 signature hash.
 * - Manages Cloud Moat failure signature cache (6-hour validity window).
 * - Computes Bayesian flakiness score based on confirmed retry passes.
 * - Performs semantic vector similarity search via pgvector.
 * - Tracks cross-run occurrence counts (30d/90d, main branch vs PRs).
 */

import { computeFailureSignature } from '../../lib/parser/fingerprinter.js';
import { calculateFlakinessScore } from '../../lib/moat/flakiness-engine.js';
import { generateEmbedding } from '../../lib/ai/embeddings.js';
import { FailureSignatureRepository } from '../../db/repositories/failure-signature.repository.js';
import { NormalizedEvidence, FailureIntelligence } from '../types.js';

export class IntelligenceEngine {
  constructor(private failureSigRepo: FailureSignatureRepository) {}

  /**
   * Correlates evidence against existing failure signatures and computes flakiness score.
   */
  async correlateFailure(params: {
    repoId: string;
    jobName: string;
    stepName: string;
    evidence: NormalizedEvidence;
    isMainBranch: boolean;
    modifiedFiles: string[];
  }): Promise<{ intelligence: FailureIntelligence; signatureRecord: any }> {
    const { repoId, jobName, stepName, evidence, isMainBranch, modifiedFiles } = params;

    // 1. Compute Deterministic SHA-256 Fingerprint
    const signatureObj = computeFailureSignature(
      jobName,
      stepName,
      evidence.detectedTestIdentifier,
      evidence.cleanedSnippet
    );

    // 2. Lookup existing signature in repository scope
    const existingSig = await this.failureSigRepo.findByHash(repoId, signatureObj.signatureHash);

    let currentFlakinessScore = 0;
    let signatureRecord: any;

    if (existingSig) {
      // Increment occurrence count
      signatureRecord = await this.failureSigRepo.incrementOccurrence(existingSig.id, isMainBranch, true);
      currentFlakinessScore = calculateFlakinessScore({
        sameShaRetryPasses: signatureRecord.same_sha_retry_passes,
        uniquePrsAffected: signatureRecord.unique_prs_affected,
        totalOccurrences: signatureRecord.total_occurrences,
        mainBranchOccurrences: signatureRecord.main_branch_occurrences,
        cleanedSnippet: evidence.cleanedSnippet,
      });

      await this.failureSigRepo.updateFlakinessAndCache({
        signatureId: signatureRecord.id,
        flakinessScore: currentFlakinessScore,
      });
    } else {
      // First occurrence of signature
      currentFlakinessScore = calculateFlakinessScore({
        sameShaRetryPasses: 0,
        uniquePrsAffected: 1,
        totalOccurrences: 1,
        mainBranchOccurrences: isMainBranch ? 1 : 0,
        cleanedSnippet: evidence.cleanedSnippet,
      });

      const embedding = await generateEmbedding(signatureObj.normalizedTemplate);
      let semanticCachedCause: string | null = null;
      let semanticCachedCheck: string | null = null;

      try {
        const similarSigs = await this.failureSigRepo.findSimilarByEmbedding(repoId, embedding, 0.92, 1);
        if (similarSigs.length > 0 && similarSigs[0].cached_root_cause) {
          semanticCachedCause = similarSigs[0].cached_root_cause;
          semanticCachedCheck = similarSigs[0].cached_next_check;
          currentFlakinessScore = Math.max(currentFlakinessScore, similarSigs[0].flakiness_score);
        }
      } catch {
        // Continue gracefully if vector extension is unavailable
      }

      signatureRecord = await this.failureSigRepo.upsert({
        repoId,
        signatureHash: signatureObj.signatureHash,
        normalizedTemplate: signatureObj.normalizedTemplate,
        testIdentifier: evidence.detectedTestIdentifier,
        errorCategory: 'test_assertion',
        embedding,
        flakinessScore: currentFlakinessScore,
        cachedRootCause: semanticCachedCause,
        cachedNextCheck: semanticCachedCheck,
      });
    }

    // 3. Evaluate Cache Hit Condition (valid < 6h, no modified file overlap)
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const hasModifiedFileOverlap = modifiedFiles.some((f) => evidence.cleanedSnippet.includes(f));
    const isCached = Boolean(
      signatureRecord.cached_root_cause &&
        signatureRecord.last_seen_at &&
        new Date(signatureRecord.last_seen_at) >= sixHoursAgo &&
        !hasModifiedFileOverlap
    );

    const intelligence: FailureIntelligence = {
      signatureHash: signatureObj.signatureHash,
      normalizedTemplate: signatureObj.normalizedTemplate,
      testIdentifier: signatureRecord.test_identifier || stepName,
      flakinessScore: currentFlakinessScore,
      totalOccurrences: signatureRecord.total_occurrences,
      sameShaRetryPasses: signatureRecord.same_sha_retry_passes,
      uniquePrsAffected: signatureRecord.unique_prs_affected,
      isCached,
      cachedRootCause: signatureRecord.cached_root_cause,
      cachedNextCheck: signatureRecord.cached_next_check,
    };

    return { intelligence, signatureRecord };
  }

  /**
   * Processes pass-on-retry confirmation for a successful commit SHA.
   */
  async recordRetryPasses(affectedSignatureIds: string[], cleanedSnippet: string): Promise<number> {
    for (const sigId of affectedSignatureIds) {
      const updatedSig = await this.failureSigRepo.incrementRetryPass(sigId);
      const recalculatedFlakiness = calculateFlakinessScore({
        sameShaRetryPasses: updatedSig.same_sha_retry_passes,
        uniquePrsAffected: updatedSig.unique_prs_affected,
        totalOccurrences: updatedSig.total_occurrences,
        mainBranchOccurrences: updatedSig.main_branch_occurrences,
        cleanedSnippet,
      });

      await this.failureSigRepo.updateFlakinessAndCache({
        signatureId: sigId,
        flakinessScore: recalculatedFlakiness,
      });
    }
    return affectedSignatureIds.length;
  }
}

