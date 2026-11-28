import { Link, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { FileText, Loader2, Printer } from 'lucide-react';
import ReportView from '../components/ReportView';
import { useSharedReport } from '../lib/queries/reports';

export default function SharedReport() {
  const { token } = useParams<{ token: string }>();
  const { data: report, isLoading, error } = useSharedReport(token);

  const status = (error as any)?.response?.status;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center text-ink-subtle">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading shared report…
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center text-center px-6">
        <FileText className="w-12 h-12 text-ink-faint mb-4" />
        <h1 className="text-xl font-semibold text-ink mb-2">
          {status === 410 ? 'This shared link has expired' : 'Shared report not found'}
        </h1>
        <p className="text-sm text-ink-subtle">
          {status === 410
            ? 'Ask the report owner to generate a new share link.'
            : 'The link may be incorrect or the report may have been deleted.'}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-line bg-canvas">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-ink-muted">
            <FileText className="w-5 h-5 text-primary-400" />
            <span className="text-sm font-semibold">Shared research report</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-xs text-ink-subtle hover:text-ink">
              Laddr
            </Link>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-surface-raised hover:bg-surface-overlay text-ink border border-line-strong rounded-lg transition-colors"
            >
              <Printer className="w-4 h-4" /> Print / PDF
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="page-title break-words">
          {report.title || 'Untitled report'}
        </h1>
        <p className="text-sm text-ink-subtle mt-1 break-words">{report.question}</p>
        <p className="text-xs text-ink-faint mt-2">
          Generated {report.created_at ? format(new Date(report.created_at), 'MMM d, yyyy HH:mm') : '—'}
          {report.share_expires_at
            ? ` · Link expires ${format(new Date(report.share_expires_at), 'MMM d, yyyy')}`
            : ''}
        </p>

        <div className="bg-surface-raised rounded-lg border border-line p-6 mt-6">
          <ReportView report={report} showMethodology={false} />
        </div>
      </main>
    </div>
  );
}
