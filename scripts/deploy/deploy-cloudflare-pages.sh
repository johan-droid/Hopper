#!/usr/bin/env bash
# ==============================================================================
# Deploy Hopper Frontend to Cloudflare Pages
# ==============================================================================
set -euo pipefail

ENVIRONMENT="${1:-staging}"
PROJECT_NAME="hopper-frontend"
if [ "$ENVIRONMENT" = "staging" ]; then
  PROJECT_NAME="hopper-frontend-staging"
fi

echo "================================================================================"
echo "  DEPLOYING FRONTEND TO CLOUDFLARE PAGES ($ENVIRONMENT)"
echo "  Project Name: $PROJECT_NAME"
echo "================================================================================"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN environment variable is required."
  exit 1
fi

# Ensure frontend build exists
if [ ! -d "frontend/dist" ]; then
  echo "Building frontend bundle..."
  npm --prefix frontend run build
fi

npx wrangler pages deploy frontend/dist \
  --project-name="$PROJECT_NAME" \
  --branch="$ENVIRONMENT" \
  --commit-dirty=true

echo "✔ Frontend deployed successfully to Cloudflare Pages ($PROJECT_NAME)."
