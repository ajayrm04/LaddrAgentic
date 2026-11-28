import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileText,
  Quote,
  RefreshCw,
  Search,
} from 'lucide-react';
import clsx from 'clsx';
import {
  Badge,
  CardSkeleton,
  EmptyState,
  PageHeader,
  StatCard,
} from '../components/ui';
import { useBackfillReports, useReports } from '../lib/queries/reports';

export default function Reports() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useReports({ limit: 100, q: query || undefined });
  const backfill = useBackfillReports();
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);

  const reports = data?.reports ?? [];

  const summary = useMemo(() => {
    const total = reports.length;
    const verified = reports.reduce((sum, report) => sum + report.verified_count, 0);
    const sources = reports.reduce((sum, report) => sum + report.source_count, 0);
    return { total, verified, sources };
  }, [reports]);

  const handleBackfill = async () => {
    setBackfillMessage(null);
    try {
      const result = await backfill.mutateAsync({ limit: 20 });
      setBackfillMessage(
        `Generated ${result.created} report${result.created === 1 ? '' : 's'}, skipped ${result.skipped}.`
      );
    } catch (err: any) {
      setBackfillMessage(err?.response?.data?.detail || 'Backfill failed.');
    }
  };

  const openReport = (reportId: string) => navigate(`/reports/${reportId}`);

  const handleRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, reportId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openReport(reportId);
    }
  };

  const clearSearch = () => {
    setSearch('');
    setQuery('');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Cited research reports generated from completed prompt runs."
        actions={
          <button
            type="button"
            onClick={handleBackfill}
            disabled={backfill.isPending}
            className="btn-secondary"
            title="Generate reports for recent completed runs that don't have one yet"
          >
            <RefreshCw className={clsx('h-4 w-4', backfill.isPending && 'animate-spin')} />
            {backfill.isPending ? 'Generating…' : 'Generate for recent runs'}
          </button>
        }
      />

      {backfillMessage && (
        <div className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
          {backfillMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Reports"
          value={summary.total}
          loading={isLoading}
          icon={<FileText className="h-4 w-4" />}
        />
        <StatCard
          label="Verified findings"
          value={summary.verified}
          loading={isLoading}
          tone="success"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label="Sources cited"
          value={summary.sources}
          loading={isLoading}
          tone="primary"
          icon={<Quote className="h-4 w-4" />}
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            role="searchbox"
            aria-label="Search reports"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') setQuery(search.trim());
            }}
            placeholder="Search reports by title or question, then press Enter"
            className="input pl-9"
          />
        </div>
        {search && (
          <button type="button" onClick={clearSearch} className="btn-ghost h-9 shrink-0 px-2">
            Clear
          </button>
        )}
      </div>

      {isLoading ? (
        <CardSkeleton rows={5} />
      ) : isError ? (
        <div className="flex items-start gap-3 rounded-lg border border-danger-border bg-danger-subtle px-4 py-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            Failed to load reports: {error instanceof Error ? error.message : 'unknown error'}
          </div>
          <button type="button" onClick={() => void refetch()} className="btn-ghost h-7 px-2">
            Retry
          </button>
        </div>
      ) : reports.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="No reports yet"
          description="Run a research prompt in the Playground — a cited report is generated automatically when it completes."
          action={
            <Link to="/playground" className="btn-secondary">
              Open the Playground
            </Link>
          }
        />
      ) : (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[900px]">
              <caption className="sr-only">Research reports</caption>
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Agent</th>
                  <th>Confidence</th>
                  <th className="text-right">Sources</th>
                  <th className="text-right">Findings</th>
                  <th>Created</th>
                  <th aria-label="Open report" />
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => {
                  const confidence = Math.round((report.confidence ?? 0) * 100);
                  return (
                    <tr
                      key={report.report_id}
                      onClick={() => openReport(report.report_id)}
                      onKeyDown={(event) => handleRowKeyDown(event, report.report_id)}
                      tabIndex={0}
                      className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/50"
                    >
                      <td className="max-w-md">
                        <div className="truncate font-medium text-ink">
                          {report.title || 'Untitled report'}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-ink-faint">
                          {report.question}
                        </div>
                      </td>
                      <td className="whitespace-nowrap text-ink-muted">
                        {report.agent_name || '—'}
                      </td>
                      <td>
                        <Badge
                          tone={
                            confidence >= 70
                              ? 'success'
                              : confidence >= 40
                                ? 'warning'
                                : 'danger'
                          }
                        >
                          {confidence}%
                        </Badge>
                      </td>
                      <td className="text-right tabular-nums">{report.source_count}</td>
                      <td className="text-right tabular-nums">
                        <span className="inline-flex items-center justify-end gap-1.5">
                          <span>{report.findings.length}</span>
                          {report.verified_count > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-success">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {report.verified_count}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-ink-subtle">
                        {report.created_at
                          ? format(new Date(report.created_at), 'MMM d, HH:mm')
                          : '—'}
                      </td>
                      <td className="text-right">
                        <ChevronRight className="inline h-4 w-4 text-ink-faint" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
