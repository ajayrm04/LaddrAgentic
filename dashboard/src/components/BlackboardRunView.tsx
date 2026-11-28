import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, Cpu, Trash2, RefreshCw } from 'lucide-react';
import api from '../lib/api';

interface SpanLike {
  id?: number | string;
  agent?: string;
  event_type?: string;
  name?: string;
  input?: any;
  output?: any;
  metadata?: Record<string, any>;
  children?: SpanLike[];
}

interface BlackboardRunViewProps {
  agents: string[];
  promptId: string | null;
  liveAgent: string | null;
  liveOutputsByAgent: Record<string, string>;
  isComplete: boolean;
  spans?: SpanLike[];
}

function flattenSpans(list: SpanLike[], out: SpanLike[] = []): SpanLike[] {
  for (const span of list || []) {
    out.push(span);
    if (span.children && span.children.length) flattenSpans(span.children, out);
  }
  return out;
}

function truncate(value: unknown, limit = 220): string {
  let text: string;
  if (typeof value === 'string') {
    text = value;
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  text = (text || '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function parseThinkResponse(raw: unknown): { action: string; detail: string } {
  const text = typeof raw === 'string' ? raw : truncate(raw, 400);
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object') {
      const type = parsed.type;
      if (type === 'tool') {
        return {
          action: `decision · tool ${parsed.tool ?? ''}`,
          detail: truncate(parsed.params ?? {}),
        };
      }
      if (type === 'finish') {
        return { action: 'decision · finish', detail: truncate(parsed.answer ?? '') };
      }
      if (type === 'delegate') {
        return {
          action: `decision · delegate ${parsed.agent ?? ''}`,
          detail: truncate(parsed.task ?? ''),
        };
      }
      return { action: `decision · ${type ?? 'unknown'}`, detail: truncate(parsed) };
    }
  } catch {
    /* not JSON */
  }
  return { action: 'thinking', detail: truncate(text) };
}

function describeEvent(ev: SpanLike): { label: string; detail?: string; tone: string } {
  const meta = ev.metadata || {};
  switch (ev.event_type) {
    case 'task_start':
      return { label: 'started', tone: 'bg-primary-400' };
    case 'task_complete':
      return { label: 'completed', tone: 'bg-success' };
    case 'task_error':
      return { label: 'error', detail: truncate(meta.error ?? ev.output ?? ''), tone: 'bg-danger' };
    case 'task_cancelled':
      return { label: 'cancelled', tone: 'bg-yellow-400' };
    case 'autonomous_think': {
      const { action, detail } = parseThinkResponse(meta.response ?? ev.output ?? '');
      return { label: action, detail, tone: 'bg-primary-400' };
    }
    case 'tool_call': {
      const tool = meta.tool ?? meta.params?.tool ?? ev.name ?? 'tool';
      return { label: `tool · ${tool}`, detail: truncate(meta.params ?? ev.input ?? ''), tone: 'bg-purple-400' };
    }
    case 'tool_result': {
      const tool = meta.tool ?? meta.params?.tool ?? ev.name ?? 'tool';
      const detail = meta.result ?? ev.output ?? meta.error ?? '';
      return { label: `result · ${tool}`, detail: truncate(detail), tone: meta.error ? 'bg-danger' : 'bg-emerald-400' };
    }
    case 'llm_usage':
      return { label: `tokens · ${meta.tokens ?? 0}`, tone: 'bg-surface-overlay' };
    case 'delegation':
      return { label: `delegated · ${meta.target_agent ?? ''}`, detail: truncate(meta.payload ?? ''), tone: 'bg-yellow-400' };
    default:
      return {
        label: ev.event_type || ev.name || 'event',
        detail: meta.error ? truncate(meta.error) : undefined,
        tone: 'bg-surface-overlay',
      };
  }
}

export default function BlackboardRunView({
  agents,
  promptId,
  liveAgent,
  liveOutputsByAgent,
  isComplete,
  spans = [],
}: BlackboardRunViewProps) {
  const [blackboard, setBlackboard] = useState<Record<string, any>>({});
  const [refreshing, setRefreshing] = useState(false);

  const loadBlackboard = useCallback(async () => {
    if (!promptId) return;
    try {
      const { data } = await api.get<{ blackboard: Record<string, any> }>(`/api/blackboard/${promptId}`);
      setBlackboard(data.blackboard || {});
    } catch {
      /* ignore */
    }
  }, [promptId]);

  useEffect(() => {
    if (!promptId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { data } = await api.get<{ blackboard: Record<string, any> }>(`/api/blackboard/${promptId}`);
        if (!cancelled) setBlackboard(data.blackboard || {});
      } catch {
        /* ignore */
      }
    };
    tick();
    const interval = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [promptId]);

  const eventsByAgent = useMemo(() => {
    const grouped: Record<string, SpanLike[]> = {};
    for (const span of flattenSpans(spans)) {
      const agent = span.agent || (span.metadata?.worker as string | undefined);
      if (!agent) continue;
      (grouped[agent] = grouped[agent] || []).push(span);
    }
    return grouped;
  }, [spans]);

  const bbEntries = useMemo(() => {
    return Object.entries(blackboard).sort((a, b) => {
      const at = (a[1] as any)?.updated_at || '';
      const bt = (b[1] as any)?.updated_at || '';
      return String(at).localeCompare(String(bt));
    });
  }, [blackboard]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadBlackboard();
    setRefreshing(false);
  };

  const handleDelete = async (key: string) => {
    if (!promptId) return;
    try {
      await api.delete(`/api/blackboard/${promptId}/${encodeURIComponent(key)}`);
      setBlackboard((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="h-full w-full p-6 overflow-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {agents.map((agent) => {
          const events = eventsByAgent[agent] || [];
          const live = liveOutputsByAgent[agent] || '';
          const finished = events.some(
            (e) => e.event_type === 'task_complete' || e.event_type === 'task_error'
          );
          const active = !isComplete && !finished && (liveAgent === agent || events.length > 0 || !!live);
          return (
            <div
              key={agent}
              className={`bg-surface-raised border rounded-lg p-4 transition-colors ${
                active ? 'border-primary-400 shadow-[0_0_0_1px_rgba(31,184,205,0.4)]' : 'border-line'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    active ? 'bg-primary-400 animate-pulse' : finished ? 'bg-success' : 'bg-surface-overlay'
                  }`}
                />
                <Cpu className="w-4 h-4 text-primary-400" />
                <span className="text-sm font-semibold text-ink">{agent}</span>
                <span className="text-xs text-ink-faint ml-auto">
                  {active ? 'working…' : finished ? 'done' : isComplete ? 'done' : 'waiting'}
                </span>
              </div>

              <div className="max-h-72 overflow-auto bg-canvas border border-line rounded p-2 space-y-1.5">
                {events.length === 0 && !live && (
                  <p className="text-xs text-ink-faint italic">
                    {active ? 'Waiting for output…' : 'No activity yet.'}
                  </p>
                )}

                {events.map((ev, idx) => {
                  const { label, detail, tone } = describeEvent(ev);
                  return (
                    <div key={`${ev.id ?? idx}-${idx}`} className="flex gap-2 text-[11px] leading-snug">
                      <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${tone}`} />
                      <div className="min-w-0">
                        <span className="text-ink-muted">{label}</span>
                        {detail && (
                          <div className="text-ink-faint break-words whitespace-pre-wrap">{detail}</div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {live && (
                  <div className="mt-2 pt-2 border-t border-line">
                    <div className="text-[10px] uppercase tracking-wide text-primary-400/80 mb-1">
                      live output
                    </div>
                    <pre className="whitespace-pre-wrap break-words text-xs text-ink">
                      {live}
                      {active && (
                        <span className="inline-block w-2 h-3 bg-primary-400 ml-0.5 animate-pulse align-middle" />
                      )}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Central Blackboard */}
      <div className="bg-surface-raised border border-primary-400/40 rounded-lg">
        <div className="px-6 py-4 border-b border-line flex items-center gap-2">
          <Database className="w-4 h-4 text-primary-400" />
          <h2 className="text-lg font-semibold text-ink">Blackboard</h2>
          <span className="text-xs text-ink-faint ml-auto mr-2">{bbEntries.length} keys</span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 hover:bg-surface-overlay rounded text-ink-subtle hover:text-ink transition-colors disabled:opacity-50"
            aria-label="Refresh blackboard"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="p-6">
          {bbEntries.length === 0 ? (
            <p className="text-sm text-ink-faint">Agents will post shared state here as they collaborate.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {bbEntries.map(([key, entry]: any) => (
                <div key={key} className="bg-canvas border border-line rounded p-3">
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <code className="text-sm text-primary-400 font-mono truncate">{key}</code>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-ink-faint">
                        {entry?.updated_by || 'unknown'}
                        {entry?.updated_at ? ` · ${new Date(entry.updated_at).toLocaleTimeString()}` : ''}
                      </span>
                      <button
                        onClick={() => handleDelete(key)}
                        className="p-1 hover:bg-surface-overlay rounded text-ink-faint hover:text-danger transition-colors"
                        aria-label={`Delete ${key}`}
                        title="Delete entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <pre className="text-xs text-ink-muted whitespace-pre-wrap break-words">
                    {typeof entry?.value === 'string' ? entry.value : JSON.stringify(entry?.value, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
