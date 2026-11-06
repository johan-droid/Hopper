import React from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  CardHeader,
  CopyButton,
  InlineNotice,
  PageHeader,
} from '../../components/ui/primitives';
import { Breadcrumbs, CodeBlock } from '../../components/ui/feedback';
import { ROUTES } from '../../lib/routes';
import { Activity, Search } from 'lucide-react';

/** Route parameter guard: ids are opaque, but they are not unbounded strings. */
const FAILURE_ID = /^[A-Za-z0-9._-]{1,64}$/;

const CONTRACT = `GET /api/failures/:failureId
Authorization: Bearer <supabase access token>

200 OK
{
  "failure": {                 // same shape as the repository failure feed row
    "id": "uuid",
    "repositoryId": "uuid",
    "workflowName": "CI",
    "jobName": "test",
    "failedStepName": "Run tests",
    "branch": "main",
    "commitSha": "40-hex",
    "prNumber": 42,
    "actorLogin": "octocat",
    "githubRunId": 123456789,
    "durationMs": 91000,
    "exitCode": 1,
    "failedAt": "2026-01-01T00:00:00.000Z",
    "sanitizedLogSnippet": "…",
    "signatureId": "uuid"        // needed to link to the investigation
  }
}

404 { "error": "not_found" }    // unauthenticated → 401, foreign tenant → 404`;

/**
 * The failure feed returns rows inline, so this route cannot resolve a single
 * failure by id: no such endpoint exists yet. Rather than render a fabricated
 * record, the page states the gap and routes the user to what does work.
 */
const FailureDetailPage: React.FC = () => {
  const { failureId } = useParams<{ failureId: string }>();
  const valid = Boolean(failureId && FAILURE_ID.test(failureId));

  if (!valid) {
    return (
      <>
        <Breadcrumbs items={[{ label: 'Pipeline Activity', to: ROUTES.activity }, { label: 'Invalid failure id' }]} />
        <PageHeader
          title="Invalid failure id"
          description="The id in this URL cannot be a failure identifier: it must be 1–64 characters of letters, digits, dot, dash or underscore."
        />
        <Card>
          <div className="px-5 py-6">
            <InlineNotice tone="warning" title="The route parameter was rejected">
              Route parameters are validated before use. Nothing was requested for this value.
            </InlineNotice>
            <Link
              to={ROUTES.activity}
              className="mt-4 inline-flex text-xs text-accent hover:underline"
            >
              Back to pipeline activity
            </Link>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Pipeline Activity', to: ROUTES.activity },
          { label: `Failure ${failureId!.slice(0, 8)}` },
        ]}
      />
      <PageHeader
        title="Single failure"
        description="This deep link is reserved, but the API cannot resolve one failure by id yet."
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader
            title="Why this page is empty"
            description="Hopper stores failures and serves them per repository. There is no GET /api/failures/:id."
          />
          <div className="space-y-4 px-5 pb-5">
            <p className="text-xs leading-relaxed text-ink-secondary">
              The activity feed returns complete rows, so a failure can be inspected inline there.
              Linking to a single failure needs an endpoint that resolves the id under the caller's
              tenant. Until it exists, this page shows the contract instead of inventing a record or
              silently redirecting to a list that may not contain the id.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <CopyButton value={failureId!} label="Copy failure id" />
              <Link
                to={ROUTES.activity}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-accent hover:bg-overlay"
              >
                <Activity className="h-3 w-3" aria-hidden />
                Open the activity feed
              </Link>
              <Link
                to={ROUTES.investigations}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-accent hover:bg-overlay"
              >
                <Search className="h-3 w-3" aria-hidden />
                Diagnose a log instead
              </Link>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                Requested id (validated, not yet resolved)
              </p>
              <div className="rounded-md border border-hairline bg-inset px-3 py-2 font-mono text-[11px] text-ink-secondary">
                {failureId}
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Backend contract needed" description="Proposed shape, aligned with the existing feed row." />
            <div className="px-5 pb-5">
              <CodeBlock code={CONTRACT} label="http" maxHeight="26rem" />
            </div>
          </Card>
          <InlineNotice tone="neutral" title="Tracked, not stubbed">
            This gap is listed in <code className="font-mono">docs/frontend/FRONTEND_RELEASE_REPORT.md</code>{' '}
            with the required response fields. No placeholder failure, metric or diagnosis is
            rendered here.
          </InlineNotice>
          <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
            Go back
          </Button>
        </div>
      </div>
    </>
  );
};

export default FailureDetailPage;
