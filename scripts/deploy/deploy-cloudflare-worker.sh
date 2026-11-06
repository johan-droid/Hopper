#!/usr/bin/env bash
# ==============================================================================
# Deploy Hopper Edge Gateway Worker to Cloudflare Workers
# ==============================================================================
set -euo pipefail

ENVIRONMENT="${1:-staging}"

echo "================================================================================"
echo "  DEPLOYING EDGE GATEWAY WORKER ($ENVIRONMENT)"
echo "================================================================================"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN environment variable is required."
  exit 1
fi

if [ "$ENVIRONMENT" = "staging" ]; then
  npx wrangler deploy deploy/cloudflare/worker.ts \
    --config wrangler.toml \
    --env staging
else
  npx wrangler deploy deploy/cloudflare/worker.ts \
    --config wrangler.toml \
    --name hopper-edge
fi

echo "✔ Edge gateway worker deployed successfully ($ENVIRONMENT)."
