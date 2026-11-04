import { describe, it, expect, afterEach } from 'vitest';
import { DelayedError } from 'bullmq';
import { processWorkflowJob } from '../src/workers/processors/workflow-job.processor.js';
import { setCustomRedis } from '../src/queue/redis.js';
import { WorkflowJobEventData } from '../src/queue/types.js';
import { Organization, Repository, FailureSignature, WorkflowFailure, DiagnosticReport } from '../src/db/types.js';

describe('WorkflowJobProcessor (BullMQ Worker)', () => {
  afterEach(() => {
    setCustomRedis(null);
  });
  const baseEvent: WorkflowJobEventData = {
    installationId: 20202,
    orgLogin: 'hopper-labs',
    accountType: 'Organization',
    repoFullName: 'hopper-labs/payments-api',
    githubRepoId: 54321,
    workflowName: 'CI Pipeline',
    jobName: 'test / unit-tests',
    stepName: 'Run pnpm test',
    githubRunId: 9876543,
    githubJobId: 11223344,
    githubRunAttempt: 1,
    commitSha: 'c0ffee0000000000000000000000000000000000',
    branch: 'feature/auth-refresh',
    conclusion: 'failure',
    rawLog: `
FAIL src/auth/jwt.spec.ts
  ● JWT Authenticator > should reject expired token
    AssertionError: expected 'active' to deeply equal 'expired'
      at src/auth/jwt.spec.ts:42:15
Process completed with exit code 1.
    `,
    modifiedFiles: ['src/auth/jwt.ts', 'src/auth/jwt.spec.ts'],
  };

  it('processes failure event through full pipeline: slicing, fingerprinting, and DB persistence', async () => {
    const mockOrg: Organization = {
      id: 'org-1',
      github_installation_id: 20202,
      github_account_login: 'hopper-labs',
      github_account_type: 'Organization',
      plan: 'pro_dev',
      stripe_customer_id: null,
      stripe_subscription_id: null,
      monthly_run_limit: 250,
      runs_used_this_period: 10,
      billing_period_reset_at: new Date(),
      slack_webhook_url: null,
      auto_retry_policy: false,
      discord_webhook_url: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const mockRepo: Repository = {
      id: 'repo-1',
      org_id: 'org-1',
      github_repo_id: 54321,
      full_name: 'hopper-labs/payments-api',
      default_branch: 'main',
      is_active: true,
      created_at: new Date(),
    };

    const mockSig: FailureSignature = {
      id: 'sig-1',
      repo_id: 'repo-1',
      signature_hash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      normalized_template: 'job:test|step:run|trace:AssertionError',
      test_identifier: 'JWT Authenticator > should reject expired token',
      error_category: 'test_assertion',
      embedding: null,
      total_occurrences: 1,
      main_branch_occurrences: 0,
      unique_prs_affected: 1,
      same_sha_retry_passes: 0,
      flakiness_score: 2.0,
      cached_root_cause: null,
      cached_next_check: null,
      first_seen_at: new Date(),
      last_seen_at: new Date(),
    };

    let runsIncremented = false;
    let failureCreated = false;
    let reportCreated = false;

    const mockDeps = {
      orgRepo: {
        upsert: async () => mockOrg,
        incrementRunsUsed: async () => {
          runsIncremented = true;
          return { ...mockOrg, runs_used_this_period: 11 };
        },
      } as any,
      repoRepo: {
        upsert: async () => mockRepo,
      } as any,
      failureSigRepo: {
        findByHash: async () => null, // First time seen
        upsert: async () => mockSig,
        updateFlakinessAndCache: async () => mockSig,
      } as any,
      workflowFailureRepo: {
        create: async (data: any) => {
          failureCreated = true;
          expect(data.githubJobId).toBe(11223344);
          return { id: 'fail-1', ...data } as WorkflowFailure;
        },
      } as any,
      diagnosticReportRepo: {
        create: async (data: any) => {
          reportCreated = true;
          expect(data.failureId).toBe('fail-1');
          expect(data.rootCauseClues).toBeDefined();
          return { id: 'rep-1', ...data } as DiagnosticReport;
        },
      } as any,
    };

    const result = await processWorkflowJob(baseEvent, mockDeps);

    expect(result.status).toBe('diagnosed');
    expect(result.signatureHash).toBeDefined();
    expect(result.flakinessScore).toBeDefined();
    expect(result.prComment).toContain('<!-- ci-failure-diagnosis-sticky-marker -->');
    expect(result.prComment).toContain('JWT Authenticator');
    expect(runsIncremented).toBe(true);
    expect(failureCreated).toBe(true);
    expect(reportCreated).toBe(true);
  });

  it('tracks retry pass when conclusion is success on previously failed commit SHA', async () => {
    const successEvent: WorkflowJobEventData = {
      ...baseEvent,
      conclusion: 'success',
      githubRunAttempt: 2,
    };

    let retryPassIncremented = false;
    let updatedScore = 0;

    const mockDeps = {
      orgRepo: {
        upsert: async () => ({ id: 'org-1', plan: 'free' }),
      } as any,
      repoRepo: {
        upsert: async () => ({ id: 'repo-1' }),
      } as any,
      workflowFailureRepo: {
        findByCommitSha: async () => [
          {
            id: 'fail-1',
            signature_id: 'sig-abc-123',
            commit_sha: successEvent.commitSha,
          } as WorkflowFailure,
        ],
      } as any,
      failureSigRepo: {
        incrementRetryPass: async (id: string) => {
          expect(id).toBe('sig-abc-123');
          retryPassIncremented = true;
          return {
            id: 'sig-abc-123',
            same_sha_retry_passes: 1,
            unique_prs_affected: 1,
            total_occurrences: 2,
            main_branch_occurrences: 0,
            normalized_template: 'job:test|step:run|trace:error',
          } as FailureSignature;
        },
        updateFlakinessAndCache: async (params: any) => {
          updatedScore = params.flakinessScore;
          return {} as FailureSignature;
        },
      } as any,
    };

    const result = await processWorkflowJob(successEvent, mockDeps);

    expect(result.status).toBe('flakiness_updated');
    expect(retryPassIncremented).toBe(true);
    // 1 same-SHA retry pass should boost flakiness score by 55 points!
    expect(updatedScore).toBeGreaterThanOrEqual(55);
  });

  it('blocks diagnostic execution when organization monthly quota is exceeded', async () => {
    const mockOrgExhausted: Organization = {
      id: 'org-exhausted',
      github_installation_id: 30303,
      github_account_login: 'budget-startup',
      github_account_type: 'Organization',
      plan: 'free',
      stripe_customer_id: null,
      stripe_subscription_id: null,
      monthly_run_limit: 30,
      runs_used_this_period: 30, // Limit reached
      billing_period_reset_at: new Date(),
      slack_webhook_url: null,
      auto_retry_policy: false,
      discord_webhook_url: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const mockDeps = {
      orgRepo: {
        upsert: async () => mockOrgExhausted,
      } as any,
      repoRepo: {
        upsert: async () => ({ id: 'repo-1' }),
      } as any,
    };

    const result = await processWorkflowJob(baseEvent, mockDeps);
    expect(result.status).toBe('quota_exceeded');
    expect(result.reason?.toLowerCase()).toContain('monthly free quota');
  });

  it('reuses cached diagnosis on repeat failure when no modified files overlap stack trace', async () => {
    const mockSigWithCache: FailureSignature = {
      id: 'sig-cached',
      repo_id: 'repo-1',
      signature_hash: 'c'.repeat(64),
      normalized_template: 'job:test|step:run|trace:timeout',
      test_identifier: 'Checkout Flow > 3D Secure verification',
      error_category: 'timeout',
      embedding: null,
      total_occurrences: 5,
      main_branch_occurrences: 0,
      unique_prs_affected: 2,
      same_sha_retry_passes: 1,
      flakiness_score: 75.0,
      cached_root_cause: 'Network gateway handshake timed out after 30000ms',
      cached_next_check: 'Check test sandbox wiremock latency settings',
      first_seen_at: new Date(),
      last_seen_at: new Date(),
    };

    const eventWithNoFileOverlap: WorkflowJobEventData = {
      ...baseEvent,
      rawLog: 'Timeout of 30000ms exceeded\nProcess completed with exit code 1.',
      modifiedFiles: ['docs/README.md'], // Unrelated to stack trace
    };

    let reportRootCause = '';
    const mockDeps = {
      orgRepo: {
        upsert: async () => ({ id: 'org-1', plan: 'pro_dev', runs_used_this_period: 5 }),
        incrementRunsUsed: async () => ({}),
      } as any,
      repoRepo: {
        upsert: async () => ({ id: 'repo-1' }),
      } as any,
      failureSigRepo: {
        findByHash: async () => mockSigWithCache,
        incrementOccurrence: async () => mockSigWithCache,
        updateFlakinessAndCache: async () => mockSigWithCache,
      } as any,
      workflowFailureRepo: {
        create: async () => ({ id: 'fail-cached' } as WorkflowFailure),
      } as any,
      diagnosticReportRepo: {
        create: async (data: any) => {
          reportRootCause = data.rootCauseClues;
          return { id: 'rep-cached', ...data } as DiagnosticReport;
        },
      } as any,
    };

    const result = await processWorkflowJob(eventWithNoFileOverlap, mockDeps);
    expect(result.status).toBe('diagnosed');
    expect(reportRootCause).toContain('[CACHED]');
    expect(reportRootCause).toContain('Network gateway handshake timed out');
  });

  it('delays a matrix job while another worker diagnoses the same fingerprint', async () => {
    setCustomRedis({
      set: async () => null,
    });

    let delayedUntil = 0;
    const fakeJob = {
      token: 'worker-token',
      moveToDelayed: async (timestamp: number) => {
        delayedUntil = timestamp;
      },
    } as any;

    const mockDeps = {
      orgRepo: {
        upsert: async () => ({ id: 'org-1', plan: 'pro_dev', runs_used_this_period: 0 }),
        incrementRunsUsed: async () => ({}),
      } as any,
      repoRepo: {
        upsert: async () => ({ id: 'repo-1', default_branch: 'main' }),
      } as any,
    };

    const run = processWorkflowJob(baseEvent, mockDeps, fakeJob);

    await expect(run).rejects.toBeInstanceOf(DelayedError);
    expect(delayedUntil).toBeGreaterThan(Date.now());
  });
});
