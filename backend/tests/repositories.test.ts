import { describe, it, expect } from 'vitest';
import { DatabaseExecutor, QueryResultLike } from '../src/db/client.js';
import { OrganizationRepository } from '../src/db/repositories/organization.repository.js';
import { RepositoryRepository } from '../src/db/repositories/repository.repository.js';
import { FailureSignatureRepository } from '../src/db/repositories/failure-signature.repository.js';
import { WorkflowFailureRepository } from '../src/db/repositories/workflow-failure.repository.js';
import { DiagnosticReportRepository } from '../src/db/repositories/diagnostic-report.repository.js';

// Helper to create a spy executor that records queries and returns configured rows
function createSpyExecutor(defaultRows: any[] = []): {
  executor: DatabaseExecutor;
  getLastQuery: () => { sql: string; params: any[] };
  setRows: (rows: any[]) => void;
} {
  let lastSql = '';
  let lastParams: any[] = [];
  let currentRows = defaultRows;

  const executor: DatabaseExecutor = {
    query: async <T = any>(sql: string, params: any[] = []): Promise<QueryResultLike<T>> => {
      lastSql = sql;
      lastParams = params;
      return {
        rows: currentRows as T[],
        rowCount: currentRows.length,
      };
    },
  };

  return {
    executor,
    getLastQuery: () => ({ sql: lastSql, params: lastParams }),
    setRows: (rows: any[]) => {
      currentRows = rows;
    },
  };
}

describe('OrganizationRepository', () => {
  it('upserts organization and assigns appropriate plan tier limit', async () => {
    const mockOrg = {
      id: 'org-uuid-1',
      github_installation_id: 12345,
      github_account_login: 'acme-corp',
      github_account_type: 'Organization',
      plan: 'pro_dev',
      monthly_run_limit: 250,
      runs_used_this_period: 0,
    };

    const spy = createSpyExecutor([mockOrg]);
    const repo = new OrganizationRepository(spy.executor);

    const result = await repo.upsert({
      githubInstallationId: 12345,
      githubAccountLogin: 'acme-corp',
      githubAccountType: 'Organization',
      plan: 'pro_dev',
    });

    const { sql, params } = spy.getLastQuery();
    expect(sql).toContain('INSERT INTO organizations');
    expect(sql).toContain('ON CONFLICT (github_installation_id)');
    expect(params[0]).toBe(12345);
    expect(params[1]).toBe('acme-corp');
    expect(params[3]).toBe('pro_dev');
    expect(params[4]).toBe(250); // Pro limit default
    expect(result.id).toBe('org-uuid-1');
  });

  it('increments runs used counter', async () => {
    const updatedOrg = {
      id: 'org-uuid-1',
      runs_used_this_period: 15,
    };
    const spy = createSpyExecutor([updatedOrg]);
    const repo = new OrganizationRepository(spy.executor);

    const result = await repo.incrementRunsUsed('org-uuid-1');
    const { sql, params } = spy.getLastQuery();
    expect(sql).toContain('runs_used_this_period = runs_used_this_period + 1');
    expect(params[0]).toBe('org-uuid-1');
    expect(result.runs_used_this_period).toBe(15);
  });

  it('updates plan and limits on Stripe billing upgrade', async () => {
    const upgradedOrg = {
      id: 'org-uuid-1',
      plan: 'team',
      monthly_run_limit: 1000,
      stripe_customer_id: 'cus_123',
      stripe_subscription_id: 'sub_456',
    };
    const spy = createSpyExecutor([upgradedOrg]);
    const repo = new OrganizationRepository(spy.executor);

    const result = await repo.updatePlan('org-uuid-1', 'team', 1000, 'cus_123', 'sub_456');
    const { sql, params } = spy.getLastQuery();
    expect(sql).toContain('UPDATE organizations');
    expect(params[0]).toBe('org-uuid-1');
    expect(params[1]).toBe('team');
    expect(params[2]).toBe(1000);
    expect(params[3]).toBe('cus_123');
    expect(result.plan).toBe('team');
  });
});

describe('RepositoryRepository', () => {
  it('upserts repository and maps to organization', async () => {
    const mockRepo = {
      id: 'repo-uuid-1',
      org_id: 'org-uuid-1',
      github_repo_id: 998877,
      full_name: 'acme-corp/api-gateway',
      default_branch: 'main',
      is_active: true,
    };

    const spy = createSpyExecutor([mockRepo]);
    const repo = new RepositoryRepository(spy.executor);

    const res = await repo.upsert({
      orgId: 'org-uuid-1',
      githubRepoId: 998877,
      fullName: 'acme-corp/api-gateway',
      defaultBranch: 'main',
    });

    const { sql, params } = spy.getLastQuery();
    expect(sql).toContain('INSERT INTO repositories');
    expect(params[0]).toBe('org-uuid-1');
    expect(params[1]).toBe(998877);
    expect(params[2]).toBe('acme-corp/api-gateway');
    expect(res.full_name).toBe('acme-corp/api-gateway');
  });
});

describe('FailureSignatureRepository (The Cloud Moat)', () => {
  it('upserts failure signature with pgvector embedding string and flakiness score', async () => {
    const mockSig = {
      id: 'sig-uuid-1',
      repo_id: 'repo-uuid-1',
      signature_hash: 'a'.repeat(64),
      normalized_template: 'job:test|step:run|trace:AssertionError',
      flakiness_score: 85.5,
      total_occurrences: 1,
    };

    const spy = createSpyExecutor([mockSig]);
    const repo = new FailureSignatureRepository(spy.executor);

    const res = await repo.upsert({
      repoId: 'repo-uuid-1',
      signatureHash: 'a'.repeat(64),
      normalizedTemplate: 'job:test|step:run|trace:AssertionError',
      errorCategory: 'test_assertion',
      embedding: [0.123, -0.456, 0.789],
      flakinessScore: 85.5,
      cachedRootCause: 'Race condition on cache invalidation',
    });

    const { sql, params } = spy.getLastQuery();
    expect(sql).toContain('INSERT INTO failure_signatures');
    expect(sql).toContain('ON CONFLICT (repo_id, signature_hash)');
    expect(params[0]).toBe('repo-uuid-1');
    expect(params[1]).toBe('a'.repeat(64));
    expect(params[5]).toBe('[0.123,-0.456,0.789]'); // pgvector literal format
    expect(params[6]).toBe(85.5);
    expect(res.id).toBe('sig-uuid-1');
  });

  it('increments same_sha_retry_passes when a re-run succeeds', async () => {
    const updatedSig = {
      id: 'sig-uuid-1',
      same_sha_retry_passes: 3,
    };
    const spy = createSpyExecutor([updatedSig]);
    const repo = new FailureSignatureRepository(spy.executor);

    const res = await repo.incrementRetryPass('sig-uuid-1');
    const { sql, params } = spy.getLastQuery();
    expect(sql).toContain('same_sha_retry_passes = same_sha_retry_passes + 1');
    expect(params[0]).toBe('sig-uuid-1');
    expect(res.same_sha_retry_passes).toBe(3);
  });

  it('queries semantically similar failure signatures using cosine distance', async () => {
    const spy = createSpyExecutor([
      {
        id: 'sig-uuid-2',
        signature_hash: 'b'.repeat(64),
        similarity: 0.94,
      },
    ]);
    const repo = new FailureSignatureRepository(spy.executor);

    const results = await repo.findSimilarByEmbedding(
      'repo-uuid-1',
      [0.1, 0.2, 0.3],
      0.9,
      5
    );

    const { sql, params } = spy.getLastQuery();
    expect(sql).toContain('1 - (embedding <=> $2::vector) AS similarity');
    expect(params[0]).toBe('repo-uuid-1');
    expect(params[1]).toBe('[0.1,0.2,0.3]');
    expect(params[2]).toBe(0.9);
    expect(params[3]).toBe(5);
    expect(results[0].similarity).toBe(0.94);
  });

  it('queries top flaky signatures ordered by flakiness score', async () => {
    const spy = createSpyExecutor([
      { id: 'sig-1', flakiness_score: 95.0 },
      { id: 'sig-2', flakiness_score: 72.0 },
    ]);
    const repo = new FailureSignatureRepository(spy.executor);

    const top = await repo.findTopFlaky('repo-uuid-1', 10);
    const { sql, params } = spy.getLastQuery();
    expect(sql).toContain('ORDER BY flakiness_score DESC');
    expect(params[0]).toBe('repo-uuid-1');
    expect(params[1]).toBe(10);
    expect(top.length).toBe(2);
  });
});

describe('WorkflowFailureRepository', () => {
  it('creates workflow failure record with sanitized log snippet and exit code', async () => {
    const mockFailure = {
      id: 'failure-uuid-1',
      github_job_id: 11223344,
      sanitized_log_snippet: '[L1] FAIL src/test.spec.ts',
      exit_code: 1,
    };
    const spy = createSpyExecutor([mockFailure]);
    const repo = new WorkflowFailureRepository(spy.executor);

    const res = await repo.create({
      repoId: 'repo-uuid-1',
      signatureId: 'sig-uuid-1',
      githubRunId: 556677,
      githubJobId: 11223344,
      workflowName: 'CI',
      jobName: 'test',
      commitSha: 'c0ffee'.repeat(6) + 'c0ffee',
      branch: 'feature/payment',
      sanitizedLogSnippet: '[L1] FAIL src/test.spec.ts',
      exitCode: 1,
    });

    const { sql, params } = spy.getLastQuery();
    expect(sql).toContain('INSERT INTO workflow_failures');
    expect(params[0]).toBe('repo-uuid-1');
    expect(params[3]).toBe(11223344);
    expect(params[14]).toBe('[L1] FAIL src/test.spec.ts');
    expect(res.id).toBe('failure-uuid-1');
  });
});

describe('DiagnosticReportRepository', () => {
  it('creates diagnostic report with serialized log lines and commit file list', async () => {
    const mockReport = {
      id: 'report-uuid-1',
      failure_id: 'failure-uuid-1',
      root_cause_clues: 'Timeout waiting for mock API response',
      likely_flaky_test: 'tests/mock.spec.ts',
      flaky_confidence: 88.0,
      github_comment_id: null,
    };
    const spy = createSpyExecutor([mockReport]);
    const repo = new DiagnosticReportRepository(spy.executor);

    const res = await repo.create({
      failureId: 'failure-uuid-1',
      rootCauseClues: 'Timeout waiting for mock API response',
      likelyFlakyTest: 'tests/mock.spec.ts',
      flakyConfidence: 88.0,
      relevantLogLines: [{ line_number: 14, content: 'ETIMEDOUT', explanation: 'Network timeout' }],
      suggestedNextCheck: 'Inspect mock server port binding',
      correlatingCommitFiles: ['src/api/client.ts'],
      llmModelUsed: 'claude-3-5-haiku-20241022',
      promptTokens: 450,
      completionTokens: 120,
    });

    const { sql, params } = spy.getLastQuery();
    expect(sql).toContain('INSERT INTO diagnostic_reports');
    expect(params[0]).toBe('failure-uuid-1');
    expect(params[1]).toBe('Timeout waiting for mock API response');
    expect(params[4]).toContain('ETIMEDOUT'); // JSON stringified log lines
    expect(params[7]).toContain('src/api/client.ts'); // JSON stringified modified files
    expect(params[9]).toBe('claude-3-5-haiku-20241022');
    expect(res.id).toBe('report-uuid-1');
  });

  it('updates github comment id for sticky comment editing', async () => {
    const updatedReport = {
      id: 'report-uuid-1',
      github_comment_id: 99887766,
    };
    const spy = createSpyExecutor([updatedReport]);
    const repo = new DiagnosticReportRepository(spy.executor);

    const res = await repo.updateGithubCommentId('report-uuid-1', 99887766);
    const { sql, params } = spy.getLastQuery();
    expect(sql).toContain('UPDATE diagnostic_reports');
    expect(sql).toContain('SET github_comment_id = $2');
    expect(params[0]).toBe('report-uuid-1');
    expect(params[1]).toBe(99887766);
    expect(res.github_comment_id).toBe(99887766);
  });
});
