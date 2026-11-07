import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  useAdhocDiagnoseMutation,
  useSignatureQuery,
} from '../../api/hooks';
import { AdhocDiagnoseRequestSchema, AdhocDiagnoseResponse } from '../../api/schema';
import {
  diagnoseWithPuterAi,
  PUTER_MODELS,
  PuterModelId,
} from '../../lib/puter-ai';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CopyButton,
  EmptyState,
  ErrorState,
  Field,
  InlineNotice,
  Input,
  PageHeader,
  Skeleton,
  Textarea,
} from '../../components/ui/primitives';
import { LogViewer } from '../../components/ui/LogViewer';
import { formatDate, formatRelativeTime, flakinessLabel } from '../../lib/format';
import { ROUTES } from '../../lib/routes';
import { AlertTriangle, ArrowUpRight, FlaskConical, GitCommit, GitPullRequest, Sparkles } from 'lucide-react';

/**
 * Sample logs are clearly labelled demo input. They are never written to the
 * workspace and are never presented as workspace data.
 */
const SAMPLE_LOGS: Array<{ id: string; label: string; job: string; step: string; log: string }> = [
  {
    id: 'assertion',
    label: 'Jest assertion',
    job: 'test / unit',
    step: 'Run unit tests',
    log: `FAIL src/auth/jwt-verifier.spec.ts
  ● JWT verifier › rejects an expired token
    AssertionError: expected 'active' to deeply equal 'expired'
      at src/auth/jwt-verifier.spec.ts:42:15
Process completed with exit code 1.`,
  },
  {
    id: 'timeout',
    label: 'Playwright timeout',
    job: 'e2e / chromium',
    step: 'Run end-to-end tests',
    log: `Error: Timeout of 30000ms exceeded waiting for selector "[data-testid='challenge-frame']"
  at tests/checkout.spec.ts:52:19
Process completed with exit code 1.`,
  },
  {
    id: 'oom',
    label: 'Node heap exhaustion',
    job: 'build / bundle',
    step: 'Build application',
    log: `<--- Last few GCs --->
[1844:0x5e8c000] 42150 ms: Mark-sweep 2042.4 (2080.1) -> 2038.1 MB, allocation failure
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
Process completed with exit code 137.`,
  },
];

const InvestigationPage: React.FC = () => {
  const { signatureId } = useParams<{ signatureId: string }>();
  const signatureQuery = useSignatureQuery(signatureId ?? null);
  const diagnoseMutation = useAdhocDiagnoseMutation();

  const [rawLog, setRawLog] = useState(SAMPLE_LOGS[0].log);
  const [jobName, setJobName] = useState(SAMPLE_LOGS[0].job);
  const [stepName, setStepName] = useState(SAMPLE_LOGS[0].step);
  const [formError, setFormError] = useState<string | null>(null);
  const [usedSample, setUsedSample] = useState(true);

  // Puter AI interactive execution state
  const [engine, setEngine] = useState<'puter' | 'backend'>('puter');
  const [selectedModel, setSelectedModel] = useState<PuterModelId>('deepseek-chat');
  const [puterResult, setPuterResult] = useState<AdhocDiagnoseResponse | null>(null);
  const [puterLoading, setPuterLoading] = useState(false);
  const [puterError, setPuterError] = useState<string | null>(null);

  const applySample = (id: string) => {
    const sample = SAMPLE_LOGS.find((item) => item.id === id);
    if (!sample) return;
    setRawLog(sample.log);
    setJobName(sample.job);
    setStepName(sample.step);
    setUsedSample(true);
    setFormError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setPuterError(null);
    const parsed = AdhocDiagnoseRequestSchema.safeParse({
      rawLog,
      jobName,
      stepName,
      modifiedFiles: [],
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Check the form values.');
      return;
    }

    if (engine === 'puter') {
      setPuterLoading(true);
      setPuterResult(null);
      try {
        const result = await diagnoseWithPuterAi(parsed.data, selectedModel);
        setPuterResult(result);
      } catch (err: any) {
        setPuterError(err.message || 'Puter AI diagnosis failed. You can switch to Backend Rule Engine.');
      } finally {
        setPuterLoading(false);
      }
    } else {
      setPuterResult(null);
      diagnoseMutation.mutate(parsed.data);
    }
  };

  const activeResult = puterResult || diagnoseMutation.data;
  const activeError = puterError || (diagnoseMutation.error ? (diagnoseMutation.error as Error).message : null);
  const isDiagnosing = puterLoading || diagnoseMutation.isPending;

  const signature = signatureQuery.data;

  return (
    <>
      <PageHeader
        title={signatureId ? 'Failure investigation' : 'Investigations'}
        description={
          signatureId
            ? 'A stored failure signature with its cross-run evidence.'
            : 'Paste a CI log for an ad-hoc diagnosis, or open a signature from the overview.'
        }
        breadcrumbs={
          signatureId ? (
            <Link to={ROUTES.investigations} className="hover:text-ink">
              Investigations
            </Link>
          ) : undefined
        }
      />

      {signatureId ? (
        signatureQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : signatureQuery.isError || !signature ? (
          <ErrorState
            title="Signature unavailable"
            message={
              (signatureQuery.error as Error)?.message ??
              'This signature does not exist, or it belongs to a workspace you cannot access.'
            }
            onRetry={() => void signatureQuery.refetch()}
          />
        ) : (
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={flakinessLabel(signature.flakinessScore).tone === 'danger' ? 'danger' : flakinessLabel(signature.flakinessScore).tone === 'warning' ? 'warning' : 'neutral'}>
                      {signature.flakinessScore}% · {flakinessLabel(signature.flakinessScore).label}
                    </Badge>
                    <Badge tone="neutral" mono>
                      {signature.errorCategory}
                    </Badge>
                    <Badge tone="accent">{signature.sameShaRetryPasses} same-SHA passes</Badge>
                  </div>
                  <h2 className="mt-2 break-words text-base font-semibold text-ink">
                    {signature.testIdentifier || signature.normalizedTemplate}
                  </h2>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink-muted">
                    <span className="font-mono">{signature.signatureHash.slice(0, 40)}…</span>
                    <CopyButton value={signature.signatureHash} label="Copy hash" />
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-3 text-center">
                  {[
                    ['Seen', signature.totalOccurrences],
                    ['On default branch', signature.mainBranchOccurrences],
                    ['PRs affected', signature.uniquePrsAffected],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-md border border-hairline px-3 py-2">
                      <dt className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</dt>
                      <dd className="mt-0.5 font-mono text-sm font-semibold text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Diagnosis" description="Stored root cause and next check." />
                <div className="space-y-4 px-5 pb-5">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-ink-muted">Root cause clues</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink">
                      {signature.cachedRootCause ?? 'No diagnosis has been stored for this signature yet.'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-ink-muted">Suggested next check</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-secondary">
                      {signature.cachedNextCheck ?? 'Run the failing job locally and compare the log excerpt below.'}
                    </p>
                  </div>
                  {!signature.cachedRootCause ? (
                    <InlineNotice tone="neutral">
                      A diagnosis is generated the next time this signature is processed.
                    </InlineNotice>
                  ) : null}
                </div>
              </Card>

              <Card>
                <CardHeader
                  title="Cross-run evidence"
                  description={`First seen ${formatDate(signature.firstSeenAt)} · last seen ${formatRelativeTime(signature.lastSeenAt)}`}
                />
                <ul className="divide-y divide-hairline">
                  {signature.crossRunTimeline.length === 0 ? (
                    <li>
                      <EmptyState title="No occurrences stored" description="This signature has no run history." />
                    </li>
                  ) : (
                    signature.crossRunTimeline.slice(0, 6).map((item, index) => (
                      <li key={`${item.githubRunId}-${index}`} className="px-5 py-3">
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <GitCommit className="h-3 w-3 text-ink-muted" aria-hidden />
                          <span className="font-mono text-ink">{item.commitSha.slice(0, 8)}</span>
                          <span className="text-ink-muted">{item.branch}</span>
                          {item.prNumber ? (
                            <span className="flex items-center gap-0.5 text-ink-muted">
                              <GitPullRequest className="h-3 w-3" aria-hidden />#{item.prNumber}
                            </span>
                          ) : null}
                          <span className="ml-auto text-ink-muted">{formatRelativeTime(item.failedAt)}</span>
                        </div>
                        <pre className="mt-1.5 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded border border-hairline bg-inset p-2 font-mono text-[10.5px] leading-relaxed text-ink-secondary">
                          {item.sanitizedLogSnippet}
                        </pre>
                      </li>
                    ))
                  )}
                </ul>
              </Card>
            </div>
          </div>
        )
      ) : null}

      <div className={signatureId ? 'mt-8' : ''}>
        <Card>
          <CardHeader
            title="Ad-hoc diagnosis"
            description="Runs the real parser, scrubber, fingerprinter and diagnosis pipeline. Nothing is attached to a repository."
            actions={
              <div className="flex items-center gap-2">
                <a
                  href="/puter/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-cyan hover:underline"
                >
                  <Sparkles className="h-3 w-3" />
                  <span>Launch Puter AI</span>
                </a>
                <Badge tone="neutral">
                  <FlaskConical className="h-3 w-3" aria-hidden />
                  Sandbox
                </Badge>
              </div>
            }
          />
          <form onSubmit={submit} className="space-y-4 px-5 pb-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-ink-muted">Load an example log:</span>
              {SAMPLE_LOGS.map((sample) => (
                <Button
                  key={sample.id}
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => applySample(sample.id)}
                >
                  {sample.label}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-hairline/60">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-ink-muted">Engine:</span>
                <select
                  value={engine}
                  onChange={(e) => {
                    setEngine(e.target.value as 'puter' | 'backend');
                    setPuterError(null);
                  }}
                  className="rounded border border-hairline bg-inset px-2.5 py-1 text-xs text-ink focus:outline-none focus:border-cyan cursor-pointer"
                >
                  <option value="puter">Puter AI (Zero-Key Browser Allowance)</option>
                  <option value="backend">Backend Diagnostic Pipeline (Deterministic / Outbox)</option>
                </select>
              </div>

              {engine === 'puter' ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-ink-muted">Model:</span>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value as PuterModelId)}
                    className="rounded border border-hairline bg-inset px-2.5 py-1 text-xs text-cyan font-mono focus:outline-none focus:border-cyan cursor-pointer"
                  >
                    {PUTER_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Job name" htmlFor="job-name">
                <Input
                  id="job-name"
                  value={jobName}
                  onChange={(event) => {
                    setJobName(event.target.value);
                    setUsedSample(false);
                  }}
                  maxLength={200}
                  required
                />
              </Field>
              <Field label="Failed step" htmlFor="step-name">
                <Input
                  id="step-name"
                  value={stepName}
                  onChange={(event) => {
                    setStepName(event.target.value);
                    setUsedSample(false);
                  }}
                  maxLength={200}
                  required
                />
              </Field>
            </div>

            <Field
              label="CI log"
              htmlFor="raw-log"
              hint="ANSI escapes and secrets are stripped before storage. Maximum 300 KB."
              error={formError ?? undefined}
            >
              <Textarea
                id="raw-log"
                rows={9}
                value={rawLog}
                onChange={(event) => {
                  setRawLog(event.target.value);
                  setUsedSample(false);
                }}
                className="font-mono text-xs"
                spellCheck={false}
              />
            </Field>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-ink-muted">
                {usedSample
                  ? 'Example content is loaded — edit or replace it before relying on the result.'
                  : `${rawLog.length.toLocaleString()} characters`}
              </span>
              <Button type="submit" variant="primary" loading={isDiagnosing}>
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                {isDiagnosing
                  ? 'Diagnosing…'
                  : engine === 'puter'
                    ? `Diagnose with Puter (${selectedModel})`
                    : 'Run backend diagnosis'}
              </Button>
            </div>
          </form>
        </Card>
      </div>

      {activeError ? (
        <div className="mt-4">
          <ErrorState
            title="Diagnosis failed"
            message={activeError}
            onRetry={() => {
              setPuterError(null);
              diagnoseMutation.reset();
            }}
          />
        </div>
      ) : null}

      {activeResult ? (
        <Card className="mt-4">
          <CardHeader
            title="Diagnosis result"
            description={`Fingerprint ${activeResult.signatureHash.slice(0, 32)}…`}
            actions={
              <>
                <Badge tone={activeResult.isFallback ? 'warning' : 'success'}>
                  {activeResult.provider ?? (activeResult.isFallback ? 'deterministic' : 'model')}
                </Badge>
                <CopyButton value={activeResult.signatureHash} label="Copy fingerprint" />
              </>
            }
          />
          <div className="space-y-4 px-5 pb-5">
            {activeResult.isFallback ? (
              <InlineNotice tone="warning" title="Deterministic result">
                No AI provider answered this request, so the diagnosis came from the deterministic
                rule engine. Treat it as a structural reading of the log, not a model analysis.
              </InlineNotice>
            ) : null}

            <div>
              <p className="text-[11px] uppercase tracking-wide text-ink-muted">Root cause clues</p>
              <p className="mt-1 text-sm leading-relaxed text-ink">
                {activeResult.diagnosis.root_cause_clues}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-[11px]">
              {activeResult.detectedFramework ? (
                <Badge tone="neutral" mono>{activeResult.detectedFramework}</Badge>
              ) : null}
              {activeResult.detectedExitCode !== null &&
              activeResult.detectedExitCode !== undefined ? (
                <Badge tone="neutral" mono>exit {activeResult.detectedExitCode}</Badge>
              ) : null}
              <Badge tone="accent">flakiness {activeResult.flakinessScore}%</Badge>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-muted">
                Relevant log lines
              </p>
              <LogViewer
                content={activeResult.diagnosis.relevant_log_lines
                  .map((line) => `L${line.line_number}: ${line.content}`)
                  .join('\n')}
                maxHeight="16rem"
              />
            </div>

            {activeResult.diagnosis.recommended_next_checks.length > 0 ? (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-muted">Recommended next checks</p>
                <ul className="mt-1.5 space-y-1.5">
                  {activeResult.diagnosis.recommended_next_checks.map((check) => (
                    <li key={check} className="flex gap-2 text-xs text-ink-secondary">
                      <ArrowUpRight className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden />
                      <span>{check}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {activeResult.diagnosis.local_repro_command ? (
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-wide text-ink-muted">Reproduction command</p>
                  <CopyButton value={activeResult.diagnosis.local_repro_command} />
                </div>
                <pre className="mt-1 overflow-auto rounded border border-hairline bg-inset p-2.5 font-mono text-xs text-success">
                  {activeResult.diagnosis.local_repro_command}
                </pre>
              </div>
            ) : (
              <InlineNotice tone="neutral" title="No reproduction command">
                The pipeline could not derive a command from this log. Add the failing command to the log
                excerpt to improve the result.
              </InlineNotice>
            )}
          </div>
        </Card>
      ) : null}

      {!signatureId ? (
        <p className="mt-4 flex items-center gap-1.5 text-[11px] text-ink-muted">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          Ad-hoc diagnoses are not attached to a repository and do not consume workspace quota.
        </p>
      ) : null}
    </>
  );
};

export default InvestigationPage;
