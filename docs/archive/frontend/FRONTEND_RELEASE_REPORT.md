# Frontend Release Report

Branches: `feat/frontend-product` (product build) — built on `migration/vercel-native-platform`
Status: **implemented, typechecked, built, unit-tested and covered by a browser suite.
Authenticated screens are exercised against a stubbed API, not a live backend or real account.**

## 1. What shipped

**Design system** — token layer (`surfaces`, `ink`, `hairline`, accents, radius, shadow,
motion) mapped into Tailwind with light/dark parity and reduced-motion support.
Primitives: Button, IconButton, Badge, StatusDot, Card, CardHeader, PageHeader, Input,
Textarea, Select, Field, Skeleton, Spinner, EmptyState, ErrorState, InlineNotice,
MetricCard, CopyButton, Kbd, Divider, DataTable + Pagination, LogViewer (windowed),
BarChart + DistributionBar, Dialog, CommandPalette, Toast/ToastProvider, Tooltip,
Breadcrumbs, CodeBlock, SegmentedNav.

**Application shell** — collapsible sidebar with grouped navigation and a validated
workspace selector, topbar with API status, theme toggle, user menu, `Cmd/Ctrl+K` palette,
mobile drawer, skip link.

**Routing** — `createBrowserRouter` with lazy routes and a `RequireAuth` guard that fails
closed when Supabase is unconfigured. A SPA fallback rewrite was added to `vercel.json`
after the `/api/(.*)` rewrite, so deep links survive a refresh and API routes still win.

| Route | Screen |
|---|---|
| `/` | landing page |
| `/login`, `/signup` | one form, two modes, driven by the URL |
| `/app/overview` | metric cards derived from stored rows |
| `/app/repositories`, `/app/repositories/:id` | list + failure history |
| `/app/activity` | per-repository failure feed |
| `/app/failures/:failureId` | reserved deep link; states the missing contract |
| `/app/investigations`, `/app/investigations/:signatureId` | sandbox + stored deep-dive |
| `/app/diagnoses` | diagnosis history |
| `/app/trends` | derived reliability |
| `/app/integrations` | integration states |
| `/app/settings` → `/app/settings/general`, `/members`, `/security`, `/billing` | settings with shared sub-navigation |

**Auth** — Supabase session lifecycle only (`getSession` + `onAuthStateChange`, PKCE).
The client-side HMAC token minter, demo sign-in and hardcoded org selector are gone.
Sign-out clears the React Query cache. Route guards are treated as a usability boundary,
never as authorization.

**Data layer** — Zod contracts updated for the Vercel-native backend
(`coordination`/`queue` instead of `redis`), typed `ApiError`, tenant-scoped query keys,
retry policy that never retries 401/403/404.

**Honesty rules** — fabricated metrics (`92.5%` accuracy, `1,248` failures, `42` clusters,
`UNRESTRICTED` badge) removed. MTTR and workspace-level usage report **Unavailable** with
the reason. The unresolvable failure deep link renders the required contract rather than a
fabricated record.

## 2. Checks actually run

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **PASS** (exit 0) |
| Unit tests | `npx vitest run` | **PASS** — 3 files, 28 tests |
| Production build | `npm run build` | **PASS** (exit 0) |
| Browser suite | `npx playwright test` | **PASS** — 27 passed, 1 skipped, 2 projects |
| Visual regression | `npx playwright test e2e/visual.spec.ts` | **PASS** — 6 baselines (landing, login, 404 × desktop/mobile) |
| Source maps in `dist` | `find dist` | None (disabled) |
| Secret-pattern scan of `dist` | `grep -rl "hopper-dev-secret\|service_role\|sk_live\|ghp_"` | Clean |
| Stale-reference grep | `components/views`, `createDevHmacToken`, `acme-corp`, `UNRESTRICTED` | Clean |

### Browser journeys that actually run

Public: landing hero renders without client console errors; `/login` form; `/signup`
opens create-account mode; unknown route renders 404; unauthenticated `/app/*` redirects
to `/login`; nested deep link returns HTTP 200 from the SPA fallback and survives reload.

Authenticated (session seeded in `localStorage`, every `/api/**` request stubbed with
503): both navigation groups render; `/app/diagnoses` survives reload; the command palette
opens and routes to Billing; `/app/settings` redirects to `/general` and tab links update
the URL with `aria-current`; an invalid failure id is rejected before any request.

Skipped: the command palette test on the mobile project — it is a desktop keyboard
affordance (`test.skip(isMobile, …)`), not a hidden failure.

### Measured bundle

| Asset | Raw | Gzip |
|---|---|---|
| `index` (shell + router + supabase) | 391.88 kB | 112.33 kB |
| `vendor-react` | 133.93 kB | 43.13 kB |
| `vendor-zod` | 53.42 kB | 12.20 kB |
| `vendor-query` | 53.28 kB | 16.22 kB |
| `vendor-icons` | 21.18 kB | 4.48 kB |
| `LogViewer` (windowed table, lazy) | 37.92 kB | 11.74 kB |
| `LandingPage` (lazy) | 13.74 kB | 4.20 kB |

Logs above 200 lines render through `@tanstack/react-virtual` with dynamic measurement;
shorter excerpts keep a plain ordered list. The index chunk grew from 255 kB (pre-router)
and was not optimised further — no claim is made that it is optimal.

## 3. Not verified

| Item | Status | Why |
|---|---|---|
| Screens against a live API | **BLOCKED** | No Supabase credentials or running backend |
| Sign-in → callback → session → sign-out round trip | **BLOCKED** | Same; only the anonymous and seeded-session paths were exercised |
| Two-account tenant isolation in the browser | **BLOCKED** | Depends on real accounts; isolation is enforced and unit-scoped server-side |
| Visual baselines for authenticated screens | **NOT IMPLEMENTED** | They need stable API fixtures; public screens are baselined |
| Accessibility audit with a tool (axe/Lighthouse) | **NOT IMPLEMENTED** | Semantics, names, focus and charts were built in, not audited |
| Real-device testing | **NOT IMPLEMENTED** | Emulated viewports only (1440×900, 390×844) |
| Deployment preview | **BLOCKED** | No Vercel authentication in this environment |

Baselines are Linux-specific (`*-linux.png`); another OS regenerates them with
`npm run test:e2e:update`.

## 4. Known gaps (backend contracts needed)

1. `GET /api/failures/:failureId` — the failure route cannot resolve an id; contract is
   rendered on the page itself and was requested in the audit.
2. `GET /api/organizations` — plan and usage are keyed by org slug; only `org_id` exists.
3. `signatureId` on failure rows — the activity feed cannot link to an investigation.
4. `GET /api/workspaces/:id/failures` — overview fans out per repository (sampled at 8).
5. `POST /api/workspaces/:id/invitations` — members is read-only.
6. Profile editing — `PUT /api/user/profile` exists but no validated form was built.
7. MTTR / workspace failure rate — no aggregate timestamps in any response.

## 5. Subsystem verdict

| Subsystem | Verdict |
|---|---|
| Design system | PASS |
| Routing + deep links | PASS (browser-tested, including reload) |
| Auth hardening | PASS — client-side token minting removed; unconfigured fails closed |
| Tenant scoping in the client | PASS — keys include workspace + user, cache cleared on sign-out |
| Metric honesty | PASS — fabricated metrics removed, unavailable states added |
| Interaction quality | PARTIAL — palette, toasts, tooltips, windowed logs; no Tabs/SplitPanel widget |
| Accessibility | PARTIAL — built in, not tool-audited |
| Performance | PARTIAL — code-split and windowed, not profiled in a browser |
| Browser tests | PASS — 27 passed, 1 skipped, 6 visual baselines |
| Deployment | BLOCKED — no Vercel authentication |
