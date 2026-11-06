# Frontend Audit — Baseline Before the Product Build

Recorded before any frontend change, from reading every file under `frontend/src`.
Baseline: `npm run lint` exit 0, `vitest` 9 tests passing (schema only), build exit 0.

## 1. What existed

| Area | State |
|---|---|
| Entry point | `App.tsx` mounted a tabbed shell (`useAppStore.activeTab`) |
| Routing | **None** — navigation was Zustand state, so no URL, no deep link, no back button |
| Views | 12 files in `components/views`, 2,800 lines total |
| Largest file | `LandingPageView.tsx`, 1,286 lines |
| API layer | `api/client.ts` (239), `api/schema.ts` (239), `api/hooks.ts` (105) |
| State | One 195-line Zustand store mixing auth, tenant, tab, plan and modal state |
| Auth | Supabase password sign-in **plus** a client-side HMAC JWT minter |
| Design | Ad-hoc Tailwind classes per page; tokens partially defined in CSS but unused |
| Tests | `api/schema.test.ts` only (9 assertions) |

## 2. Defects found

1. **Client-side token forging (security).** `createDevHmacToken()` signed a JWT in the
   browser with a hardcoded secret baked into the bundle. Removed entirely; tokens now
   come only from the Supabase session.
2. **Health contract broken by the platform migration.** `HealthSchema` required
   `dependencies.redis`. The Vercel-native API returns `coordination` and `queue`, so
   every health parse would throw and the status indicator would read "degraded" forever.
3. **Fabricated production metrics.** Overview rendered a hardcoded `92.5%` "flakiness
   accuracy", `1,248` deduplicated failures, `42` clusters, `< 0.4s` latency, and
   `MONTHLY CI INGESTION … UNRESTRICTED` with a divided-by-1000 quota bar.
4. **Fake tenant selector.** A hardcoded org dropdown (`acme-corp`,
   `github-actions-demo`, `hopper-oss`) with no relationship to the API.
5. **Fake entitlement badge.** Header showed `PREVIEW: UNRESTRICTED`.
6. **Dead navigation.** `/app`-style URLs did not exist; refresh always returned to the
   landing page. Closing a tab lost all context.
7. **Wrong failure → signature mapping.** Activity rows passed a *failure* id into the
   signature endpoint, which cannot resolve.
8. **Invented reproduction command.** The investigation screen copied
   `npm test -- checkout.spec.ts` regardless of the actual diagnosis.
9. **No cache scoping on sign-out.** Query keys carried no user or workspace identity, and
   nothing cleared the cache, so a second account on the same browser could read the
   first account's cached pages.
10. **Source maps published.** `vite build` emitted `.map` files into `dist/`, which is
    the directory uploaded to the CDN.
11. **No loading/empty/error discipline.** Several views rendered spinner text inline and
    collapsed all failures into one banner.
12. **Accessibility gaps.** Icon-only buttons without names, clickable `<tr>` elements
    with no keyboard affordance, no focus ring system, no skip link.

## 3. Working behaviour preserved

- Every endpoint and response shape already used by the client
  (`/api/health`, `/api/dashboard/:orgSlug`, `/api/signatures/:id`,
  `/api/diagnose/adhoc`, `/api/repositories*`, `/api/workspaces*`, `/api/user/profile`,
  `/api/diagnose/history`).
- Log redaction is server-side and unchanged; the UI only renders stored excerpts.
- Zod-as-runtime-boundary discipline: every response is still parsed, never trusted.
- The Vite/Tailwind/TanStack Query/Zustand stack — no framework replacement.

## 4. Backend contract gaps discovered

| Gap | Consequence | Proposed contract |
|---|---|---|
| No organisation listing | Dashboard usage and billing checkout need an org **slug**; the UI only has `org_id` on repositories | `GET /api/organizations` → `{ id, slug, plan, monthly_runs_limit, runs_used }` |
| Failure feed has no `signatureId` | A feed row cannot link to its signature investigation | add `signatureId` to the failures payload |
| No failure-by-id endpoint | Deep-linking a single failure is impossible | `GET /api/failures/:id` |
| No workspace-wide activity | Overview must fan out per repository (sampled) | `GET /api/workspaces/:id/failures?limit=` |
| No invite endpoint | Members page is read-only | `POST /api/workspaces/:id/invitations` |
| No run-duration totals | MTTR / failure rate cannot be computed | aggregate fields on the dashboard response |

## 5. Baseline metrics

| Metric | Baseline |
|---|---|
| Typecheck | PASS |
| Tests | 9 passing, 1 file |
| Build | PASS |
| Initial JS (index chunk) | 255.56 kB (67.64 kB gzip) |
| Source maps in `dist` | Yes |
| Routes | 0 |
