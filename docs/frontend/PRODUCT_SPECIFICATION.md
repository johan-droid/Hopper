# Product Specification — Hopper Dashboard

Scope: the authenticated workspace product and the public landing page.
Every screen maps to an existing API endpoint; anything without one is listed as a gap
instead of being simulated.

## 1. Principles applied

1. A screen answers one engineering question.
2. Failure investigation is the signature experience.
3. No fabricated data. Unavailable metrics say so.
4. Keyboard-first: `Cmd/Ctrl+K`, visible focus, skip link.
5. Progressive detail: summary → evidence → raw log.

## 2. Information architecture

```
/                       public landing page
/login                  sign in / sign up / reset
/signup                 create-account mode of the same form
/app/overview           workspace overview
/app/repositories       repository list
/app/repositories/:id   repository detail + failure history
/app/activity           failure activity feed (per repository)
/app/failures/:failureId reserved deep link; contract gap stated in-page
/app/investigations     ad-hoc log diagnosis
/app/investigations/:signatureId   stored signature deep-dive
/app/diagnoses          diagnosis history
/app/trends             derived reliability view
/app/integrations       service status catalogue
/app/settings           redirects to /app/settings/general
/app/settings/general   profile + workspace
/app/settings/members   membership
/app/settings/security  session + guarantees
/app/settings/billing   plan tiers + usage gap
*                       not found
```

Deep links are real: `createBrowserRouter` + a Vercel SPA fallback rewrite
(`/(.*)` → `/index.html`, placed after the `/api/(.*)` rewrite so API routes win).

## 3. Screen → API mapping

| Screen | Endpoints | Notes |
|---|---|---|
| Overview | `GET /api/repositories`, `GET /api/repositories/:id/failures` (≤8 repos), `GET /api/diagnose/history` | Metrics are counts of returned rows |
| Repositories | `GET /api/repositories`, `POST /api/repositories/:id/link-workspace` | Link action invalidates the repository query |
| Repository detail | `GET /api/repositories`, `GET /api/repositories/:id/failures` | Client-side filter, search, pagination |
| Activity | same as repository detail | Rows open the scrubbed excerpt; "Open on GitHub" deep-links the run |
| Investigations (sandbox) | `POST /api/diagnose/adhoc` | Deterministic fallback is labelled, never shown as a model result |
| Investigation (signature) | `GET /api/signatures/:id` | Root cause, evidence lines, cross-run timeline |
| Diagnoses | `GET /api/diagnose/history` | Expandable rows with model/token metadata when present |
| Reliability | repositories + failures + diagnoses | All charts derived from returned events |
| Integrations | `GET /api/health` | Only what the API can verify is marked verified |
| Members | `GET /api/workspaces/:id/members` | Read-only |
| Security | Supabase session | Sign out (current + global) |
| Billing | none usable | Tier table + explicit contract gap |
| Failure detail | none | Reserved route; renders the required contract, not a record |

## 4. State model

Every data surface implements four states:

- **Loading** — skeletons with `aria-busy`, never a bare spinner replacing layout.
- **Empty** — explains what would produce data ("a completed failing workflow event").
- **Error** — human message plus retry; 401/403 renders as an access explanation.
- **Success** — data plus provenance hints (sampled scope, derived metrics).

Permission-denied is *not* handled by hiding controls: the backend authorises every
request, and the UI only mirrors its answer.

## 5. Tenant context

- `WorkspaceProvider` loads `GET /api/workspaces` plus the profile, then resolves the
  active workspace.
- A persisted selection is always validated against the server list before use.
- Query keys embed the workspace id and user id; sign-out clears the entire cache.
- Repository and diagnosis queries are `enabled` only when a workspace id exists.

## 6. Honesty rules encoded in the UI

| Metric | Treatment |
|---|---|
| Repositories, failures, diagnoses | Counted from responses |
| Recurring signatures | Grouped by `signatureHash` from stored diagnoses |
| Failure categories, daily distribution | Derived from returned rows |
| Pass rate | Only over sampled feed rows, labelled "sampled" |
| Mean time to recovery | Rendered as **Unavailable** with the reason |
| Plan/usage | Not shown; contract gap documented |
| Integration state | `verified` only when health/HTTP proves it, else "configured server-side" |

## 7. Accessibility

- WCAG 2.2 AA intent: semantic landmarks, one `h1` per page, labelled controls.
- Keyboard: skip link, visible `:focus-visible` ring from the token layer, table rows
  focusable with Enter/Space activation, dialog Escape close + focus restore.
- Charts expose an `sr-only` data table; bars are `aria-hidden`.
- Reduced motion honoured via `prefers-reduced-motion` in the token layer.
- Log text renders as text nodes only (no HTML injection), with wrapping for long lines.

## 8. Out of scope (documented, not stubbed)

Profile editing, invitations, billing checkout, failure-by-id pages, and org-level usage
all require contracts listed in `FRONTEND_AUDIT.md` §4.
