#!/usr/bin/env bash
# ==============================================================================
# Rollback Cloudflare Pages Frontend Deployment
# ==============================================================================
set -euo pipefail

ENVIRONMENT="${1:-staging}"
DEPLOYMENT_ID="${2:-}"
PROJECT_NAME="hopper-frontend"
if [ "$ENVIRONMENT" = "staging" ]; then
  PROJECT_NAME="hopper-frontend-staging"
fi

echo "================================================================================"
echo "  ROLLBACK FRONTEND DEPLOYMENT ($PROJECT_NAME)"
echo "================================================================================"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN environment variable is required."
  exit 1
fi

if [ -z "$DEPLOYMENT_ID" ]; then
  echo "Fetching recent deployments for $PROJECT_NAME..."
  npx wrangler pages deployment list --project-name="$PROJECT_NAME"
  echo ""
  echo "Usage: $0 <staging|production> <deployment-id>"
  exit 1
fi

echo "Rolling back $PROJECT_NAME to deployment $DEPLOYMENT_ID..."
npx wrangler pages deployment rollback "$DEPLOYMENT_ID" --project-name="$PROJECT_NAME"

echo "✔ Rollback applied. Global edge propagation completes in ~5 seconds."
