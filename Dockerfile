# ==============================================================================
# HOPPER CI FAILURE DIAGNOSIS SAAS - MULTI-STAGE DOCKERFILE
# ==============================================================================

# Stage 1: Build & Compile
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code and configurations
COPY src/ ./src/
COPY supabase/ ./supabase/

# Compile production bundles
RUN npm run build

# Stage 2: Production Runtime
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Install minimal production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled bundles from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/supabase ./supabase

# Expose Webhook and REST API port
EXPOSE 3000

# Health check probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start Hopper Gateway
CMD ["node", "dist/server/index.js"]
