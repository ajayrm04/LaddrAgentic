import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useBackfillReports, useReports } from '../lib/queries/reports';

export default function Reports() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useReports({ limit: 100, q: query || undefined });
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

  return (
    <div className="space-y-6 bg-[#191A1A] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-sm text-gray-400 mt-1">
            Cited research reports generated from completed prompt runs.
          </p>
        </div>
        <button
          onClick={handleBackfill}
          disabled={backfill.isPending}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-[#1F2121] hover:bg-[#252525] text-gray-200 border border-gray-700 rounded-lg transition-colors disabled:opacity-50"
          title="Generate reports for recent completed runs that don't have one yet"
        >
          <RefreshCw className={`w-4 h-4 ${backfill.isPending ? 'animate-spin' : ''}`} />
          {backfill.isPending ? 'Generating…' : 'Generate for recent runs'}
        </button>
      </div>

      {backfillMessage && (
        <div className="text-sm text-gray-300 bg-[#1F2121] border border-gray-800 rounded-lg px-4 py-3">
          {backfillMessage}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-[#1F2121] border border-gray-800 rounded-lg px-4 py-3">
          <div className="text-xs text-gray-500">Reports</div>
          <div className="text-xl font-semibold text-white">{summary.total}</div>
        </div>
        <div className="bg-[#1F2121] border border-gray-800 rounded-lg px-4 py-3">
          <div className="text-xs text-gray-500">Verified findings</div>
          <div className="text-xl font-semibold text-green-400">{summary.verified}</div>
        </div>
        <div className="bg-[#1F2121] border border-gray-800 rounded-lg px-4 py-3">
          <div className="text-xs text-gray-500">Sources cited</div>
          <div className="text-xl font-semibold text-[#1FB8CD]">{summary.sources}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-[#1F2121] border border-gray-800 rounded-lg px-3 py-2">
        <Search className="w-4 h-4 text-gray-500" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') setQuery(search.trim());
          }}
          placeholder="Search reports by title or question, then press Enter"
          className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none"
        />
        {search && (
          <button
            onClick={() => {
              setSearch('');
              setQuery('');
            }}
            className="text-xs text-gray-500 hover:text-gray-300"
          >
            Clear
          </button>
        )}
      </div>

      <div className="bg-[#1F2121] rounded-lg border border-gray-800 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading reports…
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-red-400">
            <AlertTriangle className="w-8 h-8 mb-2" />
            <p>Failed to load reports: {(error as any)?.message || 'unknown error'}</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <FileText className="w-12 h-12 mx-auto mb-4 text-gray-600" />
            <p className="mb-1">No reports yet</p>
            <p className="text-sm text-gray-500">
              Run a research prompt in the{' '}
              <Link to="/playground" className="text-[#1FB8CD] hover:underline">
                Playground
              </Link>{' '}
              — a cited report is generated automatically when it completes.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-[#191A1A]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Report</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Agent</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Confidence</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Sources</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Findings</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {reports.map((report) => {
                const confidence = Math.round((report.confidence ?? 0) * 100);
                return (
                  <tr
                    key={report.report_id}
                    onClick={() => navigate(`/reports/${report.report_id}`)}
                    className="hover:bg-[#252525] transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 max-w-md">
                      <div className="text-white font-medium truncate">
                        {report.title || 'Untitled report'}
                      </div>
                      <div className="text-xs text-gray-500 truncate mt-0.5">{report.question}</div>
                    </td>
                    <td className="px-6 py-4 text-gray-300 text-sm">{report.agent_name || '—'}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`text-xs px-2 py-1 rounded font-medium ${
                          confidence >= 70
                            ? 'text-green-400 bg-green-400/10'
                            : confidence >= 40
                            ? 'text-amber-400 bg-amber-400/10'
                            : 'text-red-400 bg-red-400/10'
                        }`}
                      >
                        {confidence}%
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-300 text-sm">{report.source_count}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-300">
                        <span>{report.findings.length}</span>
                        {report.verified_count > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs text-green-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {report.verified_count}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-sm">
                      {report.created_at ? format(new Date(report.created_at), 'MMM d, HH:mm') : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <ChevronRight className="w-4 h-4 text-gray-500 inline" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
