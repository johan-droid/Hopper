# HOPPER — Frontend Architecture, Component & Experience Audit

**Author**: Hopper Principal Frontend Architect & Design Systems Engineer  
**Repository**: `johan-droid/Hopper`  
**Date**: November 2026  
**Status**: COMPLETE / BASELINE VERIFIED  

---

## 1. Executive Summary

Hopper's frontend is a Single Page Application (SPA) designed for engineering teams investigating CI/CD failures and pipeline flakiness. Built on **React 18**, **Vite 5**, **Tailwind CSS 3**, and **TanStack React Query 5**, the interface is fast, strongly typed via **TypeScript 5.6** and **Zod**, and features an established design token system rooted in CSS variables.

However, the current marketing and landing experience does not match the technical depth and production-grade stability of Hopper's backend engine:
1. The landing page (`LandingPage.tsx`) presents a rudimentary layout that under-communicates Hopper's unique technical capabilities (deterministic failure fingerprinting, same-SHA flakiness scoring, and verifiable log context).
2. Certain UI components (notably `WorkflowVisualizer.tsx`) contain legacy, speculative claims of "autonomous microVM sandbox self-repair," which contradict Hopper's core mission of *verifiable, evidence-based failure diagnosis and engineering intelligence*.
3. Visual Polish: While the dashboard is functional and clean, the landing experience lacks the visual distinction, typographic rhythm, and responsive craft expected of top-tier developer platforms (such as Linear, Vercel, and Stripe).

This audit provides a comprehensive inspection of the current frontend repository to guide a production-grade redesign that is visually distinctive, technically truthful, accessible, and high-performance.

---

## 2. Technical Stack & Build Infrastructure

| Layer | Technology | Version | Purpose / Status |
|---|---|---|---|
| **Core Framework** | React + React DOM | `18.3.1` | Concurrent root mode, client-side rendering with route-level code splitting (`React.lazy`). |
| **Build Tooling** | Vite | `5.4.10` | ESM-based fast dev server, Rollup production bundler producing ~400 KB gzipped asset bundle. |
| **Language & Typings** | TypeScript | `5.6.3` | Strict mode enabled (`strict: true`), zero compile errors across frontend codebase. |
| **CSS & Design Engine** | Tailwind CSS + PostCSS | `3.4.14` | Utility-first CSS compiling against custom CSS custom properties (`globals.css`). |
| **State & Cache** | TanStack React Query + Zustand | `5.60.5` / `5.0.1` | Server-state caching and synchronization with 15s–60s stale times; lightweight local UI state. |
| **Client Routing** | React Router DOM | `7.18.5` | Declarative routing with `createBrowserRouter`, route-level error boundaries, and suspense fallbacks. |
| **Data Contracts** | Zod | `4.6.7` | Runtime contract validation for API responses and request schemas (`frontend/src/api/schema.ts`). |
| **Iconography** | Lucide React | `0.456.0` | Comprehensive icon set; tree-shakeable SVG glyphs. |
| **Testing** | Vitest + Playwright | `2.1.4` / `1.65.0` | Unit/component tests (4 suites, 34 tests passing) and E2E browser automation. |

---

## 3. Route Hierarchy & Information Architecture

The application defines clean separation between public/marketing routes and the authenticated workspace shell:

```
/ (ROUTES.landing)                     --> LandingPage.tsx (Public marketing)
/login (ROUTES.login)                  --> LoginPage.tsx (OAuth + PAT authentication)
/login/callback                        --> LoginPage.tsx (GitHub OAuth code exchange)
/auth                                  --> LoginPage.tsx (OAuth fallback)
/signup (ROUTES.signup)                --> LoginPage.tsx (Registration alias)

/app (Authenticated Shell: AppShell)
├── /app/overview                      --> OverviewPage.tsx (Active failures, flakiness leaderboard, daily trend)
├── /app/repositories                  --> RepositoriesPage.tsx (GitHub repo management, workspace linking)
│   └── /app/repositories/:repositoryId--> RepositoryDetailPage.tsx (Repo-scoped failures & trends)
├── /app/activity                      --> ActivityPage.tsx (Continuous CI failure event stream & log viewer)
├── /app/failures/:failureId           --> FailureDetailPage.tsx (Single failure contract boundary & inspector)
├── /app/investigations                --> InvestigationPage.tsx (Ad-hoc log diagnosis & Puter/deterministic tester)
│   └── /app/investigations/:sigId     --> InvestigationPage.tsx (Deep-dive into recurring failure signature)
├── /app/diagnoses                     --> DiagnosesPage.tsx (Workspace diagnosis history with model telemetry)
├── /app/trends                        --> TrendsPage.tsx (Cross-repository failure rate, category breakdown)
├── /app/integrations                  --> IntegrationsPage.tsx (GitHub, Supabase, Vercel, Stripe health status)
└── /app/settings                      --> SettingsLayout.tsx
    ├── /app/settings/general          --> SettingsPage.tsx (Workspace profile, slug)
    ├── /app/settings/members          --> MembersPage.tsx (RBAC, invitations)
    ├── /app/settings/security         --> SecurityPage.tsx (Session management, audit policy)
    └── /app/settings/billing          --> BillingPage.tsx (Tier cards, run quotas)
```

---

## 4. Design System & Token Architecture

### 4.1 Token Foundations (`globals.css` & `tailwind.config.js`)
Hopper is **dark-first by default**, with a deliberate dark mode palette that avoids pitch-black `#000000`:
- **Canvas (`--surface-canvas`)**: `10 15 29` (`#0A0F1D`) — Deep obsidian slate.
- **Raised Surfaces (`--surface-raised`)**: `15 21 35` (`#0F1523`) — Cards, sidebars, modals.
- **Overlay Surfaces (`--surface-overlay`)**: `21 30 50` (`#151E32`) — Dropdowns, hover states.
- **Inset Wells (`--surface-inset`)**: `6 9 19` (`#060913`) — Terminal logs, code blocks, input wells.
- **Borders (`--border-subtle`)**: `255 255 255` at `8%` alpha (`rgba(255, 255, 255, 0.08)`).
- **Primary Text (`--text-primary`)**: `248 250 252` (`#F8FAFC` Slate-50) — High legibility.
- **Secondary Text (`--text-secondary`)**: `148 163 184` (`#94A3B8` Slate-400) — Descriptions, labels.
- **Muted Text (`--text-muted`)**: `100 116 139` (`#64748B` Slate-500) — Metadata, timestamps.
- **Brand Accent (`--accent`)**: `6 182 212` (`#06B6D4` Cyan-500) with contrast ink `8 15 25`.
- **Semantic Accents**:
  - Success: `16 185 129` (`#10B981` Emerald) — Passes, active status.
  - Warning: `245 158 11` (`#F59E0B` Amber) — Flakiness, retry passes, degraded state.
  - Danger: `244 63 94` (`#F43F5E` Rose) — CI failures, build breaks.
  - Info: `59 130 246` (`#3B82F6` Blue) — Informational tooltips, audit notices.

### 4.2 Typography
- **Sans Serif**: `Inter, system-ui, -apple-system, sans-serif` — Used across headlines, UI labels, body prose.
- **Monospace**: `JetBrains Mono, Menlo, Monaco, Consolas, monospace` — Used for commit SHAs, timestamps, log lines, reproduction CLI commands, and metrics.

### 4.3 Existing Reusable Primitives
- `Button` & `IconButton`: Variants (`primary`, `secondary`, `ghost`, `danger`) with accessible loading indicators.
- `Badge`: Semantic tones (`neutral`, `accent`, `success`, `warning`, `danger`, `info`) with optional mono font.
- `Card` & `CardHeader`: Raised surfaces with subtle hairline borders.
- `LogViewer`: High-performance terminal emulator with ANSI color rendering, line numbers, and credential redaction tags.
- `DataTable` & `Pagination`: Accessible tables with column sorting and bounded page controls.
- `Chart` (`BarChart`, `DistributionBar`, `TrendSparkline`): Zero-dependency pure SVG visualizations.
- `CommandPalette`: Keyboard-navigable quick switcher (`Cmd+K`).

---

## 5. Audit Findings & Design Weaknesses

### 5.1 Landing Page Weaknesses
1. **Generic Layout**: The current `LandingPage.tsx` relies on simple 2-column and 3-column card grids, lacking dynamic pacing, typographic tension, and high-impact visual storytelling.
2. **Static & Flat Product Visual**: The hero visual in `LandingPage.tsx` (lines 155–210) is a static box showing three log lines and four bullet points. It fails to convey the kinetic speed of CI/CD ingestion, the depth of failure fingerprinting, or the clarity of PR sticky comments.
3. **Missing Narrative Depth**: It does not visually demonstrate *how* Hopper connects commit diffs, stack traces, and test retries to pinpoint root causes.
4. **Weak Responsive Hierarchy**: On mobile devices, cards stack into a monotonous vertical scroll without visual breathing room or adapted touch interactions.

### 5.2 Content & Marketing Credibility Gaps
1. **Misleading Autonomous Claims**: `frontend/src/components/ui/WorkflowVisualizer.tsx` claims "Autonomous Delivery Pipeline", "Isolated Sandbox MicroVM", and "Iterative self-repair". These belong to a different hypothetical product and contradict Hopper's real capabilities. Hopper must be positioned as a **CI/CD failure diagnosis and engineering intelligence platform**, not an autonomous agent.
2. **Missing Real Technical Anchors**: The landing page should highlight real architecture: HMAC-SHA256 GitHub App ingress, tail log slicing (capped at 300 KB), deterministic AST/regex log scrubbing, PostgreSQL-coordinated rate limits, and sticky PR comment updates.

### 5.3 Application Dashboard Alignment
- The dashboard pages (`OverviewPage`, `InvestigationPage`, `DiagnosesPage`, `TrendsPage`) already possess strong engineering integrity and truthful empty/error states.
- However, visual consistency between the marketing page and the app shell needs alignment: shared button border radii, consistent hairline alpha levels, and cohesive header navigation.

---

## 6. Proposed Implementation Strategy

1. **Retire Misleading Artifacts**: Update `WorkflowVisualizer.tsx` or replace its contents with Hopper's authentic 5-stage failure analysis lifecycle (Ingest -> Scrub & Slice -> Fingerprint -> Diagnose -> Report).
2. **Document Product Narrative (`LANDING_PAGE_STRATEGY.md`)**: Establish clear, credible messaging answering the 5 core developer questions without AI hype.
3. **Codify Design System (`DESIGN_SYSTEM.md`)**: Define layout grid constraints, subtle depth layers, micro-animations, and interactive component specs.
4. **Implement New Landing Page (`LandingPage.tsx`)**:
   - **Hero Section**: High-impact typographic headline, concise value proposition, dual CTAs, and a rich, interactive "Live Failure Diagnosis Inspector" showing real log scrubbing, fingerprinting, flakiness scoring, and sticky PR comment preview.
   - **Interactive Failure Investigation Demo**: Developers can inspect real failure scenarios (Jest assertion failure, Playwright timeout, OOM heap exhaustion) and see how Hopper diagnoses them.
   - **Technical Deep-Dive ("The Anatomy of a Diagnosis")**: Step-by-step breakdown of how raw logs become evidence-backed diagnoses.
   - **Architecture & Reliability Grid**: Durable PostgreSQL queues, 0-token minting in browser, strict tenant isolation, rate limit coordination.
   - **Transparent Pricing**: Free ($0), Pro Developer ($9), Small Team ($29) with verified quotas.
   - **Footer & Trust**: Grace Hopper tribute, verified platform integrations (GitHub App, Supabase, Vercel).
5. **Quality Gate Verification**: Run full TypeScript checks, Vitest frontend tests, and production build.
