import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
  Printer,
  Trash2,
} from 'lucide-react';
import ReportView from '../components/ReportView';
import {
  downloadReportMarkdown,
  openReportPrintView,
  useDeleteReport,
  useReport,
  useShareReport,
} from '../lib/queries/reports';

export default function ReportDetail() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { data: report, isLoading, isError } = useReport(reportId);
  const shareReport = useShareReport();
  const deleteReport = useDeleteReport();

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<'download' | 'print' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleShare = async () => {
    if (!report) return;
    setActionError(null);
    try {
      const result = await shareReport.mutateAsync({ reportId: report.report_id });
      const url = `${window.location.origin}/reports/shared/${result.token}`;
      setShareUrl(url);
      await copyToClipboard(url);
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || 'Could not create a share link.');
    }
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleDownload = async () => {
    if (!report) return;
    setActionError(null);
    setBusy('download');
    try {
      await downloadReportMarkdown(report.report_id, report.title);
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || 'Could not download the Markdown report.');
    } finally {
      setBusy(null);
    }
  };

  const handlePrint = async () => {
    if (!report) return;
    setActionError(null);
    setBusy('print');
    try {
      await openReportPrintView(report.report_id);
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || 'Could not open the print view.');
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!report) return;
    if (!window.confirm('Delete this report? This cannot be undone.')) return;
    try {
      await deleteReport.mutateAsync(report.report_id);
      navigate('/reports');
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || 'Could not delete the report.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-400">Loading report…</p>
      </div>
    );
  }

  if (isError || !report) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Report not found</p>
        <Link to="/reports" className="text-[#1FB8CD] hover:underline mt-4 inline-block">
          Back to reports
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 bg-[#191A1A] p-6">
      <div className="flex items-start gap-4">
        <Link to="/reports" className="p-2 hover:bg-[#1F2121] rounded-lg transition-colors mt-1">
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-white break-words">
            {report.title || 'Untitled report'}
          </h1>
          <p className="text-sm text-gray-400 mt-1 break-words">{report.question}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mt-2">
            <span>Generated {report.created_at ? format(new Date(report.created_at), 'MMM d, yyyy HH:mm') : '—'}</span>
            <code className="font-mono">{report.report_id.slice(0, 8)}</code>
            {report.prompt_id && (
              <Link
                to={`/playground-history/${report.prompt_id}`}
                className="text-[#1FB8CD] hover:underline inline-flex items-center gap-1"
              >
                View prompt run <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleDownload}
            disabled={busy === 'download'}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-[#1F2121] hover:bg-[#252525] text-gray-200 border border-gray-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {busy === 'download' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Markdown
          </button>
          <button
            onClick={handlePrint}
            disabled={busy === 'print'}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-[#1F2121] hover:bg-[#252525] text-gray-200 border border-gray-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {busy === 'print' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            Print / PDF
          </button>
          <button
            onClick={handleShare}
            disabled={shareReport.isPending}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-[#1FB8CD]/10 hover:bg-[#1FB8CD]/20 text-[#1FB8CD] border border-[#1FB8CD]/30 rounded-lg transition-colors disabled:opacity-50"
          >
            {shareReport.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Share
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteReport.isPending}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {actionError && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          {actionError}
        </div>
      )}

      {shareUrl && (
        <div className="flex flex-wrap items-center gap-3 text-sm bg-[#1F2121] border border-gray-800 rounded-lg px-4 py-3">
          <FileText className="w-4 h-4 text-[#1FB8CD]" />
          <span className="text-gray-300">Public link (expires in 30 days):</span>
          <code className="text-[#1FB8CD] break-all flex-1 min-w-0">{shareUrl}</code>
          <button
            onClick={() => copyToClipboard(shareUrl)}
            className="flex items-center gap-1 text-xs text-gray-300 hover:text-white"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

      <div className="bg-[#1F2121] rounded-lg border border-gray-800 p-6">
        <ReportView report={report} showMethodology />
      </div>
    </div>
  );
}
