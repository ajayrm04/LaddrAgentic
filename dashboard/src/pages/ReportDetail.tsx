import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  AlertTriangle,
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
import { CardSkeleton, EmptyState } from '../components/ui';
import {
  downloadReportMarkdown,
  openReportPrintView,
  useDeleteReport,
  useReport,
  useShareReport,
} from '../lib/queries/reports';

const ACCENT_BUTTON_CLASSES =
  'btn border border-primary-400/20 bg-primary-400/10 text-primary-300 hover:bg-primary-400/20 active:translate-y-px';

/* ------------------------------------------------------------------ */
/* Destructive confirm dialog (spec §10)                                */
/* ------------------------------------------------------------------ */

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancelRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="surface w-full max-w-md shadow-pop animate-fade-up focus:outline-none"
      >
        <div className="border-b border-line px-5 py-4">
          <h2 id="confirm-dialog-title" className="section-title">
            {title}
          </h2>
          <p className="mt-1 text-sm text-ink-subtle">{description}</p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4">
          <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="btn-danger"
            autoFocus={false}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deleting…
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  const confirmDelete = async () => {
    if (!report) return;
    setActionError(null);
    try {
      await deleteReport.mutateAsync(report.report_id);
      setConfirmOpen(false);
      navigate('/reports');
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || 'Could not delete the report.');
      setConfirmOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <CardSkeleton rows={2} />
        <CardSkeleton rows={6} />
      </div>
    );
  }

  if (isError || !report) {
    return (
      <EmptyState
        icon={<FileText className="h-5 w-5" />}
        title="Report not found"
        description="The report may have been deleted, or the link is incorrect."
        action={
          <Link to="/reports" className="btn-secondary">
            Back to reports
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Link
            to="/reports"
            aria-label="Back to reports"
            title="Back to reports"
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-overlay hover:text-ink"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="page-title break-words">{report.title || 'Untitled report'}</h1>
            <p className="mt-1 break-words text-sm text-ink-subtle">{report.question}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-faint">
              <span>
                Generated{' '}
                {report.created_at
                  ? format(new Date(report.created_at), 'MMM d, yyyy HH:mm')
                  : '—'}
              </span>
              <code className="font-mono">{report.report_id.slice(0, 8)}</code>
              {report.prompt_id && (
                <Link
                  to={`/playground-history/${report.prompt_id}`}
                  className="inline-flex items-center gap-1 text-primary-400 transition-colors hover:text-primary-300"
                >
                  View prompt run <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={busy === 'download'}
            className="btn-secondary"
          >
            {busy === 'download' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Markdown
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={busy === 'print'}
            className="btn-secondary"
          >
            {busy === 'print' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            Print / PDF
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={shareReport.isPending}
            className={ACCENT_BUTTON_CLASSES}
          >
            {shareReport.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            Share
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={deleteReport.isPending}
            className="btn-danger"
            aria-label="Delete report"
            title="Delete report"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {actionError && (
        <div className="flex items-start gap-3 rounded-lg border border-danger-border bg-danger-subtle px-4 py-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">{actionError}</div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="btn-ghost h-7 px-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {shareUrl && (
        <div className="surface flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
          <FileText className="h-4 w-4 shrink-0 text-primary-400" />
          <span className="text-ink-muted">Public link (expires in 30 days):</span>
          <code className="min-w-0 flex-1 break-all font-mono text-primary-300">{shareUrl}</code>
          <button
            type="button"
            onClick={() => copyToClipboard(shareUrl)}
            className="btn-ghost h-7 px-2 shrink-0"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

      <div className="surface p-5">
        <ReportView report={report} showMethodology />
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete this report?"
        description="The report, its sources, and the public share link are removed permanently. This cannot be undone."
        confirmLabel="Delete report"
        busy={deleteReport.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
