/**
 * Vercel Node.js Function entrypoint for the Hopper API.
 *
 * All `/api/*` traffic is rewritten here (see root `vercel.json`). The Express
 * application is constructed once per function instance and reused across
 * invocations, so database pools and clients are not recreated per request.
 */

import { createApp } from '../backend/src/server/app.js';

const app = createApp({ serverless: true });

export default app;
