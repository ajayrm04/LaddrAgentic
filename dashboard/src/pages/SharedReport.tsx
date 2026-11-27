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
      <div className="min-h-screen bg-[#191A1A] flex items-center justify-center text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading shared report…
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-[#191A1A] flex flex-col items-center justify-center text-center px-6">
        <FileText className="w-12 h-12 text-gray-600 mb-4" />
        <h1 className="text-xl font-semibold text-white mb-2">
          {status === 410 ? 'This shared link has expired' : 'Shared report not found'}
        </h1>
        <p className="text-sm text-gray-400">
          {status === 410
            ? 'Ask the report owner to generate a new share link.'
            : 'The link may be incorrect or the report may have been deleted.'}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#191A1A]">
      <header className="border-b border-gray-800 bg-[#0D0E0E]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-gray-300">
            <FileText className="w-5 h-5 text-[#1FB8CD]" />
            <span className="text-sm font-semibold">Shared research report</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-xs text-gray-400 hover:text-gray-200">
              Laddr
            </Link>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[#1F2121] hover:bg-[#252525] text-gray-200 border border-gray-700 rounded-lg transition-colors"
            >
              <Printer className="w-4 h-4" /> Print / PDF
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-white break-words">
          {report.title || 'Untitled report'}
        </h1>
        <p className="text-sm text-gray-400 mt-1 break-words">{report.question}</p>
        <p className="text-xs text-gray-500 mt-2">
          Generated {report.created_at ? format(new Date(report.created_at), 'MMM d, yyyy HH:mm') : '—'}
          {report.share_expires_at
            ? ` · Link expires ${format(new Date(report.share_expires_at), 'MMM d, yyyy')}`
            : ''}
        </p>

        <div className="bg-[#1F2121] rounded-lg border border-gray-800 p-6 mt-6">
          <ReportView report={report} showMethodology={false} />
        </div>
      </main>
    </div>
  );
}
