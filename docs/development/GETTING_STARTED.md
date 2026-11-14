# Hopper — Developer Onboarding & Local Setup (GETTING_STARTED.md)

---

## 1. System Requirements

Before setting up Hopper locally, verify that your environment satisfies:

| Dependency | Minimum Version | Verification Command | Notes |
|---|---|---|---|
| **Node.js** | `>= 20.0.0` (LTS recommended) | `node -v` | Required by root `package.json` engines |
| **npm** | `>= 9.0.0` | `npm -v` | Required for workspace resolution |
| **Docker Engine** | `>= 24.0.0` | `docker -v` | For running PostgreSQL 16 + pgvector container |
| **Docker Compose** | Compose V2 plugin | `docker compose version` | Used by `npm run infra:up` |
| **Git** | `>= 2.30.0` | `git --version` | Source control |

> [!NOTE]
> Hopper does **not** require Redis, Cloudflare Wrangler, or BullMQ. The only local container dependency is PostgreSQL 16 with `pgvector`.

---

## 2. Step-by-Step Installation

### Step 1: Clone the Repository
```bash
git clone https://github.com/johan-droid/Hopper.git
cd Hopper
```

### Step 2: Install Workspace Dependencies
```bash
npm install
```
This installs dependencies across the root, `backend/`, and `frontend/` workspaces.

### Step 3: Configure Environment Variables
Create the backend and frontend environment files from templates:

```bash
cp .env.example backend/.env
cp frontend/.env.example frontend/.env
```

For local offline development, the default values in `.env.example` work out of the box:
- `AI_PROVIDER=mock`: Runs the deterministic AI diagnosis engine without requiring paid OpenAI or Anthropic API keys.
- `DATABASE_URL`: Pre-configured to point to the local Docker PostgreSQL container (`postgresql://postgres:postgres@localhost:5432/hopper_db`).
- `JWT_SECRET`: Pre-set with a local development testing secret.

### Step 4: Start Local Infrastructure
Start the PostgreSQL 16 + pgvector container in the background:

```bash
npm run infra:up
```

Verify that the container is healthy:
```bash
docker ps --filter "name=hopper-postgres"
```

### Step 5: Run Preflight Checks (Hopper Doctor)
Execute the Hopper Doctor script to validate your environment, node versions, and configuration files:

```bash
npm run doctor
```
All mandatory checks should display `[PASS]`.

### Step 6: Apply Database Migrations
Run the forward-only SQL migrations against the local database:

```bash
npm run migrate
```
This applies all migrations (`0001` through `0013`) and initial seed data.

### Step 7: Launch the Development Environment
Start the full development stack (API Gateway, background queue worker, and Vite React frontend) with a single command:

```bash
npm run dev
```

The orchestrator (`scripts/local/start.mjs`) automatically:
1. Detects port conflicts on `3000` (backend) and `5173` (frontend).
2. Verifies PostgreSQL connectivity.
3. Spawns the Express backend API on `http://localhost:3000`.
4. Spawns the local durable queue worker.
5. Launches the Vite development server on `http://localhost:5173`.

---

## 3. Local Endpoints & Navigation

Once `npm run dev` is running, access the following services:

| Service | Local URL | Purpose |
|---|---|---|
| **Frontend Application** | <http://localhost:5173> | React SPA dashboard, investigation sandbox, failure feeds |
| **Backend API Gateway** | <http://localhost:3000> | Express API gateway root |
| **System Health Check** | <http://localhost:3000/api/health> | Health status of DB, coordination, and queue |
| **Puter.js Serverless Edition** | <http://localhost:5173/puter/> | Standalone browser-based Puter AI edition |

---

## 4. Helpful Management Scripts

The root `package.json` provides scripts for managing processes and testing:

```bash
# Check running Hopper processes and port bindings
npm run status

# Stop all running Hopper processes cleanly
npm run stop

# Run only the backend API server
npm run dev:backend

# Run only the frontend Vite server
npm run dev:frontend

# Run the local durable queue worker
npm run dev:worker

# Stop or reset the Docker database container
npm run infra:down
npm run infra:reset

# Simulate an offline CI failure diagnosis
npm run simulate -- -s timeout

# Run the full 8-stage automated SDLC lifecycle
npm run lifecycle
```

---

## 5. Common Troubleshooting Scenarios

### Port 3000 or 5173 Already in Use
If another process is using port `3000` or `5173`:
```bash
npm run stop
```
If a rogue non-Hopper process is occupying the port, identify and terminate it:
```bash
lsof -i :3000
kill -9 <PID>
```

### Docker Container Connection Failure
If `npm run doctor` reports that PostgreSQL on port `5432` is not reachable:
```bash
# Restart the container
npm run infra:down
npm run infra:up

# Check container logs
docker logs hopper-postgres
```

### Resetting the Database to a Clean State
To wipe all data, drop schemas, and re-apply fresh migrations:
```bash
npm run infra:reset
npm run migrate
```
