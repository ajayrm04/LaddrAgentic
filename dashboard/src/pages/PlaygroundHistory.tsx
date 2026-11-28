import { usePlaygrounds } from '../lib/queries/playground';
import { Clock, CheckCircle, XCircle, Loader2, Play, ChevronDown, ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Fragment, useState } from 'react';
import { usePlaygroundTraces } from '../lib/hooks/useWebSocket';

export default function PlaygroundHistory() {
  const { data: playgrounds, isLoading } = usePlaygrounds(50);
  const navigate = useNavigate();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    const next = new Set(expandedRows);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedRows(next);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-success" />;
      case 'error':
      case 'failed':
        return <XCircle className="w-5 h-5 text-danger" />;
      case 'running':
        return <Loader2 className="w-5 h-5 text-info animate-spin" />;
      case 'canceled':
        return <XCircle className="w-5 h-5 text-ink-subtle" />;
      default:
        return <Clock className="w-5 h-5 text-ink-subtle" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-success bg-success/10';
      case 'error':
      case 'failed':
        return 'text-danger bg-danger/10';
      case 'running':
        return 'text-info bg-info/10';
      case 'canceled':
        return 'text-ink-subtle bg-surface-overlay/10';
      default:
        return 'text-ink-subtle bg-surface-overlay/10';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-ink-subtle">Loading playground history...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 bg-surface p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Playground History</h1>
          <p className="text-sm text-ink-subtle mt-1">View past playground executions</p>
        </div>
        <Link
          to="/playground"
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-ink rounded-lg transition-colors"
        >
          <Play className="w-4 h-4" />
          New Run
        </Link>
      </div>

      <div className="bg-surface-raised rounded-lg border border-line overflow-hidden">
        {!playgrounds || playgrounds.length === 0 ? (
          <div className="text-center py-12 text-ink-subtle">
            <Clock className="w-12 h-12 mx-auto mb-4 text-ink-faint" />
            <p>No playground runs found</p>
            <Link
              to="/playground"
              className="inline-flex items-center gap-2 mt-4 text-primary-400 hover:text-primary-400"
            >
              <Play className="w-4 h-4" />
              Start your first run
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-surface">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-ink-subtle uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-ink-subtle uppercase tracking-wider">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-ink-subtle uppercase tracking-wider">
                  Agent/Mode
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-ink-subtle uppercase tracking-wider">
                  Tokens
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-ink-subtle uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-ink-subtle uppercase tracking-wider">
                  Duration
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {playgrounds.map((playground) => {
                const duration = playground.completed_at && playground.created_at
                  ? Math.round(
                      (new Date(playground.completed_at).getTime() -
                        new Date(playground.created_at).getTime()) /
                        1000
                    )
                  : null;
                const isExpanded = expandedRows.has(playground.prompt_id);

                return (
                  <Fragment key={playground.prompt_id}>
                    <tr
                      className="hover:bg-surface-overlay transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleRow(playground.prompt_id); }}
                            className="p-1 rounded hover:bg-surface-overlay/20"
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-ink-muted" /> : <ChevronRight className="w-4 h-4 text-ink-faint" />}
                          </button>
                          {getStatusIcon(playground.status)}
                          <span className={`text-xs px-2 py-1 rounded font-medium ${getStatusColor(playground.status)}`}>
                            {playground.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4" onClick={() => navigate(`/playground-history/${playground.prompt_id}`)}>
                        <code className="text-sm text-ink-muted font-mono">{playground.prompt_id.slice(0, 8)}</code>
                      </td>
                      <td className="px-6 py-4" onClick={() => navigate(`/playground-history/${playground.prompt_id}`)}>
                        <div className="text-ink font-medium">{playground.prompt_name}</div>
                      </td>
                      <td className="px-6 py-4" onClick={() => navigate(`/playground-history/${playground.prompt_id}`)}>
                        {playground.token_usage?.total_tokens ? (
                          <span className="text-ink-muted">{playground.token_usage.total_tokens.toLocaleString()}</span>
                        ) : (
                          <span className="text-ink-faint">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-ink-subtle" onClick={() => navigate(`/playground-history/${playground.prompt_id}`)}>
                        {playground.created_at ? format(new Date(playground.created_at), 'MMM d, HH:mm:ss') : '-'}
                      </td>
                      <td className="px-6 py-4 text-ink-subtle" onClick={() => navigate(`/playground-history/${playground.prompt_id}`)}>
                        {duration !== null ? `${duration}s` : '-'}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-canvas">
                        <td colSpan={6} className="px-6 py-4">
                          <ExpandedDetails playground={playground} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ExpandedDetails({ playground }: { playground: any }) {
  // fetch traces for this playground run (live or historical)
  const { traces } = usePlaygroundTraces(playground.prompt_id || null);

  // traces shape: [{ spans: Span[] }] in PlaygroundDetail; fall back to empty
  const spans = traces && traces.length > 0 && traces[0].spans ? traces[0].spans : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <PrettyValue value={playground.inputs ?? {}} label="Inputs" />
        </div>

        <div>
          <PrettyValue value={playground.outputs ?? {}} label="Outputs" />
        </div>
      </div>

      <div>
        <div className="text-xs text-ink-subtle">Token Usage</div>
        <div className="mt-2 text-xs text-ink-muted bg-canvas p-3 rounded">
          <div>Total: <span className="font-semibold">{playground.token_usage?.total_tokens ?? 0}</span></div>
          <div>Prompt: {playground.token_usage?.prompt_tokens ?? 0}</div>
          <div>Completion: {playground.token_usage?.completion_tokens ?? 0}</div>
        </div>
      </div>

      <div>
        <div className="text-xs text-ink-subtle mb-2">Traces</div>
        {spans.length === 0 ? (
          <div className="text-xs text-ink-faint">No trace spans available for this run.</div>
        ) : (
          <div className="bg-canvas rounded p-2 space-y-2 max-h-72 overflow-auto">
            {spans.map((s: any, i: number) => (
              <SpanNode key={`${s.id}-${i}`} span={s} depth={0} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Try to parse a JSON string; returns parsed value or null
function tryParseJson(value: any): any {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

// Render a value cleanly: strings as text, objects as pretty JSON in a scroll box
function PrettyValue({ value, label }: { value: any; label: string }) {
  const parsed = tryParseJson(value);
  const obj = parsed !== null ? parsed : (typeof value === 'object' ? value : null);
  const isStr = typeof value === 'string' && parsed === null;

  if (isStr) {
    return (
      <div className="mb-2">
        <div className="text-xs text-ink-subtle mb-1">{label}</div>
        <div className="text-xs text-ink bg-canvas p-3 rounded border border-line whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
          {value}
        </div>
      </div>
    );
  }

  if (obj && typeof obj === 'object') {
    // autonomous_think style response handling
    if (obj.type === 'tool' && obj.tool) {
      return (
        <div className="mb-2">
          <div className="text-xs text-ink-subtle mb-1">{label}</div>
          <div className="text-xs bg-canvas p-3 rounded border border-line space-y-1">
            <div><span className="text-warning font-semibold">Tool call:</span> <span className="text-ink">{obj.tool}</span></div>
            {obj.params && Object.keys(obj.params).length > 0 && (
              <div>
                <div className="text-ink-faint mt-1">Params:</div>
                <pre className="text-ink whitespace-pre-wrap mt-1">{JSON.stringify(obj.params, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      );
    }
    if (obj.type === 'finish' && obj.answer) {
      return (
        <div className="mb-2">
          <div className="text-xs text-ink-subtle mb-1">{label}</div>
          <div className="text-xs text-ink bg-canvas p-3 rounded border border-line whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
            {obj.answer}
          </div>
        </div>
      );
    }
    // generic object
    return (
      <div className="mb-2">
        <div className="text-xs text-ink-subtle mb-1">{label}</div>
        <pre className="text-xs text-ink bg-canvas p-3 rounded border border-line whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{JSON.stringify(obj, null, 2)}</pre>
      </div>
    );
  }

  return (
    <div className="mb-2">
      <div className="text-xs text-ink-subtle mb-1">{label}</div>
      <div className="text-xs text-ink bg-canvas p-3 rounded border border-line whitespace-pre-wrap break-words">
        {String(value)}
      </div>
    </div>
  );
}

// Render metadata as key/value rows, hiding huge nested blobs behind a toggle
function MetadataView({ metadata }: { metadata: any }) {
  const [showRaw, setShowRaw] = useState(false);
  if (!metadata || typeof metadata !== 'object') return null;

  // Pull out a few well-known scalar fields to show as chips
  const scalarKeys = ['duration_ms', 'tokens', 'cost', 'provider', 'model', 'prompt_tokens',
    'completion_tokens', 'total_tokens', 'tool', 'status', 'iteration', 'worker', 'started_at',
    'ended_at', 'result_preview'];
  const scalars: [string, any][] = [];
  const nested: [string, any][] = [];
  for (const [k, v] of Object.entries(metadata)) {
    if (v === null || v === undefined) continue;
    if (scalarKeys.includes(k)) scalars.push([k, v]);
    else nested.push([k, v]);
  }

  return (
    <div className="mb-2">
      <div className="text-xs text-ink-subtle mb-1">Metadata</div>
      <div className="bg-canvas p-3 rounded border border-line space-y-2">
        {scalars.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {scalars.map(([k, v]) => (
              <div key={k} className="text-xs">
                <span className="text-ink-faint">{k.replace(/_/g, ' ')}:</span>{' '}
                <span className={k === 'status' ? (v === 'success' ? 'text-success' : 'text-warning') : 'text-ink'}>
                  {typeof v === 'number' ? v.toLocaleString() : String(v)}
                </span>
              </div>
            ))}
          </div>
        )}
        {nested.map(([k, v]) => (
          <div key={k}>
            <div className="text-ink-faint text-xs mb-1">{k.replace(/_/g, ' ')}:</div>
            <pre className="text-ink whitespace-pre-wrap text-xs max-h-40 overflow-y-auto">{typeof v === 'string' ? v : JSON.stringify(v, null, 2)}</pre>
          </div>
        ))}
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="text-[10px] text-ink-faint hover:text-ink-muted underline"
        >
          {showRaw ? 'Hide raw metadata' : 'Show raw metadata'}
        </button>
        {showRaw && (
          <pre className="text-[10px] text-ink-faint whitespace-pre-wrap max-h-40 overflow-y-auto mt-1">{JSON.stringify(metadata, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}

function SpanNode({ span, depth }: { span: any; depth: number }) {
  const [open, setOpen] = useState(true);
  const hasChildren = span.children && span.children.length > 0;

  // autonomous_think response may live in metadata.response
  const thinkResponse = span.event_type === 'autonomous_think' ? span.metadata?.response : null;

  return (
    <div>
      <div
        className="flex items-center gap-3 py-2 px-3 hover:bg-canvas/10 rounded cursor-pointer"
        style={{ paddingLeft: `${depth * 16}px` }}
        onClick={() => setOpen(!open)}
      >
        <div className="w-4">
          {hasChildren ? (open ? <ChevronDown className="w-4 h-4 text-ink-muted" /> : <ChevronRight className="w-4 h-4 text-ink-faint" />) : <div className="w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-ink truncate">{span.name || span.event_type}</div>
          <div className="text-xs text-ink-subtle">{span.agent || ''} — {span.event_type}</div>
        </div>
        <div className="text-xs text-ink-subtle">
          {span.metadata?.tokens ? `${span.metadata.tokens} tokens` : ''}
        </div>
      </div>

      {open && (
        <div className="ml-8 mt-2 mb-2 text-xs text-ink-muted bg-canvas p-3 rounded">
          <MetadataView metadata={span.metadata} />

          {/* autonomous_think: render response nicely */}
          {thinkResponse != null && (
            <PrettyValue value={thinkResponse} label="Reasoning Response" />
          )}

          {/* Input / Output */}
          {span.input != null && span.event_type !== 'autonomous_think' && (
            <PrettyValue value={span.input} label="Input" />
          )}

          {span.output != null && span.event_type !== 'autonomous_think' && (
            <PrettyValue value={span.output} label="Output" />
          )}

          {/* Children */}
          {hasChildren && (
            <div className="mt-2 space-y-1">
              {span.children.map((c: any) => (
                <SpanNode key={c.id} span={c} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
