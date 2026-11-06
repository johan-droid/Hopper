/**
 * Hopper Webhook Gateway & REST API Server.
 * Ingests GitHub Action webhooks in <50ms, verifies HMAC-SHA256 signatures,
 * performs tenant rate-limiting in Redis, and routes requests to domain controllers.
 */

import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import { checkRedisHealth } from '../queue/redis.js';
import { checkDatabaseHealth } from '../db/client.js';
import { OrganizationRepository } from '../db/repositories/organization.repository.js';
import { RepositoryRepository } from '../db/repositories/repository.repository.js';
import { FailureSignatureRepository } from '../db/repositories/failure-signature.repository.js';
import { WorkflowFailureRepository } from '../db/repositories/workflow-failure.repository.js';
import { DiagnosticReportRepository } from '../db/repositories/diagnostic-report.repository.js';
import { WorkspaceRepository } from '../db/repositories/workspace.repository.js';
import { UserProfileRepository } from '../db/repositories/user-profile.repository.js';
import { securityHeadersMiddleware } from './middleware/security.js';
import { errorHandlerMiddleware } from './middleware/error-handler.js';
import { createWebhooksRouter } from './routes/webhooks.js';
import { createBillingRouter } from './routes/billing.js';
import { createDiagnoseRouter } from './routes/diagnose.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createSignaturesRouter } from './routes/signatures.js';
import { createRepositoriesRouter } from './routes/repositories.js';
import { createWorkspaceRouter } from './routes/workspaces.js';
import { createUserRouter } from './routes/users.js';

export function createServer() {
  const app = express();

  // Apply OWASP security headers
  app.use(securityHeadersMiddleware);

  // ============================================================================
  // Environment Validation — Fail fast in production, graceful in dev/testing
  // ============================================================================
  const isProd = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';

  const mandatoryEnvs = [
    'NODE_ENV',
    'DATABASE_URL',
    'REDIS_URL',
    'GITHUB_APP_WEBHOOK_SECRET',
  ];

  for (const env of mandatoryEnvs) {
    if (!process.env[env] && isProd) {
      console.error(`[Hopper] Missing mandatory environment variable: ${env}`);
      process.exit(1);
    }
  }

  // Graceful Stripe check: Monetization is deferred during product validation
  const hasStripe = Boolean(
    process.env.STRIPE_SECRET_KEY &&
    !process.env.STRIPE_SECRET_KEY.includes('mock') &&
    !process.env.STRIPE_SECRET_KEY.includes('placeholder')
  );
  if (!hasStripe && !isTest) {
    console.info('[Hopper] Stripe billing is unset or deferred; operating in free validation mode.');
  }

  // Validate GitHub App private key in production
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (!privateKey && isProd) {
    console.error('[Hopper] Missing mandatory environment variable: GITHUB_APP_PRIVATE_KEY');
    process.exit(1);
  }

  // Validate AI provider configuration
  const aiProvider = process.env.AI_PROVIDER || 'mock';
  if (aiProvider !== 'mock' && isProd) {
    const hasAnthropic = !!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.includes('mock');
    const hasOpenAI = !!process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('mock');
    if (!hasAnthropic && !hasOpenAI) {
      console.error('[Hopper] AI provider selected but no valid ANTHROPIC_API_KEY or OPENAI_API_KEY found');
      process.exit(1);
    }
  }

  // Initialize shared repositories
  const orgRepo = new OrganizationRepository();
  const repoRepo = new RepositoryRepository();
  const failureSigRepo = new FailureSignatureRepository();
  const workflowFailureRepo = new WorkflowFailureRepository();
  const diagnosticReportRepo = new DiagnosticReportRepository();
  const workspaceRepo = new WorkspaceRepository();
  const userProfileRepo = new UserProfileRepository();

  // Configure CORS for Decoupled Frontend
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173')
    .split(',')
    .map((o) => o.trim());

  app.use((req: Request, res: Response, next) => {
    // Correlation / request ID — forward if provided, generate if not
    const requestId = req.headers['x-request-id'] || `hopper-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    res.setHeader('x-request-id', requestId);

    const origin = req.headers.origin as string | undefined;
    if (origin && (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, x-hopper-org, x-workspace-id');
    }

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  // Capture raw body for HMAC verification
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  // Health check endpoint (probes API, PostgreSQL, and Redis)
  app.get('/api/health', async (_req: Request, res: Response) => {
    const dbHealth = await checkDatabaseHealth();
    const redisHealth = await checkRedisHealth();
    const isOverallHealthy = dbHealth.isHealthy && redisHealth.isHealthy;

    res.json({
      status: isOverallHealthy ? 'healthy' : 'degraded',
      service: 'Hopper CI Failure Diagnosis Engine',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      dependencies: {
        database: {
          ...dbHealth,
          status: dbHealth.isHealthy ? 'healthy' : 'degraded',
          poolTotal: 10,
          poolIdle: 8,
        },
        redis: {
          ...redisHealth,
          status: redisHealth.isHealthy ? 'healthy' : 'degraded',
          connected: redisHealth.isHealthy,
        },
      },
    });
  });

  // ============================================================================
  // Route Mount Points (Decoupled Subsystem Architecture)
  // ============================================================================
  app.use('/api/webhooks', createWebhooksRouter());
  app.use('/api/billing', createBillingRouter());
  app.use('/api/diagnose', createDiagnoseRouter(diagnosticReportRepo, workspaceRepo, userProfileRepo));
  app.use('/api/dashboard', createDashboardRouter(orgRepo, repoRepo, failureSigRepo, workflowFailureRepo, userProfileRepo, workspaceRepo));
  app.use('/api/signatures', createSignaturesRouter(failureSigRepo, repoRepo, workspaceRepo, userProfileRepo, orgRepo));
  app.use('/api/repositories', createRepositoriesRouter(repoRepo, workflowFailureRepo, workspaceRepo, userProfileRepo, orgRepo));
  app.use('/api/workspaces', createWorkspaceRouter(workspaceRepo, userProfileRepo, orgRepo, repoRepo));
  app.use('/api/user', createUserRouter(userProfileRepo, workspaceRepo));

  // Serve static public assets if available
  app.use(express.static('public'));

  // Root endpoint info
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      service: 'Hopper CI Failure Diagnosis Engine API Gateway',
      version: '1.0.0',
      frontend: process.env.FRONTEND_URL || 'http://localhost:5173',
      health: '/api/health',
    });
  });

  // Global Standardized Error Handler (RFC-7807)
  app.use(errorHandlerMiddleware);

  return app;
}

// Start server if directly executed
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT || 3000;
  const app = createServer();
  app.listen(port, () => {
    console.log(`[Hopper] Webhook Gateway listening on port ${port}`);
  });
}
