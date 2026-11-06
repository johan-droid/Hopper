> **Historical document (pre-Vercel).** This file describes the retired
> Cloudflare architecture and is retained as an audit trail. The current
> architecture is `docs/architecture/VERCEL_TARGET_ARCHITECTURE.md`; operations
> are in `docs/deployment/VERCEL_DEPLOYMENT_RUNBOOK.md`. Links to
> Cloudflare-era files are intentionally dead — see
> `docs/deployment/CLOUDFLARE_REMOVAL_AUDIT.md` for the mapping.

# Hopper — Local Development Guide

Hopper features a dedicated, single-command local development orchestrator that manages prerequisites, Docker infrastructure, backend API, background workers, frontend SPA, and a Cloudflare Quick Tunnel under one supervised terminal session.

---

## 1. Quick Start

### One-Time Initial Setup

Ensure the following prerequisites are installed on your machine:

- **Node.js**: v18+ (Node 20+ recommended)
- **Docker & Docker Compose**: For local PostgreSQL 16 (`pgvector`) and Redis 7
- **Cloudflare (`cloudflared`)**: Optional but recommended for public GitHub webhook testing

Clone the repository and install root workspace dependencies:

```bash
git clone https://github.com/johan-droid/Hopper.git
cd Hopper
npm install
```

### Start Everything with One Command

From the Hopper repository root, run:

```bash
npm run local
```

The orchestrator automatically:

1. Validates Node.js, Docker, and environment configuration (`.env`).
2. Inspects ports (3000, 5173, 5432, 6379) and safely resolves any stale Hopper processes.
3. Starts and waits for PostgreSQL (with `pgvector`) and Redis to become healthy.
4. Spawns and supervises the Hopper Express API gateway.
5. Verifies the GitHub webhook ingress route (`/api/webhooks/github`).
6. Starts the background BullMQ event worker listening on `ci-events`.
7. Starts the Vite React frontend SPA.
8. Launches a Cloudflare Quick Tunnel forwarding to your local backend.
9. Displays a consolidated dashboard with local and public webhook URLs.
10. Streams live, component-prefixed logs to your terminal.

---

## 2. Command Reference

| Command | Description |
|---|---|
| `npm run local` | Launches and supervises the complete development environment |
| `npm run local:status` | Displays real-time health, process PIDs, and URLs for all services |
| `npm run local:stop` | Gracefully shuts down Hopper processes without killing unrelated software |

---

## 3. Terminal Dashboard

Once all components pass their readiness checks, you will see a clean dashboard:

```text
==================================================
                 HOPPER LOCAL DEV
==================================================

[OK] Environment validation
[OK] PostgreSQL
[OK] Redis
[OK] Backend
[OK] Background Worker
[OK] Frontend
[OK] Cloudflare Tunnel

--------------------------------------------------
LOCAL URLS
--------------------------------------------------

Frontend:       http://localhost:5173
Backend:        http://localhost:3000
Health:         http://localhost:3000/api/health

--------------------------------------------------
GITHUB INTEGRATION
--------------------------------------------------

Public URL:     https://random-subdomain.trycloudflare.com
Webhook URL:    https://random-subdomain.trycloudflare.com/api/webhooks/github

--------------------------------------------------

All services are running.

Press CTRL+C to stop the Hopper development environment safely.
```

---

## 4. Intelligent Process Conflict Detection

Hopper uses a zero-guesswork process inspection system backed by Linux `/proc` filesystem analysis (`/proc/<pid>/cmdline` and `/proc/<pid>/cwd`):

- **No Indiscriminate Kills**: Hopper never executes `pkill node`, `killall node`, or `pkill cloudflared`.
- **IDE and Tool Protection**: Antigravity, Antigravity IDE, MCP servers (`playwright-mcp`, `rea`, `mempalace`), language servers, and unrelated developer tools are protected.
- **Unrelated Process Safety**: If an unrelated application (e.g., Python, Nginx, or another development project) is already using port 3000 or 5173, Hopper will identify the process, explain the conflict, and stop safely without killing your other work.
- **Hopper Process Takeover**: If a leftover Hopper backend or worker from a crashed prior session is detected, Hopper terminates it with a graceful `SIGTERM` followed by a bounded 5-second `SIGKILL` timeout.

---

## 5. Infrastructure & Data Persistence

- **Existing Containers**: If PostgreSQL or Redis is already running and healthy, Hopper reuses the existing instances without restarting them.
- **Data Safety**: Normal shutdown (`Ctrl+C` or `npm run local:stop`) never runs `docker compose down -v`. Your PostgreSQL database tables, pgvector embeddings, and Redis queues remain preserved.
- **Pre-existing Services**: If PostgreSQL and Redis were already running before `npm run local` was executed, they are left running when Hopper shuts down.

---

## 6. Cloudflare Quick Tunnel & Webhook Testing

Hopper integrates with `cloudflared` to establish a zero-config tunnel:

1. The tunnel is started only after the local backend passes its `/api/health` check.
2. The orchestrator probes `POST /api/webhooks/github` to cryptographically verify that the webhook route is mounted before displaying the URL.
3. The generated `https://*.trycloudflare.com` URL is displayed alongside the verified webhook target.
4. **Important**: Cloudflare Quick Tunnels generate a new random subdomain for each new session. Point your GitHub App Webhook URL to the displayed URL during testing.

If `cloudflared` is not installed on your system, Hopper will display a warning and continue running all local services normally at `http://localhost:5173` and `http://localhost:3000`.

---

## 7. Troubleshooting

### Port 3000 or 5173 Occupied by Unrelated Application

If you receive an error like:
```text
Port 3000 required for Hopper Backend is occupied by an unrelated process (PID: 12345).
```
Check what is running:
```bash
lsof -iTCP:3000 -sTCP:LISTEN
```
Either stop the conflicting process or change the port by setting `PORT=3001` in `backend/.env`.

### Another Orchestrator is Running

If you see:
```text
Another Hopper local development orchestrator is currently running (PID: 9876).
```
Check status:
```bash
npm run local:status
```
Or terminate the previous session:
```bash
npm run local:stop
```

### Inspecting Raw Logs

Log files for every component are persisted under `.runtime/local/logs/`:
- `.runtime/local/logs/combined.log` — Consolidated stream
- `.runtime/local/logs/backend.log` — Backend Express output
- `.runtime/local/logs/worker.log` — BullMQ worker logs
- `.runtime/local/logs/frontend.log` — Vite dev server output
- `.runtime/local/logs/tunnel.log` — Cloudflare tunnel connection logs

