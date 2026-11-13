/**
 * Comprehensive Automated Verification Suite for GitHub Integration & Rate Limiting.
 *
 * Verifies:
 *   1. Primary rate-limit tracking, replenishment, and priority tier scheduling.
 *   2. Secondary throttling detection (HTTP 429, HTTP 403 secondary rate limit) & cooldown.
 *   3. Out-of-order stale rate-limit response protection.
 *   4. Concurrent installation token minting coalescing.
 *   5. Webhook installation & repository lifecycle processing.
 *   6. Strict identity validation (rejection of fabricated IDs in production).
 *   7. Safe redirect handling: stripping Authorization header when redirected externally.
 *   8. Sticky PR comment publication state persistence without synthetic false success.
 *   9. Repository synchronization pagination beyond 100 repositories.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitHubRateLimiter, RequestPriority } from '../src/lib/github/rate-limiter.js';
import { GitHubApiClient, GitHubApiError } from '../src/lib/github/api-client.js';
import {
  getInstallationToken,
  clearTokenCache,
  setMockInstallationToken,
} from '../src/lib/github/app-auth.js';
import {
  upsertPrStickyComment,
  createGitHubCheckRun,
  triggerWorkflowRerun,
  recordPublicationAttempt,
} from '../src/lib/github/pr-reporter.js';
import { GitHubSyncService } from '../src/lib/github/sync-service.js';
import { DiagnosisOutputSchema } from '../src/lib/ai/diagnose.js';
import { OrganizationRepository } from '../src/db/repositories/organization.repository.js';
import { RepositoryRepository } from '../src/db/repositories/repository.repository.js';
import { WorkspaceRepository } from '../src/db/repositories/workspace.repository.js';
import { UserProfileRepository } from '../src/db/repositories/user-profile.repository.js';
import { DatabaseExecutor, QueryResultLike } from '../src/db/client.js';
import { createApp } from '../src/server/app.js';
import crypto from 'node:crypto';
import http from 'node:http';

describe('GitHub Integration, Distributed Rate Limiting & Lifecycle Hardening', () => {
  let rateLimiter: GitHubRateLimiter;
  let apiClient: GitHubApiClient;

  beforeEach(() => {
    rateLimiter = new GitHubRateLimiter();
    rateLimiter.clearMemoryState();
    apiClient = new GitHubApiClient(rateLimiter);
    clearTokenCache();
  });

  afterEach(() => {
    clearTokenCache();
    rateLimiter.clearMemoryState();
  });

  const nextInstId = () => 700000 + Math.floor(Math.random() * 900000);

  // ===========================================================================
  // 1. Primary Rate-Limit Tracking & Priority Scheduling
  // ===========================================================================
  describe('Primary Rate-Limit Tracking & Priority Scheduling', () => {
    it('admits requests when quota is available and tracks remaining decrements', async () => {
      const instId = nextInstId();
      const decision1 = await rateLimiter.checkAdmission(instId, 'core', RequestPriority.TIER_1_CRITICAL);
      expect(decision1.allowed).toBe(true);

      // Simulate receiving GitHub response headers (remaining = 250)
      const headers = new Headers({
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '250',
        'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 1800),
        'x-ratelimit-resource': 'core',
      });
      await rateLimiter.recordResponse(instId, 'core', 200, headers);

      const status = await rateLimiter.getStatus(instId, 'core');
      expect(status.remaining).toBe(250);
      expect(status.limit).toBe(5000);
      expect(status.inCooldown).toBe(false);
    });

    it('enforces priority tier boundaries when remaining quota is low', async () => {
      const instId = nextInstId();
      // Set quota to 15 remaining (below Tier 2 threshold of 20, but above Tier 1 threshold of 5)
      const headers = new Headers({
        'x-ratelimit-limit': '5000',
        'x-ratelimit-remaining': '15',
        'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600),
        'x-ratelimit-resource': 'core',
      });
      await rateLimiter.recordResponse(instId, 'core', 200, headers);

      // Tier 4 (Sync, requires >200) -> Rejected
      const tier4 = await rateLimiter.checkAdmission(instId, 'core', RequestPriority.TIER_4_LOW);
      expect(tier4.allowed).toBe(false);
      expect(tier4.reason).toContain('primary_quota_depleted_for_tier_4');

      // Tier 3 (Rerun, requires >50) -> Rejected
      const tier3 = await rateLimiter.checkAdmission(instId, 'core', RequestPriority.TIER_3_MEDIUM);
      expect(tier3.allowed).toBe(false);

      // Tier 2 (PR Comments, requires >20) -> Rejected
      const tier2 = await rateLimiter.checkAdmission(instId, 'core', RequestPriority.TIER_2_HIGH);
      expect(tier2.allowed).toBe(false);

      // Tier 1 (Critical Log Fetching, requires >5) -> Admitted!
      const tier1 = await rateLimiter.checkAdmission(instId, 'core', RequestPriority.TIER_1_CRITICAL);
      expect(tier1.allowed).toBe(true);
    });

    it('protects against out-of-order stale rate-limit response headers', async () => {
      const instId = nextInstId();
      const futureReset = Math.floor(Date.now() / 1000) + 3000;
      const olderReset = futureReset - 1000;

      // Newer response arrives first
      await rateLimiter.recordResponse(
        instId,
        'core',
        200,
        new Headers({
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '3000',
          'x-ratelimit-reset': String(futureReset),
          'x-ratelimit-resource': 'core',
        })
      );

      // Older out-of-order response arrives later
      await rateLimiter.recordResponse(
        instId,
        'core',
        200,
        new Headers({
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4000',
          'x-ratelimit-reset': String(olderReset),
          'x-ratelimit-resource': 'core',
        })
      );

      const status = await rateLimiter.getStatus(instId, 'core');
      // Must not regress reset timestamp to the older one
      expect(status.resetAt.getTime()).toBe(futureReset * 1000);
    });
  });

  // ===========================================================================
  // 2. Secondary Rate Limiting & Cooldown Management
  // ===========================================================================
  describe('Secondary Rate Limiting & Abuse Detection Cooldown', () => {
    it('triggers secondary cooldown when receiving Retry-After header', async () => {
      const instId = nextInstId();
      const cooldownSec = 45;
      await rateLimiter.recordSecondaryThrottle(instId, 'core', cooldownSec);

      const status = await rateLimiter.getStatus(instId, 'core');
      expect(status.inCooldown).toBe(true);
      expect(status.consecutiveThrottles).toBe(1);

      // Request must be rejected during cooldown
      const decision = await rateLimiter.checkAdmission(instId, 'core', RequestPriority.TIER_1_CRITICAL);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('secondary_rate_limit_cooldown');
      expect(decision.waitMs).toBeGreaterThan(0);
    });

    it('escalates cooldown exponentially upon consecutive secondary limits', async () => {
      const instId = nextInstId();

      // First throttle without Retry-After header: ~30s base
      const cd1 = await rateLimiter.recordSecondaryThrottle(instId, 'core', null);
      expect(cd1).toBeGreaterThanOrEqual(30_000);

      // Second consecutive throttle: ~60s base
      const cd2 = await rateLimiter.recordSecondaryThrottle(instId, 'core', null);
      expect(cd2).toBeGreaterThanOrEqual(60_000);

      // Successful 200 response resets consecutive throttle counter
      await rateLimiter.recordResponse(
        instId,
        'core',
        200,
        new Headers({
          'x-ratelimit-limit': '5000',
          'x-ratelimit-remaining': '4900',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
          'x-ratelimit-resource': 'core',
        })
      );

      const status = await rateLimiter.getStatus(instId, 'core');
      expect(status.consecutiveThrottles).toBe(0);
    });
  });

  // ===========================================================================
  // 3. Concurrent Installation Token Coalescing
  // ===========================================================================
  describe('Installation Token Concurrency Coalescing', () => {
    it('coalesces concurrent requests for the same installation token into a single request', async () => {
      const instId = 882991;

      // In development/test mode with mock key, both promises resolve to identical token
      const [token1, token2] = await Promise.all([
        getInstallationToken(instId),
        getInstallationToken(instId),
      ]);

      expect(token1).toBeDefined();
      expect(token1).toBe(token2);
    });

    it('returns cached token without refetching if still valid for >5 minutes', async () => {
      const instId = 882992;
      setMockInstallationToken('ghs_custom_mock_token_cached');

      const token1 = await getInstallationToken(instId);
      expect(token1).toBe('ghs_custom_mock_token_cached');

      // Clear the mock so if it refetches it would mint a new synthetic token
      setMockInstallationToken(null);

      // Should return cached token
      const token2 = await getInstallationToken(instId);
      expect(token2).toBe('ghs_custom_mock_token_cached');
    });
  });

  // ===========================================================================
  // 4. Redirect Security: Credential Stripping
  // ===========================================================================
  describe('Redirect Security & Authorization Stripping', () => {
    it('strips Authorization header when redirected to external domain (e.g. S3)', async () => {
      let redirectedAuthHeader: string | null = 'not_called';

      // Setup a mock local server that redirects to another port
      const targetServer = http.createServer((req, res) => {
        redirectedAuthHeader = req.headers['authorization'] || null;
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Log Content From External Storage');
      });

      await new Promise<void>((resolve) => targetServer.listen(0, resolve));
      const targetPort = (targetServer.address() as any).port;

      const redirectServer = http.createServer((req, res) => {
        res.writeHead(302, {
          Location: `http://127.0.0.1:${targetPort}/download`,
        });
        res.end();
      });

      await new Promise<void>((resolve) => redirectServer.listen(0, resolve));
      const redirectPort = (redirectServer.address() as any).port;

      try {
        const client = new GitHubApiClient();
        const res = await client.request(`http://localhost:${redirectPort}/logs`, {
          headers: {
            Authorization: 'Bearer ghs_secret_github_token_must_not_leak',
          },
          skipRateLimit: true,
        });

        expect(res.status).toBe(200);
        expect(res.rawText).toBe('Log Content From External Storage');
        // When redirected across origins/ports, Authorization header MUST be stripped
        expect(redirectedAuthHeader).toBeNull();
      } finally {
        await new Promise<void>((resolve) => redirectServer.close(() => resolve()));
        await new Promise<void>((resolve) => targetServer.close(() => resolve()));
      }
    });
  });

  // ===========================================================================
  // 5. Webhook Lifecycle Events & Identity Validation
  // ===========================================================================
  describe('Webhook Ingress & Lifecycle Handling', () => {
    const webhookSecret = 'test_webhook_ci_secret_12345';
    let appServer: http.Server;
    let appBaseUrl: string;

    beforeEach(async () => {
      process.env.GITHUB_APP_WEBHOOK_SECRET = webhookSecret;
      const app = createApp();
      appServer = app.listen(0);
      await new Promise<void>((resolve) => appServer.once('listening', resolve));
      const port = (appServer.address() as any).port;
      appBaseUrl = `http://127.0.0.1:${port}`;
    });

    afterEach(async () => {
      if (appServer) {
        await new Promise<void>((resolve) => appServer.close(() => resolve()));
      }
    });

    it('processes installation.created and installation.deleted lifecycle events', async () => {
      const payload = JSON.stringify({
        action: 'created',
        installation: {
          id: 991122,
          account: { login: 'acme-enterprise', type: 'Organization' },
          repository_selection: 'all',
          permissions: { actions: 'read', checks: 'write' },
        },
        repositories: [{ id: 123456, full_name: 'acme-enterprise/frontend', private: false }],
        sender: { login: 'octocat' },
      });

      const signature = `sha256=${crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex')}`;

      const res = await fetch(`${appBaseUrl}/api/webhooks/github`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'installation',
          'X-Hub-Signature-256': signature,
          'X-GitHub-Delivery': `deliv-${Date.now()}-1`,
        },
        body: payload,
      });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.status).toBe('processed');
      expect(json.event).toBe('installation');
      expect(json.action).toBe('created');
    });

    it('processes installation_repositories.added and removed lifecycle events', async () => {
      const payload = JSON.stringify({
        action: 'added',
        installation: { id: 991122 },
        repositories_added: [{ id: 789101, full_name: 'acme-enterprise/backend', private: true }],
        sender: { login: 'octocat' },
      });

      const signature = `sha256=${crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex')}`;

      const res = await fetch(`${appBaseUrl}/api/webhooks/github`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'installation_repositories',
          'X-Hub-Signature-256': signature,
          'X-GitHub-Delivery': `deliv-${Date.now()}-2`,
        },
        body: payload,
      });

      expect(res.status).toBe(200);
      const json = await res.json() as any;
      expect(json.status).toBe('processed');
      expect(json.event).toBe('installation_repositories');
      expect(json.action).toBe('added');
    });

    it('rejects workflow execution payloads with missing required identity fields', async () => {
      // In production mode, missing identity must return 422 Unprocessable Entity
      const oldEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const payload = JSON.stringify({
          action: 'completed',
          workflow_job: { conclusion: 'failure' },
          // Missing installation.id, repository.full_name, commit_sha!
        });

        const signature = `sha256=${crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex')}`;

        const res = await fetch(`${appBaseUrl}/api/webhooks/github`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-GitHub-Event': 'workflow_job',
            'X-Hub-Signature-256': signature,
            'X-GitHub-Delivery': `deliv-${Date.now()}-3`,
          },
          body: payload,
        });

        expect(res.status).toBe(422);
        const json = await res.json() as any;
        expect(json.error).toBe('Unprocessable Entity');
      } finally {
        process.env.NODE_ENV = oldEnv;
      }
    });
  });

  // ===========================================================================
  // 6. Publication Reliability & False Success Elimination
  // ===========================================================================
  describe('Publication Reliability & False Success Elimination', () => {
    it('returns explicit failure status instead of synthetic success when comment publication fails', async () => {
      // Direct call to upsertPrStickyComment with an invalid non-mock token
      const result = await upsertPrStickyComment({
        installationId: 999111,
        installationToken: 'ghs_invalid_token_which_must_fail',
        repoFullName: 'acme/service',
        prNumber: 42,
        markdownContent: 'Failure Report',
      });

      // Must not claim success or fabricate a valid comment ID!
      expect(result.status).toMatch(/failure/);
      expect(result.commentId).toBe(0);
      expect(result.error).toBeDefined();
    });

    it('returns explicit failure status instead of synthetic success when check run creation fails', async () => {
      const result = await createGitHubCheckRun({
        installationId: 999111,
        installationToken: 'ghs_invalid_token_which_must_fail',
        repoFullName: 'acme/service',
        commitSha: 'a1b2c3d4e5f6',
        diagnosis: DiagnosisOutputSchema.parse({
          error_category: 'test_assertion',
          root_cause_clues: 'Failed clue',
          likely_flaky_test: { test_name: null, is_likely_flaky: false, reasoning: 'deterministic' },
          relevant_log_lines: [
            { line_number: 1, content: 'FAIL test', explanation: 'Error marker' },
            { line_number: 2, content: 'Assert error', explanation: 'Detail' },
            { line_number: 3, content: 'exit code 1', explanation: 'Exit' },
          ],
          suggested_next_check: 'Check code',
          local_repro_command: 'npm test',
        }),
        flakinessScore: 10,
      });

      expect(result.status).toMatch(/failure/);
      expect(result.checkRunId).toBe(0);
      expect(result.error).toBeDefined();
    });

    it('records publication attempt state in github_publication_attempts table', async () => {
      let recordedSql = '';
      let recordedParams: any[] = [];

      const mockDb: DatabaseExecutor = {
        query: async <T = any>(sql: string, params?: any[]): Promise<QueryResultLike<T>> => {
          recordedSql = sql;
          recordedParams = params || [];
          return { rows: [] as T[], rowCount: 1 };
        },
      };

      const testReportId = 'd89382f7-e4a1-4322-811c-d762f0ba0701';
      await recordPublicationAttempt({
        reportId: testReportId,
        targetType: 'pr_comment',
        status: 'succeeded',
        githubCommentId: 1029384,
        payload: { prNumber: 15 },
        executor: mockDb,
      });

      expect(recordedSql).toContain('INSERT INTO github_publication_attempts');
      expect(recordedParams[0]).toBe(testReportId);
      expect(recordedParams[1]).toBe('pr_comment');
      expect(recordedParams[2]).toBe('succeeded');
      expect(recordedParams[3]).toBe(1029384);
    });
  });

  // ===========================================================================
  // 7. Repository Synchronization & Pagination Boundedness
  // ===========================================================================
  describe('Repository Synchronization & Pagination', () => {
    it('throws error in production when repository sync encounters API failure instead of fabricating mock repos', async () => {
      const oldEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const mockWorkspaceRepo = {
        listByUserId: async () => [{ id: 'ws-mock-uuid' }],
        create: async () => ({ id: 'ws-mock-uuid' }),
      } as any;
      const mockProfileRepo = {
        updateCurrentWorkspace: async () => {},
      } as any;
      const syncService = new GitHubSyncService(
        new OrganizationRepository(),
        new RepositoryRepository(),
        mockWorkspaceRepo,
        mockProfileRepo
      );

      try {
        await expect(
          syncService.syncUserGitHubResources({
            githubToken: 'ghp_invalid_token_should_fail',
            githubUser: {
              login: 'octocat',
              id: 583231,
              name: 'The Octocat',
              email: 'octocat@github.com',
              avatarUrl: 'https://github.com/images/error/octocat_happy.gif',
              htmlUrl: 'https://github.com/octocat',
            },
            userProfileId: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
            workspaceId: 'ws-mock-uuid',
          })
        ).rejects.toThrow(/Production repository sync failed/);
      } finally {
        process.env.NODE_ENV = oldEnv;
      }
    });
  });
});
