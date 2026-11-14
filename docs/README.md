# Hopper — Technical Documentation System (docs/README.md)

Welcome to the **Hopper Technical Documentation System**. This directory is the authoritative repository of technical knowledge, architectural decisions, operational runbooks, and project tracking for Hopper.

---

## 1. Documentation Architecture & Directory Map

```text
docs/
├── README.md                           # This navigation index
│
├── product/
│   └── VISION.md                       # Mission, core value prop, tiers, non-goals
│
├── architecture/
│   ├── SYSTEM_OVERVIEW.md              # High-level architecture, event flows, delivery guarantees
│   ├── ARCHITECTURE.md                 # Frontend and backend subsystems, queue and parser details
│   ├── DATA_MODEL.md                   # Database schema, ERD, migrations 0001-0014, RLS policies
│   ├── INTEGRATIONS.md                 # GitHub App, Stripe, Groq, NVIDIA NIM, Vercel, and AI providers
│   └── AI_GATEWAY.md                   # Multi-provider AI gateway, routing, resilience, and orchestrator
│
├── development/
│   ├── GETTING_STARTED.md              # Prerequisites, local setup, Docker, and developer scripts
│   ├── DEVELOPMENT_GUIDELINES.md       # Coding conventions, API standards, and migration policies
│   ├── TESTING.md                      # Vitest suites, Playwright E2E, simulations, and SDLC runner
│   └── CONTRIBUTING.md                 # Branch strategy, PR checklist, and commit conventions
│
├── project/
│   ├── CURRENT_STATE.md                # Authoritative implementation status, test ledger, blockers
│   ├── ROADMAP.md                      # Phased engineering roadmap and milestones
│   ├── TASKS_AND_GAPS.md               # Actionable tasks, priorities, acceptance criteria
│   └── KNOWN_ISSUES.md                 # Defect register, post-mortems, and active limitations
│
├── security/
│   └── SECURITY_OVERVIEW.md            # Threat model, tenant isolation, secret scrubbing, auth
│
├── decisions/
│   └── ADR_INDEX.md                    # Architecture Decision Records (ADR-001 through ADR-007)
│
├── deployment/                         # Deployment runbooks and configuration registers
│   ├── VERCEL_DEPLOYMENT_RUNBOOK.md    # Production deployment step-by-step
│   ├── VERCEL_ROLLBACK_RUNBOOK.md      # Emergency rollback procedures
│   ├── VERCEL_ENVIRONMENT_VARIABLES.md # Complete environment variable register
│   ├── VERCEL_COST_AND_LIMITS.md       # Quotas, Hobby limits, and upgrade triggers
│   └── VERCEL_SETUP.md                 # Setup from zero guide
│
├── operations/
│   └── OPERATIONAL_RUNBOOK.md          # Production operations, monitoring, and incident response
│
├── screenshots/                        # Reference UI screenshots and visual artifacts
│
└── archive/                            # Historical audit reports, phase ledgers, and provenance
    ├── audit/                          # Phase 0 baseline audits and repository inventories
    ├── engineering/                    # Phase 14-16 engineering and verification reports
    ├── strategy/                       # Detailed commercial spreadsheets and interview guides
    └── verification/                   # Phase H independent verification ledgers
```

---

## 2. Reading Paths

### For AI Coding Agents
1. Begin with [`AGENTS.md`](file:///home/ashutoshsahoo/Downloads/Hopper/AGENTS.md) in the repository root.
2. Review [`docs/project/CURRENT_STATE.md`](file:///home/ashutoshsahoo/Downloads/Hopper/docs/project/CURRENT_STATE.md) for current implementation evidence and blockers.
3. Review [`docs/architecture/SYSTEM_OVERVIEW.md`](file:///home/ashutoshsahoo/Downloads/Hopper/docs/architecture/SYSTEM_OVERVIEW.md) and [`docs/architecture/DATA_MODEL.md`](file:///home/ashutoshsahoo/Downloads/Hopper/docs/architecture/DATA_MODEL.md) before making structural changes.
4. Verify all work against [`docs/development/TESTING.md`](file:///home/ashutoshsahoo/Downloads/Hopper/docs/development/TESTING.md).

### For Human Developers & Contributors
1. Begin with the root [`README.md`](file:///home/ashutoshsahoo/Downloads/Hopper/README.md) for a project overview.
2. Follow [`docs/development/GETTING_STARTED.md`](file:///home/ashutoshsahoo/Downloads/Hopper/docs/development/GETTING_STARTED.md) to set up your local development environment.
3. Consult [`docs/development/DEVELOPMENT_GUIDELINES.md`](file:///home/ashutoshsahoo/Downloads/Hopper/docs/development/DEVELOPMENT_GUIDELINES.md) and [`docs/development/CONTRIBUTING.md`](file:///home/ashutoshsahoo/Downloads/Hopper/docs/development/CONTRIBUTING.md) when preparing pull requests.

---

## 3. Documentation Governance & Maintenance

1. **Single Source of Truth:** Never maintain multiple competing versions of documentation. If an architectural decision changes, update the relevant file in `docs/architecture/` and append a record in `docs/decisions/ADR_INDEX.md`.
2. **Evidence-Based Documentation:** Document the codebase as it actually exists, not an imagined or planned version. Clearly mark planned capabilities as `[PLANNED]`.
3. **No Transient Clutter:** Do not commit temporary meeting notes, personal to-do scratchpads, or unverified progress reports to root or `docs/`.
