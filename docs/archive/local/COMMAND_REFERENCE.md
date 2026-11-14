# Hopper - Command Reference

## Setup Commands

### Initial Setup

```bash
npm install
# Installs all dependencies for both backend and frontend
## Verification Commands

### Tests

```bash
npm test
# Runs the project's standard test suite (backend vitest).
```

```bash
### Shutdown

```bash
npm run stop
# Stops application processes gracefully without
# destroying databases, Redis volumes, or user data.

npm run infra:down
# Stops infrastructure cleanly without deleting persisted data.
```
npm run smoke
# Verifies the actual local application:
# 1. Frontend is reachable
# 2. Backend is reachable
# 3. Health endpoint responds
# 4. Database connectivity works
# 5. Redis connectivity works
# 6. Worker is available
# 7. Migrations are current
# 8. API contract is valid
# 9. Authentication endpoint or flow is available
# 10. Critical application routes respond
```

### Type Checking

```bash
npm run typecheck
# Runs type checking on both frontend and backend.
```

### Linting

```bash
npm run lint
# Runs linting on both frontend and backend.
```

### Full Verification

```bash
npm run verify
# Runs the complete local verification pipeline:
# - Environment checks
# - Type checking
# - Linting
# - Frontend build
# - Backend build
# - Unit tests
# - Integration tests
# - Database migration validation
# - Critical smoke tests
```

### Status

```bash
npm run status
# Displays:
# - Frontend status
# - Backend status
# - Database connectivity
# - Redis connectivity
# - Worker status
# - Queue status
# - Supabase Auth connectivity
# - GitHub integration configuration
# - Stripe configuration
# Clearly distinguishes configured, connected, healthy,
# and unavailable services.
```
```

### Setup

```bash
npm run setup
# Validates prerequisites, checks environment files,
# verifies database and Redis configuration,
# and prepares the local environment where appropriate.
```

### Infrastructure

```bash
npm run infra:up
# Starts local PostgreSQL, Redis, and any selected
# local Supabase services using Docker Compose.

npm run infra:down
# Stops the configured infrastructure cleanly without
# deleting persisted data.
```

## Development Startup

```bash
npm run dev
# Starts frontend (Vite), backend (tsx watch),
# and background worker. Database and Redis should
# either be started via `npm run infra:up` or checked
# for readiness.
```

### Production-Parity Startup

```bash
npm run build
# Builds both frontend and backend.

npm run start:local
# Starts the production-built frontend, backend, and
# worker using the intended local production topology.
# Uses a suitable static frontend server or existing
# reverse proxy configuration if necessary.
```
### Logs

```bash
npm run logs
# Provides useful access to service logs.

# Service-specific log commands:
npm run logs:frontend
npm run logs:backend
npm run logs:worker
npm run logs:infra
### Shutdown

```bash
npm run stop
# Stops application processes gracefully without
# destroying databases, Redis volumes, or user data.

npm run infra:down
# Stops infrastructure cleanly without deleting persisted data.
```
```