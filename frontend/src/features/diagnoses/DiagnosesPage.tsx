import React, { useMemo, useState } from 'react';
import { useDiagnosisHistoryQuery } from '../../api/hooks';
import { useWorkspace } from '../workspace/WorkspaceProvider';
import {
  Badge,
  Button,
  Card,
  CopyButton,
  EmptyState,
  ErrorState,
  PageHeader,
  Select,
  Skeleton,
} from '../../components/ui/primitives';
import { Pagination } from '../../components/ui/DataTable';
import { filterDiagnoses, pageCount, paginate, type TimeRange } from '../../lib/filters';
import { formatRelativeTime, shortSha } from '../../lib/format';
import type { DiagnosisHistoryItem } from '../../api/schema';
import { ChevronDown, ChevronRight, History, Terminal } from 'lucide-react';

const PAGE_SIZE = 12;

const DiagnosesPage: React.FC = () => {
  const { workspaceId } = useWorkspace();
  const diagnosesQuery = useDiagnosisHistoryQuery(workspaceId);
  const diagnoses = diagnosesQuery.data?.diagnoses ?? [];

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [range, setRange] = useState<TimeRange>('all');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set(diagnoses.map((diagnosis) => diagnosis.errorCategory).filter(Boolean))].sort(),
    [diagnoses]
  );

  const filtered = useMemo(
    () => filterDiagnoses(diagnoses, { query, category, range }),
    [diagnoses, query, category, range]
  );
  const totalPages = pageCount(filtered.length, PAGE_SIZE);
  const visible = paginate(filtered, Math.min(page, totalPages), PAGE_SIZE);

  return (
    <>
      <PageHeader
        title="Diagnosis History"
        description="Every diagnosis persisted for this workspace, newest first. Model and token metadata is shown when the provider reported it."
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void diagnosesQuery.refetch()}
            loading={diagnosesQuery.isFetching}
          >
            Refresh
          </Button>
        }
      />

      {diagnosesQuery.isError ? (
        <ErrorState
          title="Could not load diagnoses"
          message={(diagnosesQuery.error as Error).message}
          onRetry={() => void diagnosesQuery.refetch()}
        />
      ) : (
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3">
            <label className="sr-only" htmlFor="diagnosis-search">
              Search diagnoses
            </label>
            <input
              id="diagnosis-search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search repository, job, commit or root cause"
              className="h-8 min-w-[220px] flex-1 rounded-md border border-hairline bg-inset px-2.5 text-xs text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
            />
            <label className="sr-only" htmlFor="diagnosis-category">
              Error category
            </label>
            <Select
              id="diagnosis-category"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}
              className="h-8 w-40 text-[11px]"
            >
              <option value="all">All categories</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
            <label className="sr-only" htmlFor="diagnosis-range">
              Time range
            </label>
            <Select
              id="diagnosis-range"
              value={range}
              onChange={(event) => {
                setRange(event.target.value as TimeRange);
                setPage(1);
              }}
              className="h-8 w-28 text-[11px]"
            >
              <option value="24h">Last 24h</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="all">All time</option>
            </Select>
            <span className="ml-auto text-[11px] text-ink-muted">
              {filtered.length} of {diagnoses.length}
            </span>
          </div>

          {diagnosesQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<History className="h-5 w-5" />}
              title={diagnoses.length === 0 ? 'No diagnoses stored' : 'No diagnoses match these filters'}
              description={
                diagnoses.length === 0
                  ? 'Diagnoses are stored when a queued workflow failure is processed, or when you run an ad-hoc diagnosis.'
                  : 'Widen the time range or clear the search.'
              }
            />
          ) : (
            <ul className="divide-y divide-hairline">
              {visible.map((diagnosis) => (
                <DiagnosisRow
                  key={diagnosis.id}
                  diagnosis={diagnosis}
                  expanded={expanded === diagnosis.id}
                  onToggle={() => setExpanded(expanded === diagnosis.id ? null : diagnosis.id)}
                />
              ))}
            </ul>
          )}

          <Pagination
            page={Math.min(page, totalPages)}
            totalPages={totalPages}
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </Card>
      )}
    </>
  );
};

const DiagnosisRow: React.FC<{
  diagnosis: DiagnosisHistoryItem;
  expanded: boolean;
  onToggle: () => void;
}> = ({ diagnosis, expanded, onToggle }) => (
  <li>
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-overlay/40"
    >
      <span className="mt-0.5 text-ink-muted" aria-hidden>
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-ink">
            {diagnosis.repoFullName ?? 'Ad-hoc diagnosis'}
          </span>
          <Badge tone="neutral" mono>
            {diagnosis.errorCategory}
          </Badge>
          {diagnosis.commitSha ? (
            <span className="font-mono text-[10px] text-ink-muted">{shortSha(diagnosis.commitSha)}</span>
          ) : null}
          {diagnosis.prNumber ? (
            <span className="font-mono text-[10px] text-ink-muted">#{diagnosis.prNumber}</span>
          ) : null}
          <span className="ml-auto shrink-0 text-[10px] text-ink-muted">
            {formatRelativeTime(diagnosis.createdAt)}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-ink-secondary">
          {diagnosis.rootCauseClues}
        </p>
      </div>
    </button>

    {expanded ? (
      <div className="space-y-3 border-t border-hairline bg-inset/40 px-10 py-4">
        <dl className="grid gap-2 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Workflow', diagnosis.workflowName ?? '—'],
            ['Job', diagnosis.jobName ?? '—'],
            ['Failed step', diagnosis.failedStepName ?? '—'],
            ['Branch', diagnosis.branch ?? '—'],
            ['Flakiness', `${diagnosis.flakinessScore}%`],
            ['Model', diagnosis.llmModelUsed ?? '—'],
            ['Prompt tokens', diagnosis.promptTokens?.toLocaleString() ?? '—'],
            ['Completion tokens', diagnosis.completionTokens?.toLocaleString() ?? '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-ink-muted">{label}</dt>
              <dd className="truncate font-mono text-ink-secondary">{String(value)}</dd>
            </div>
          ))}
        </dl>

        {diagnosis.suggestedNextCheck ? (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-ink-muted">Suggested next check</p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">{diagnosis.suggestedNextCheck}</p>
          </div>
        ) : null}

        {diagnosis.localReproCommand ? (
          <div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-wide text-ink-muted">Reproduction</p>
              <CopyButton value={diagnosis.localReproCommand} />
            </div>
            <pre className="mt-1 overflow-auto rounded border border-hairline bg-inset p-2 font-mono text-[11px] text-success">
              {diagnosis.localReproCommand}
            </pre>
          </div>
        ) : null}

        {diagnosis.signatureHash ? (
          <p className="flex items-center gap-2 font-mono text-[10px] text-ink-muted">
            <Terminal className="h-3 w-3" aria-hidden />
            {diagnosis.signatureHash}
          </p>
        ) : null}
      </div>
    ) : null}
  </li>
);

export default DiagnosesPage;
