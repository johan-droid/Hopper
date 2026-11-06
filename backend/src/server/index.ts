/**
 * Hopper Local API Server Bootstrap.
 *
 * Only this entrypoint binds a TCP port. The deployed equivalent is
 * `api/index.ts` (Vercel Node.js Function), which imports the same `createApp`.
 */

import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app.js';
import { closeDatabasePool } from '../db/client.js';

export { createApp } from './app.js';

/** Backwards-compatible alias used by the existing test suites. */
export const createServer = createApp;

function isExecutedDirectly(): boolean {
  const entry = process.argv[1] || '';
  return /server[\\/]index\.(ts|js)$/.test(entry) || entry.includes('dist/server/index');
}

if (isExecutedDirectly()) {
  const port = Number(process.env.PORT || 3000);

  try {
    const app = createApp();
    const server = app.listen(port, () => {
      console.log(`[Hopper] API gateway listening on http://localhost:${port}`);
      console.log(`[Hopper] Health: http://localhost:${port}/api/health`);
    });

    const shutdown = async (signal: string) => {
      console.log(`[Hopper] ${signal} received; closing HTTP server...`);
      server.close();
      await closeDatabasePool().catch(() => undefined);
      process.exit(0);
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
  } catch (err: any) {
    // Startup misconfiguration is fatal for a local server (but never for a
    // serverless import, which is why the throw happens in createApp).
    console.error(`[Hopper] Failed to start API server: ${err.message}`);
    process.exit(1);
  }
}
