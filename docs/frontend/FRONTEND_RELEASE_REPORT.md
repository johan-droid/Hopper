# Frontend Release Report

Branch: `feat/frontend-product` (built on `migration/vercel-native-platform`)
Status: **implemented, typechecked, built and unit-tested. Not visually verified in a
browser, and no end-to-end suite exists yet.**

## 1. What shipped

**Design system** — token layer in `globals.css` (surfaces, text, lines, accents,
radius, shadow, motion) mapped into Tailwind; light and dark themes applied via
`data-theme` with `prefers-color-scheme` support. Primitives: Button, IconButton, Badge,
StatusDot, Card, CardHeader, PageHeader, Input, Textarea, Select, Field, Skeleton,
Spinner, EmptyState, ErrorState, InlineNotice, MetricCard, CopyButton, Kbd, Divider,
DataTable + Pagination, LogViewer, BarChart + DistributionBar, Dialog, CommandPalette.

**Application shell** — collapsible sidebar with grouped navigation and a validated
workspace selector, topbar with API status, theme toggle, user menu, `Cmd/Ctrl+K`
palette, mobile drawer, skip link.

**Routing** — `createBrowserRouter`, 14 routes, lazy-loaded pages, `RequireAuth` guard
that fails closed when Supabase is unconfigured, 404 route, SPA fallback rewrite added to
the root `vercel.json`.

**Auth** — Supabase session lifecycle only (`getSession` + `onAuthStateChange`, PKCE).
The client-side HMAC token minter, demo sign-in, and hardcoded org selector are gone.
Sign-out clears the React Query cache.

**Screens** — Overview, Repositories, Repository detail, Activity, Investigations
(signature deep-dive + ad-hoc sandbox), Diagnoses, Reliability, Integrations, Settings,
Members, Security, Billing, Landing, Login, 404.

**Data layer** — Zod contracts updated for the Vercel-native backend
(`coordination`/`queue` health instead of `redis`), typed `ApiError` with status/code,
contract-mismatch detection, tenant-scoped query keys, retry policy that never retries
401/403/404.

## 2. Checks actually run

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **PASS** (exit 0) |
| Unit tests | `npx vitest run` | **PASS** — 3 files, 28 tests |
| Production build | `npm run build` | **PASS** (exit 0) |
| Stale-reference grep | `useAppStore`/`components/views`/`NavTabs`/`AuthModal`/`createDevHmacToken`/`acme-corp` | Clean |
| Source maps in `dist` | `find dist` | None (disabled) |
| Secret-pattern scan of `dist` | `grep -rl "hopper-dev-secret\|service_role\|sk_live\|ghp_"` | Clean |

Test coverage added: API contracts (health without `redis`, fallback diagnosis marked,
defaults), filters (query/branch/status/range, pagination, day bucketing, category
counts, per-repo summary), formatters (durations, relative time, null → em dash).

### Measured bundle

| Asset | Raw | Gzip |
|---|---|---|
| `index` (app shell + router + supabase) | 386.84 kB | 111.01 kB |
| `vendor-react` | 133.93 kB | 43.13 kB |
| `vendor-zod` | 53.42 kB | 12.20 kB |
| `vendor-query` | 53.28 kB | 16.22 kB |
| `vendor-icons` | 21.18 kB | 4.48 kB |
| `LandingPage` (lazy) | 13.74 kB | 4.20 kB |
| `InvestigationPage` (lazy) | 11.01 kB | 3.87 kB |
| `OverviewPage` (lazy) | 7.75 kB | 2.84 kB |

Every route is code-split (16 page chunks). The 386 kB index chunk is larger than the
previous 255 kB because the router and the Supabase SDK are now in the critical path;
this was **not** optimised further, and no claim is made that it is optimal.

## 3. Not verified

| Item | Status | Why |
|---|---|---|
| Browser rendering of any screen | **NOT VERIFIED** | No screenshot or browser session was run |
| Responsive behaviour at real viewports | **NOT VERIFIED** | Same |
| Playwright end-to-end journeys | **NOT IMPLEMENTED** | No browser test runner was installed in this pass |
| Visual regression | **NOT IMPLEMENTED** | Depends on the above |
| Live API behaviour | **BLOCKED** | Requires Supabase credentials and a running backend |
| Auth round trip (sign-in → refresh → sign-out) | **BLOCKED** | Same |

Do not read "typecheck + build pass" as "the UI looks right". It has not been looked at.

## 4. Known gaps (backend contracts needed)

1. `GET /api/organizations` — plan and usage are keyed by org slug; only `org_id` exists.
2. `signatureId` on failure rows — activity rows cannot link to a signature investigation.
3. `GET /api/failures/:id` — no deep-linkable single failure.
4. `GET /api/workspaces/:id/failures` — overview fans out per repository, sampled at 8.
5. `POST /api/workspaces/:id/invitations` — members is read-only.
6. Profile editing — `PUT /api/user/profile` exists but no validated form was built.
7. MTTR / workspace failure rate — no aggregate timestamps in any response.

Each gap is surfaced in the UI where it matters (e.g. Billing and Overview) rather than
filled with placeholder numbers.

## 5. Subsystem verdict

| Subsystem | Verdict |
|---|---|
| Design system | PASS (implemented, compiles) |
| Routing + deep links | PASS (code) / NOT VERIFIED (browser) |
| Auth hardening | PASS — client-side token minting removed |
| Tenant scoping in the client | PASS — keys include workspace + user, cache cleared on sign-out |
| Metric honesty | PASS — fabricated metrics removed, unavailable states added |
| Accessibility | PARTIAL — semantics/labels/focus implemented, not audited with a tool |
| Performance | PARTIAL — measured and code-split, not profiled in a browser |
| E2E / visual tests | FAIL — not implemented |
| Deployment | BLOCKED — no Vercel authentication in this environment |
