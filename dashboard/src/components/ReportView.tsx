import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, Info, Quote } from 'lucide-react';
import type { Report } from '../lib/types';

interface ReportViewProps {
  report: Report;
  showMethodology?: boolean;
}

function confidenceClasses(value: number | null | undefined) {
  const confidence = value ?? 0;
  if (confidence >= 0.7) return 'text-success bg-success/10 border-success/30';
  if (confidence >= 0.4) return 'text-amber-400 bg-amber-400/10 border-amber-400/30';
  return 'text-danger bg-danger/10 border-danger/30';
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
        <span className="text-xs px-2.5 py-1 rounded-full border border-line-strong text-ink-muted bg-surface">
          {report.source_count} sources
        </span>
        <span className="text-xs px-2.5 py-1 rounded-full border border-line-strong text-ink-muted bg-surface">
          {report.findings.length} findings
        </span>
        <span className="text-xs px-2.5 py-1 rounded-full border border-line-strong text-ink-muted bg-surface">
          {report.verified_count} verified
        </span>
        {report.agent_name && (
          <span className="text-xs px-2.5 py-1 rounded-full border border-line-strong text-ink-muted bg-surface">
            agent: {report.agent_name}
          </span>
        )}
      </div>

      {report.summary && (
        <div className="border-l-2 border-primary-400 pl-4">
          <p className="text-ink leading-relaxed">{report.summary}</p>
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold text-ink mb-3">Findings</h2>
        {report.findings.length === 0 ? (
          <p className="text-sm text-ink-faint">No findings were extracted from this run.</p>
        ) : (
          <ol className="space-y-4">
            {report.findings.map((finding, index) => (
              <li key={index} className="bg-surface border border-line rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <span className="flex-none mt-0.5 text-xs font-semibold text-ink-faint w-5 text-right">
                    {index + 1}.
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-ink leading-relaxed">
                      {finding.text}
                      {finding.source_ids.length > 0 && (
                        <span className="inline-flex flex-wrap gap-1 ml-2 align-middle">
                          {finding.source_ids.map((sourceId) => (
                            <button
                              key={sourceId}
                              type="button"
                              onClick={() => focusSource(sourceId)}
                              className="text-[11px] font-semibold text-primary-400 bg-primary-500/10 hover:bg-primary-500/20 border border-primary-400/30 rounded px-1.5 py-0.5 transition-colors"
                              title={`Jump to source ${sourceId}`}
                            >
                              {sourceId}
                            </button>
                          ))}
                        </span>
                      )}
                    </p>
                    {finding.quote && (
                      <blockquote className="mt-3 flex gap-2 text-sm text-ink-subtle bg-canvas border border-line rounded p-3">
                        <Quote className="w-4 h-4 flex-none mt-0.5 text-ink-faint" />
                        <span className="italic">{finding.quote}</span>
                      </blockquote>
                    )}
                    <div className="mt-2">
                      {finding.verified ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-success">
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
          <h2 className="text-lg font-semibold text-ink mb-3">Disagreements</h2>
          <ul className="space-y-2">
            {report.disagreements.map((item, index) => (
              <li key={index} className="flex gap-2 text-sm text-ink-muted bg-amber-400/5 border border-amber-400/20 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 flex-none mt-0.5 text-amber-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.limitations && (
        <section>
          <h2 className="text-lg font-semibold text-ink mb-3">Limitations</h2>
          <div className="flex gap-2 text-sm text-ink-subtle bg-surface border border-line rounded-lg p-4">
            <Info className="w-4 h-4 flex-none mt-0.5 text-ink-faint" />
            <span>{report.limitations}</span>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold text-ink mb-3">Sources</h2>
        {report.sources.length === 0 ? (
          <p className="text-sm text-ink-faint">No sources were retrieved for this run.</p>
        ) : (
          <div className="space-y-2">
            {report.sources.map((source) => (
              <div
                key={source.id}
                id={`report-source-${source.id}`}
                className={`border rounded-lg p-4 transition-colors ${
                  highlighted === source.id
                    ? 'border-primary-400 bg-primary-500/5'
                    : 'border-line bg-surface'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="flex-none text-[11px] font-semibold text-primary-400 bg-primary-500/10 border border-primary-400/30 rounded px-1.5 py-0.5">
                    {source.id}
                  </span>
                  <div className="min-w-0 flex-1">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-ink hover:text-primary-400 transition-colors inline-flex items-center gap-1 break-words"
                    >
                      {source.title || source.domain || source.url}
                      <ExternalLink className="w-3.5 h-3.5 flex-none" />
                    </a>
                    <div className="text-xs text-ink-faint mt-0.5 break-all">{source.url}</div>
                    {source.snippet && (
                      <p className="text-sm text-ink-subtle mt-2">{source.snippet}</p>
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
          <h2 className="text-lg font-semibold text-ink mb-3">Methodology</h2>
          <div className="bg-surface border border-line rounded-lg divide-y divide-line">
            {report.methodology.map((step, index) => (
              <div key={index} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                <span className="flex-none text-xs text-ink-faint font-mono w-14">
                  {step.event}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-ink-muted">{step.agent || 'system'}</span>
                  {step.tool && <span className="text-ink-faint"> · {step.tool}</span>}
                  {step.detail && (
                    <p className="text-ink-faint text-xs mt-0.5 break-words">{step.detail}</p>
                  )}
                </div>
                {typeof step.duration_ms === 'number' && (
                  <span className="flex-none text-xs text-ink-faint">{step.duration_ms}ms</span>
                )}
                {step.status && (
                  <span className="flex-none text-xs text-ink-faint">{step.status}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
