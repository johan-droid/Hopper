import * as express_serve_static_core from 'express-serve-static-core';

/**
 * Hopper Webhook Gateway & REST API Server.
 * Ingests GitHub Action webhooks, validates HMAC signatures, checks quotas,
 * and exposes health and dashboard endpoints.
 */
declare function createServer(): express_serve_static_core.Express;

export { createServer };
