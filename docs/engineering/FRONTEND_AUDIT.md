# Hopper — Frontend Subsystem & User Interface Audit

## 1. Frontend Technology Stack & Architecture

- **Framework:** React 18.3.1 with Vite 5.4.21
- **Styling:** Tailwind CSS 3.4.14 with custom dark cybernetic tokens
- **Icons:** Lucide React 0.456.0
- **State Management:** Zustand 5.0.1 (`frontend/src/store/useAppStore.ts`)
- **Server Cache & Data Fetching:** TanStack React Query 5.60.5 (`frontend/src/api/hooks.ts`)
- **Validation:** Zod 3.23.8 (`frontend/src/api/schema.ts`)
- **Auth Client:** `@supabase/supabase-js` 2.119.0

---

## 2. Views & Component Inventory

| Component | File | Responsibility | Current State | Gaps / Enhancements |
|---|---|---|---|---|
| **Landing Page** | `LandingPageView.tsx` | Developer landing page with live interactive sandbox, before/after comparison, 4-stage engine, flakiness moat showcase, pricing grid, FAQ, and footer. | COMPLETE | Fully styled & responsive. |
| **Flaky Leaderboard** | `OverviewView.tsx` | Displays monthly run quota meter, warning banners, top 10 flaky test leaderboard with blurred rows for free-tier users, and quick inspect links. | COMPLETE | Connect to live organization switcher. |
| **Signature Inspector** | `SignatureInspectorView.tsx` | Deep dive into a specific failure fingerprint: SHA-256 hash, cross-run timeline (last 50 occurrences), root-cause analysis, and copyable reproduction command. | COMPLETE | Connect signature search / filter. |
| **Ad-Hoc Sandbox** | `DiagnosticSandboxView.tsx` | Interactive test environment allowing developers to paste raw CI logs or select presets (Playwright, Jest, Docker OOM) to observe real-time slicing and AI diagnosis. | COMPLETE | Fully connected to `/api/diagnose/adhoc`. |
| **Plans & Quotas** | `BillingPlansView.tsx` | Pricing table comparing Free ($0), Pro ($9), and Team ($29) plans with 1-click Stripe checkout or local mode simulation. | COMPLETE | Verified checkout button integration. |
| **Gateway Telemetry** | `TelemetryView.tsx` | Real-time health dashboard showing gateway uptime, PostgreSQL latency, Redis connection, and worker queue status. | COMPLETE | Auto-refreshes every 15 seconds. |
| **Header** | `Header.tsx` | Brand logo, gateway health status pill, organization selector, active plan pill, "Simulate Pro" toggle, and "← Landing Page" link. | COMPLETE | Add user avatar & auth sign-in trigger. |
| **Navigation Tabs** | `NavTabs.tsx` | Tab strip for Flaky Leaderboard [1], Signature Inspector [2], Ad-hoc Sandbox [3], Plans & Quotas [4], and Gateway Telemetry [5] with keyboard shortcuts (1-5). | COMPLETE | Fully functional. |

---

## 3. State Management (`store/useAppStore.ts`)

The central Zustand store coordinates application state:

- `activeTab`: `'landing' | 'overview' | 'signatures' | 'diagnose' | 'billing' | 'gateway'`
- `selectedOrg`: Active tenant organization (default `'acme-corp'`)
- `planTier` & `simulatedPlan`: Current entitlement tier (`'free' | 'pro_dev' | 'team'`)
- `selectedSignatureId`: Active signature under inspection
- `supabaseUser`: Active authenticated Supabase user profile
- `sessionExpired`: Boolean flag triggering re-authentication prompt
- Actions: `setTab`, `setSelectedOrg`, `setPlanTier`, `inspectSignature`, `signIn`, `signUp`, `signOut`

---

## 4. API Client & Schema Validation

- **Client (`api/client.ts`):** Centralized HTTP client communicating with backend API. Includes 10-second timeout, error status wrapping, and correlation request headers (`x-request-id`, `x-hopper-org`).
- **Schemas (`api/schema.ts`):** Zod schemas strictly validating:
  - `HealthSchema`
  - `DashboardSchema`
  - `SignatureDetailSchema`
  - `AdhocDiagnoseRequestSchema` & `AdhocDiagnoseResponseSchema`
  - `BillingCheckoutRequestSchema` & `BillingCheckoutResponseSchema`
- **Unit Test (`api/schema.test.ts`):** 5 automated schema verification tests passing.

---

## 5. Identified Frontend Gaps & Next Implementation Tasks

1. **Supabase Auth UI:** Add a clean Sign In / Sign Up modal dialog triggered from the header so users can authenticate with Supabase.
2. **Error Boundary:** Add a global React `ErrorBoundary` component to gracefully catch rendering exceptions without white-screening.
3. **Workspace Switcher:** Connect the header organization dropdown to dynamically load workspaces from the database.

