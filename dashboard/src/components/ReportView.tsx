import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Info, Quote } from 'lucide-react';
import type { Report } from '../lib/types';

interface ReportViewProps {
  report: Report;
  showMethodology?: boolean;
}

function confidenceClasses(value: number | null | undefined) {
  const confidence = value ?? 0;
  if (confidence >= 0.7) return 'text-green-400 bg-green-400/10 border-green-400/30';
  if (confidence >= 0.4) return 'text-amber-400 bg-amber-400/10 border-amber-400/30';
  return 'text-red-400 bg-red-400/10 border-red-400/30';
}

export default function ReportView({ report, showMethodology = false }: ReportViewProps) {
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const focusSource = (sourceId: string) => {
    setHighlighted(sourceId);
    const element = document.getElementById(`report-source-${sourceId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    window.setTimeout(() => setHighlighted(null), 2200);
  };

  const confidence = Math.round((report.confidence ?? 0) * 100);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${confidenceClasses(report.confidence)}`}>
          {confidence}% confidence
        </span>
        <span className="text-xs px-2.5 py-1 rounded-full border border-gray-700 text-gray-300 bg-[#191A1A]">
          {report.source_count} sources
        </span>
        <span className="text-xs px-2.5 py-1 rounded-full border border-gray-700 text-gray-300 bg-[#191A1A]">
          {report.findings.length} findings
        </span>
        <span className="text-xs px-2.5 py-1 rounded-full border border-gray-700 text-gray-300 bg-[#191A1A]">
          {report.verified_count} verified
        </span>
        {report.agent_name && (
          <span className="text-xs px-2.5 py-1 rounded-full border border-gray-700 text-gray-300 bg-[#191A1A]">
            agent: {report.agent_name}
          </span>
        )}
      </div>

      {report.summary && (
        <div className="border-l-2 border-[#1FB8CD] pl-4">
          <p className="text-gray-200 leading-relaxed">{report.summary}</p>
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Findings</h2>
        {report.findings.length === 0 ? (
          <p className="text-sm text-gray-500">No findings were extracted from this run.</p>
        ) : (
          <ol className="space-y-4">
            {report.findings.map((finding, index) => (
              <li key={index} className="bg-[#191A1A] border border-gray-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <span className="flex-none mt-0.5 text-xs font-semibold text-gray-500 w-5 text-right">
                    {index + 1}.
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-200 leading-relaxed">
                      {finding.text}
                      {finding.source_ids.length > 0 && (
                        <span className="inline-flex flex-wrap gap-1 ml-2 align-middle">
                          {finding.source_ids.map((sourceId) => (
                            <button
                              key={sourceId}
                              type="button"
                              onClick={() => focusSource(sourceId)}
                              className="text-[11px] font-semibold text-[#1FB8CD] bg-[#1FB8CD]/10 hover:bg-[#1FB8CD]/20 border border-[#1FB8CD]/30 rounded px-1.5 py-0.5 transition-colors"
                              title={`Jump to source ${sourceId}`}
                            >
                              {sourceId}
                            </button>
                          ))}
                        </span>
                      )}
                    </p>
                    {finding.quote && (
                      <blockquote className="mt-3 flex gap-2 text-sm text-gray-400 bg-[#0D0E0E] border border-gray-800 rounded p-3">
                        <Quote className="w-4 h-4 flex-none mt-0.5 text-gray-600" />
                        <span className="italic">{finding.quote}</span>
                      </blockquote>
                    )}
                    <div className="mt-2">
                      {finding.verified ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-green-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> verified against source
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5" /> unverified — no supporting quote
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {report.disagreements.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Disagreements</h2>
          <ul className="space-y-2">
            {report.disagreements.map((item, index) => (
              <li key={index} className="flex gap-2 text-sm text-gray-300 bg-amber-400/5 border border-amber-400/20 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 flex-none mt-0.5 text-amber-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.limitations && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Limitations</h2>
          <div className="flex gap-2 text-sm text-gray-400 bg-[#191A1A] border border-gray-800 rounded-lg p-4">
            <Info className="w-4 h-4 flex-none mt-0.5 text-gray-500" />
            <span>{report.limitations}</span>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Sources</h2>
        {report.sources.length === 0 ? (
          <p className="text-sm text-gray-500">No sources were retrieved for this run.</p>
        ) : (
          <div className="space-y-2">
            {report.sources.map((source) => (
              <div
                key={source.id}
                id={`report-source-${source.id}`}
                className={`border rounded-lg p-4 transition-colors ${
                  highlighted === source.id
                    ? 'border-[#1FB8CD] bg-[#1FB8CD]/5'
                    : 'border-gray-800 bg-[#191A1A]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="flex-none text-[11px] font-semibold text-[#1FB8CD] bg-[#1FB8CD]/10 border border-[#1FB8CD]/30 rounded px-1.5 py-0.5">
                    {source.id}
                  </span>
                  <div className="min-w-0 flex-1">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-gray-200 hover:text-[#1FB8CD] transition-colors inline-flex items-center gap-1 break-words"
                    >
                      {source.title || source.domain || source.url}
                      <ExternalLink className="w-3.5 h-3.5 flex-none" />
                    </a>
                    <div className="text-xs text-gray-500 mt-0.5 break-all">{source.url}</div>
                    {source.snippet && (
                      <p className="text-sm text-gray-400 mt-2">{source.snippet}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showMethodology && report.methodology.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-white mb-3">Methodology</h2>
          <div className="bg-[#191A1A] border border-gray-800 rounded-lg divide-y divide-gray-800">
            {report.methodology.map((step, index) => (
              <div key={index} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <span className="flex-none text-xs text-gray-500 font-mono w-14">
                  {step.event}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-gray-300">{step.agent || 'system'}</span>
                  {step.tool && <span className="text-gray-500"> · {step.tool}</span>}
                  {step.detail && (
                    <p className="text-gray-500 text-xs mt-0.5 break-words">{step.detail}</p>
                  )}
                </div>
                {typeof step.duration_ms === 'number' && (
                  <span className="flex-none text-xs text-gray-500">{step.duration_ms}ms</span>
                )}
                {step.status && (
                  <span className="flex-none text-xs text-gray-500">{step.status}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
