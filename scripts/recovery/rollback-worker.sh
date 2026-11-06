#!/usr/bin/env bash
# ==============================================================================
# Rollback Cloudflare Edge Gateway Worker
# ==============================================================================
set -euo pipefail

ENVIRONMENT="${1:-staging}"
DEPLOYMENT_ID="${2:-}"
WORKER_NAME="hopper-edge"
if [ "$ENVIRONMENT" = "staging" ]; then
  WORKER_NAME="hopper-edge-staging"
fi

echo "================================================================================"
echo "  ROLLBACK EDGE WORKER ($WORKER_NAME)"
echo "================================================================================"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN environment variable is required."
  exit 1
fi

if [ -z "$DEPLOYMENT_ID" ]; then
  echo "Fetching deployment versions for $WORKER_NAME..."
  npx wrangler deployments list --name "$WORKER_NAME"
  echo ""
  echo "Usage: $0 <staging|production> <deployment-id>"
  exit 1
fi

echo "Rolling back $WORKER_NAME to deployment $DEPLOYMENT_ID..."
npx wrangler rollback "$DEPLOYMENT_ID" --name "$WORKER_NAME"

echo "✔ Worker rollback applied."
