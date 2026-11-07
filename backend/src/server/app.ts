/**
 * Hopper Express Application Factory.
 *
 * Pure application construction with no process-level side effects. This module
 * is imported by:
 *   - `src/server/index.ts`      (local HTTP server)
 *   - `api/index.ts`             (Vercel Node.js Function)
 *   - integration tests          (supertest-style in-process execution)
 *
 * There is no unconditional `process.exit()` here: missing configuration
 * throws, so a serverless cold start fails one request instead of killing the
 * whole function instance.
 */

import express, { Request, Response, NextFunction } from 'express';
import { checkCoordinationHealth } from '../queue/coordination.js';
import { checkQueueHealth } from '../queue/consumer.js';
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
import { createAuthRouter } from './routes/auth.js';
import { createCronRouter } from './routes/cron.js';

export interface RuntimeConfig {
  isProduction: boolean;
  isTest: boolean;
  aiProvider: string;
  allowedOrigins: string[];
  hasStripe: boolean;
  warnings: string[];
}

const MANDATORY_PRODUCTION_ENV = ['DATABASE_URL', 'GITHUB_APP_WEBHOOK_SECRET'];

/**
 * Validate the runtime environment without terminating the process.
 * In production a missing mandatory variable throws so the deployment fails
 * loudly instead of serving traffic with degraded security.
 */
export function validateRuntimeConfig(): RuntimeConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';
  const warnings: string[] = [];

  if (isProduction) {
    for (const key of MANDATORY_PRODUCTION_ENV) {
      if (!process.env[key]) {
        throw new Error(`[Hopper] Missing mandatory environment variable: ${key}`);
      }
    }
    if (!process.env.GITHUB_APP_PRIVATE_KEY?.trim()) {
      throw new Error('[Hopper] Missing mandatory environment variable: GITHUB_APP_PRIVATE_KEY');
    }
    if (!process.env.JWT_SECRET && !process.env.SUPABASE_JWT_SECRET && !process.env.SUPABASE_JWT_PUBLIC_KEY) {
      throw new Error(
        '[Hopper] JWT verification requires JWT_SECRET, SUPABASE_JWT_SECRET, or SUPABASE_JWT_PUBLIC_KEY in production'
      );
    }
    if (!process.env.CORS_ALLOWED_ORIGINS) {
      throw new Error(
        '[Hopper] CORS_ALLOWED_ORIGINS must be configured in production (wildcard CORS is refused)'
      );
    }
  }

  const hasStripe = Boolean(
    process.env.STRIPE_SECRET_KEY &&
      !process.env.STRIPE_SECRET_KEY.includes('mock') &&
      !process.env.STRIPE_SECRET_KEY.includes('placeholder')
  );
  if (!hasStripe && !isTest) {
    warnings.push('Stripe billing is unset or deferred; operating in free validation mode.');
  }

  const aiProvider = (process.env.AI_PROVIDER || 'mock').toLowerCase();
  if (aiProvider !== 'mock' && isProduction) {
    const hasAnthropic =
      !!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.includes('mock');
    const hasOpenAI =
      !!process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('mock');
    const hasPuter =
      !!process.env.PUTER_AUTH_TOKEN && !process.env.PUTER_AUTH_TOKEN.includes('mock');
    if (aiProvider === 'anthropic' && !hasAnthropic) {
      throw new Error('[Hopper] AI provider anthropic selected but no valid ANTHROPIC_API_KEY found');
    } else if (aiProvider === 'openai' && !hasOpenAI) {
      throw new Error('[Hopper] AI provider openai selected but no valid OPENAI_API_KEY found');
    } else if (aiProvider === 'puter' && !hasPuter) {
      throw new Error('[Hopper] AI provider puter selected but no valid PUTER_AUTH_TOKEN found');
    } else if (!['anthropic', 'openai', 'puter'].includes(aiProvider)) {
      throw new Error(`[Hopper] Unsupported AI provider: ${aiProvider}`);
    }
  }

  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return { isProduction, isTest, aiProvider, allowedOrigins, hasStripe, warnings };
}

export interface CreateAppOptions {
  /**
   * Normalise the path Vercel rewrites to (`/api/index` -> `/api`) so the same
   * Express router table serves both local and serverless invocations.
   */
  serverless?: boolean;
}

export function createApp(options: CreateAppOptions = {}) {
  const config = validateRuntimeConfig();
  const app = express();

  // Vercel terminates TLS upstream.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  if (options.serverless) {
    app.use((req: Request, _res: Response, next: NextFunction) => {
      if (req.url.startsWith('/api/index')) {
        req.url = req.url.slice('/api/index'.length) || '/';
        if (!req.url.startsWith('/api')) req.url = `/api${req.url}`;
      }
      next();
    });
  }

  app.use(securityHeadersMiddleware);

  // CORS: strict allowlist in production, localhost-friendly elsewhere.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId =
      (req.headers['x-request-id'] as string) ||
      `hopper-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    res.setHeader('x-request-id', requestId);

    const origin = req.headers.origin as string | undefined;
    const allowed =
      !!origin &&
      (config.allowedOrigins.includes(origin) ||
        (!config.isProduction &&
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)));

    if (allowed && origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, PATCH, DELETE, OPTIONS'
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, Accept, x-hopper-org, x-workspace-id, x-request-id, x-github-event, x-github-delivery, x-hub-signature-256, stripe-signature'
      );
      res.setHeader('Access-Control-Expose-Headers', 'x-request-id');
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Bounded request bodies; the raw buffer is retained for HMAC verification.
  app.use(
    express.json({
      limit: process.env.MAX_REQUEST_BODY || '1mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));

  // Repositories are stateless wrappers over the shared pool.
  const orgRepo = new OrganizationRepository();
  const repoRepo = new RepositoryRepository();
  const failureSigRepo = new FailureSignatureRepository();
  const workflowFailureRepo = new WorkflowFailureRepository();
  const diagnosticReportRepo = new DiagnosticReportRepository();
  const workspaceRepo = new WorkspaceRepository();
  const userProfileRepo = new UserProfileRepository();

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------
  app.get('/api/health', async (_req: Request, res: Response) => {
    const [dbHealth, coordination, queue] = await Promise.all([
      checkDatabaseHealth(),
      checkCoordinationHealth(),
      checkQueueHealth(),
    ]);

    const isOverallHealthy = dbHealth.isHealthy && coordination.isHealthy;

    res.json({
      status: isOverallHealthy ? 'healthy' : 'degraded',
      service: 'Hopper CI Failure Diagnosis Engine',
      version: '1.0.0',
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
      region: process.env.VERCEL_REGION || null,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      dependencies: {
        database: {
          ...dbHealth,
          status: dbHealth.isHealthy ? 'healthy' : 'degraded',
        },
        coordination: {
          ...coordination,
          status: coordination.isHealthy ? 'healthy' : 'degraded',
        },
        queue: {
          ...queue,
          status: queue.isHealthy ? 'healthy' : 'degraded',
        },
      },
    });
  });

  // ---------------------------------------------------------------------------
  // Routers
  // ---------------------------------------------------------------------------
  app.use('/api/auth', createAuthRouter(userProfileRepo, workspaceRepo, orgRepo, repoRepo));
  app.use('/api/cron', createCronRouter());
  app.use('/api/webhooks', createWebhooksRouter());
  app.use('/api/billing', createBillingRouter());
  app.use(
    '/api/diagnose',
    createDiagnoseRouter(diagnosticReportRepo, workspaceRepo, userProfileRepo)
  );
  app.use(
    '/api/dashboard',
    createDashboardRouter(
      orgRepo,
      repoRepo,
      failureSigRepo,
      workflowFailureRepo,
      userProfileRepo,
      workspaceRepo
    )
  );
  app.use(
    '/api/signatures',
    createSignaturesRouter(failureSigRepo, repoRepo, workspaceRepo, userProfileRepo, orgRepo)
  );
  app.use(
    '/api/repositories',
    createRepositoriesRouter(repoRepo, workflowFailureRepo, workspaceRepo, userProfileRepo, orgRepo)
  );
  app.use(
    '/api/workspaces',
    createWorkspaceRouter(workspaceRepo, userProfileRepo, orgRepo, repoRepo)
  );
  app.use('/api/user', createUserRouter(userProfileRepo, workspaceRepo));

  app.use(express.static('public'));

  app.get('/', (_req: Request, res: Response) => {
    res.json({
      service: 'Hopper CI Failure Diagnosis Engine API Gateway',
      version: '1.0.0',
      frontendUrl: process.env.FRONTEND_URL || process.env.VERCEL_URL || 'http://localhost:5173',
      health: '/api/health',
    });
  });

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'API route not found' },
    });
  });

  app.use(errorHandlerMiddleware);

  return app;
}
