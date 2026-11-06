# Hopper Local Development Orchestrator

Single-command local development supervisor for the Hopper CI/CD Failure Diagnosis Engine.

## Architecture

```text
scripts/local/
├── config.mjs           # Central paths, ports, timeouts, and env loaders
├── logger.mjs           # Component-prefixed colored logger, file logging, terminal dashboard
├── health-check.mjs     # TCP, HTTP, pg_isready, and GitHub webhook route verifiers
├── process-manager.mjs  # /proc inspection, safe conflict detection, process supervisor, locks
├── start.mjs            # 12-step main orchestrator (npm run local)
├── status.mjs           # Live status reporter (npm run local:status)
├── stop.mjs             # Graceful shutdown tool (npm run local:stop)
└── README.md            # This documentation
```

## Quick Reference

| Command | Purpose |
|---|---|
| `npm run local` | Start all infrastructure, backend, worker, frontend, and tunnel in one terminal |
| `npm run local:status` | Check live status of all services, ports, and PIDs |
| `npm run local:stop` | Safely terminate the local development session without killing unrelated apps |

## Safety Guarantees

1. **Intelligent Process Classification**: Inspects Linux `/proc/<pid>/cmdline` and `/proc/<pid>/cwd`. Never executes indiscriminate `pkill node` or `killall`.
2. **IDE & Tool Protection**: Specifically excludes Antigravity, Antigravity IDE, MCP servers (`playwright-mcp`, `rea`, `mempalace`), language servers, and unrelated developer tools.
3. **Safe Port Conflict Handling**: If an unrelated process occupies port 3000, 5173, 5432, or 6379, the orchestrator explains the conflict and safely aborts rather than killing third-party software.
4. **Data Preservation**: Never runs `docker compose down -v`. PostgreSQL database contents and pgvector indexes remain intact across sessions.
5. **Verified Routes Only**: Never displays a webhook URL until `POST /api/webhooks/github` responds and confirms route availability.

