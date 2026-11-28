import { useParams, Link } from 'react-router-dom';
import { useBatch } from '../lib/queries/batches';
import { useBatchTraces } from '../lib/hooks/useWebSocket';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  Activity,
  Database,
  Zap,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import clsx from 'clsx';
import { Badge, Card, CardHeader, EmptyState, Skeleton } from '../components/ui';

interface Span {
  id: number;
  name: string;
  type: 'agent' | 'tool' | 'llm' | 'reasoning' | 'event';
  start_time: string;
  agent: string;
  event_type: string;
  input?: any;
  output?: any;
  metadata: {
    duration_ms?: number;
    tokens?: number;
    cost?: number;
    [key: string]: any;
  };
  children: Span[];
}

interface SpanTreeNodeProps {
  span: Span;
  depth: number;
}

function SpanTreeNode({ span, depth }: SpanTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = span.children && span.children.length > 0;

  return (
    <>
      <SpanRow
        span={span}
        depth={depth}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded(!isExpanded)}
      />
      {hasChildren &&
        isExpanded &&
        span.children.map((child) => (
          <SpanTreeNode key={child.id} span={child} depth={depth + 1} />
        ))}
    </>
  );
}

interface SpanRowProps {
  span: Span;
  depth: number;
  isExpanded: boolean;
  onToggle: () => void;
}

function SpanRow({ span, depth, isExpanded, onToggle }: SpanRowProps) {
  const hasChildren = span.children && span.children.length > 0;
  const isInteractive = hasChildren || Boolean(span.input || span.output);

  const getIcon = () => {
    switch (span.type) {
      case 'agent':
        return <Activity className="w-4 h-4 text-primary-400" />;
      case 'tool':
        return <Database className="w-4 h-4 text-warning" />;
      case 'llm':
        return <Zap className="w-4 h-4 text-success" />;
      case 'reasoning':
        return <Activity className="w-4 h-4 text-info" />;
      default:
        return <span className="w-2 h-2 rounded-full bg-ink-faint inline-block" />;
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return null;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="border-b border-line-subtle last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={hasChildren ? isExpanded : undefined}
        className={clsx(
          'flex items-center gap-3 py-3 pr-4 transition-colors',
          isInteractive
            ? 'cursor-pointer hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:outline-none'
            : 'cursor-default'
        )}
        style={{ paddingLeft: `${depth * 24 + 16}px` }}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <div className="w-4 h-4 flex-shrink-0">
          {hasChildren &&
            (isExpanded ? (
              <ChevronDown className="w-4 h-4 text-ink-subtle" />
            ) : (
              <ChevronRight className="w-4 h-4 text-ink-subtle" />
            ))}
        </div>

        {getIcon()}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink truncate">
              {span.name || span.event_type}
            </span>
            <span className="text-2xs font-semibold uppercase tracking-wider text-ink-faint">
              {span.type}
            </span>
          </div>
          {span.agent && (
            <div className="text-xs text-ink-subtle mt-0.5 truncate">{span.agent}</div>
          )}
        </div>

        <div className="flex items-center gap-4 text-xs text-ink-subtle tabular-nums shrink-0">
          {typeof span.metadata?.tokens === 'number' && (
            <div className="flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-ink-faint" />
              <span>{span.metadata.tokens.toLocaleString()}</span>
            </div>
          )}
          {span.metadata?.duration_ms && (
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-ink-faint" />
              <span>{formatDuration(span.metadata.duration_ms)}</span>
            </div>
          )}
        </div>
      </div>

      {isExpanded &&
        (span.input ||
          span.output ||
          span.event_type === 'llm_usage' ||
          span.event_type === 'autonomous_think') && (
          <div
            className="px-4 pb-3 bg-canvas"
            style={{ paddingLeft: `${depth * 24 + 72}px` }}
          >
            {span.event_type === 'llm_usage' && span.metadata && (
              <div className="mb-2">
                <div className="caption mb-1">LLM Usage</div>
                <div className="text-xs bg-surface border border-line rounded-md p-3 space-y-1.5">
                  {span.metadata.provider && (
                    <div className="flex gap-3">
                      <span className="text-ink-faint w-24 shrink-0">Provider</span>
                      <span className="text-ink-muted">{span.metadata.provider}</span>
                    </div>
                  )}
                  {span.metadata.model && (
                    <div className="flex gap-3">
                      <span className="text-ink-faint w-24 shrink-0">Model</span>
                      <span className="text-ink-muted">{span.metadata.model}</span>
                    </div>
                  )}
                  {span.metadata.total_tokens != null && (
                    <div className="flex gap-3">
                      <span className="text-ink-faint w-24 shrink-0">Total tokens</span>
                      <span className="font-semibold text-primary-300 tabular-nums">
                        {Number(span.metadata.total_tokens).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {span.input && (
              <div className="mb-2">
                <div className="caption mb-1">Input</div>
                <pre className="text-xs text-ink-muted bg-surface border border-line rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-words">
                  {typeof span.input === 'string'
                    ? span.input
                    : JSON.stringify(span.input, null, 2)}
                </pre>
              </div>
            )}

            {span.output && (
              <div>
                <div className="caption mb-1">Output</div>
                <pre className="text-xs text-ink-muted bg-surface border border-line rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-words">
                  {typeof span.output === 'string'
                    ? span.output
                    : JSON.stringify(span.output, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
    </div>
  );
}

export default function BatchDetail() {
  const { batchId } = useParams<{ batchId: string }>();
  const { data: batch, isLoading } = useBatch(batchId!);
  const { traces, isConnected, isComplete } = useBatchTraces(batchId || null);

  const statusAppearance = (() => {
    switch (batch?.status) {
      case 'completed':
        return { icon: <CheckCircle className="w-7 h-7 text-success" />, tone: 'success' as const, label: 'Completed' };
      case 'failed':
        return { icon: <XCircle className="w-7 h-7 text-danger" />, tone: 'danger' as const, label: 'Failed' };
      case 'running':
      case 'submitted':
        return { icon: <Loader2 className="w-7 h-7 text-primary-400 animate-spin" />, tone: 'primary' as const, label: batch?.status || 'Running' };
      default:
        return { icon: <Clock className="w-7 h-7 text-ink-subtle" />, tone: 'neutral' as const, label: batch?.status || 'Pending' };
    }
  })();

  const allSpans: Span[] =
    traces.length > 0 && traces[0].spans ? traces[0].spans : [];

  const calculateTotalTokens = (spanList: Span[]): number =>
    spanList.reduce((sum, span) => {
      const spanTokens = span.metadata?.tokens || 0;
      const childTokens = calculateTotalTokens(span.children || []);
      return sum + spanTokens + childTokens;
    }, 0);

  const calculateTotalDuration = (spanList: Span[]): number => {
    if (spanList.length === 0) return 0;
    try {
      const firstStartTime = new Date(spanList[0].start_time).getTime();
      const lastStartTime = new Date(
        spanList[spanList.length - 1].start_time
      ).getTime();
      return lastStartTime - firstStartTime;
    } catch {
      return 0;
    }
  };

  const totalTokens = calculateTotalTokens(allSpans);
  const totalDuration = calculateTotalDuration(allSpans);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <Card className="p-6">
          <Skeleton className="h-7 w-40 mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        </Card>
        <Card className="p-6">
          <Skeleton lines={6} />
        </Card>
      </div>
    );
  }

  if (!batch) {
    return (
      <EmptyState
        icon={<Layers className="h-5 w-5" />}
        title="Batch not found"
        description="This batch may have been deleted or the ID is incorrect."
        action={
          <Link to="/batches" className="btn-secondary">
            <ArrowLeft className="h-4 w-4" />
            Back to batches
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3 animate-fade-in-slide">
        <Link
          to="/batches"
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line
            text-ink-muted transition-colors hover:bg-surface-overlay hover:text-ink"
          aria-label="Back to batches"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="page-title">Batch Details</h1>
          <code className="mt-1 block truncate text-xs text-ink-subtle">
            {batch.batch_id}
          </code>
        </div>
        <Badge tone={statusAppearance.tone} dot className="mt-1.5 capitalize">
          {statusAppearance.label}
        </Badge>
      </div>

      {/* Summary */}
      <Card className="p-5">
        <div className="flex items-center gap-4 mb-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-overlay">
            {statusAppearance.icon}
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold capitalize text-ink">
              {batch.status}
            </h2>
            <p className="text-sm text-ink-subtle truncate">
              Agent: {batch.agent_name}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <h3 className="caption mb-1.5">Created</h3>
            <p className="text-sm text-ink tabular-nums">
              {batch.created_at
                ? format(new Date(batch.created_at), 'MMM d, yyyy HH:mm:ss')
                : '—'}
            </p>
          </div>
          {batch.completed_at && (
            <div>
              <h3 className="caption mb-1.5">Completed</h3>
              <p className="text-sm text-ink tabular-nums">
                {format(new Date(batch.completed_at), 'MMM d, yyyy HH:mm:ss')}
              </p>
            </div>
          )}
          <div>
            <h3 className="caption mb-1.5">Tasks</h3>
            <p className="text-sm text-ink tabular-nums">{batch.task_count}</p>
          </div>
          <div>
            <h3 className="caption mb-1.5">Jobs</h3>
            <p className="text-sm text-ink tabular-nums">
              {batch.job_ids?.length || 0}
            </p>
          </div>
        </div>
      </Card>

      {/* Job IDs */}
      {batch.job_ids && batch.job_ids.length > 0 && (
        <Card>
          <CardHeader
            icon={<Layers className="h-4 w-4" />}
            title="Jobs in Batch"
            subtitle="Each job is an individual task — open one to see its full trace."
          />
          <div className="p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {batch.job_ids.map((jobId: string) => (
                <Link
                  key={jobId}
                  to={`/traces?job_id=${encodeURIComponent(jobId)}`}
                  className="group flex items-center justify-between rounded-lg border border-line bg-surface-raised
                    px-4 py-3 transition-all duration-150 hover:border-primary-400/40 hover:bg-surface-overlay
                    focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:outline-none"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-sm font-medium text-ink">
                      {jobId.slice(0, 8)}…
                    </div>
                    <div className="mt-1 text-2xs uppercase tracking-wider text-ink-faint">
                      Job ID
                    </div>
                  </div>
                  <ExternalLink className="ml-3 h-4 w-4 shrink-0 text-ink-faint transition-colors group-hover:text-primary-400" />
                </Link>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Live traces */}
      {(batch.status === 'running' || allSpans.length > 0) && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div className="flex items-center gap-3">
              <h2 className="section-title">Traces</h2>
              {isConnected && !isComplete && (
                <Badge tone="primary" dot>
                  Live
                </Badge>
              )}
              {isComplete && <Badge tone="success">Completed</Badge>}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-ink-subtle tabular-nums">
              {allSpans.length > 0 && (
                <>
                  <span className="flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5 text-ink-faint" />
                    {allSpans.length} spans
                  </span>
                  {totalTokens > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-ink-faint" />
                      {totalTokens.toLocaleString()} tokens
                    </span>
                  )}
                  {isComplete && totalDuration > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-ink-faint" />
                      {(totalDuration / 1000).toFixed(2)}s
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="h-[45vh] overflow-y-auto bg-canvas lg:h-[55vh]">
            {allSpans.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <Activity className="mx-auto mb-3 h-10 w-10 text-ink-faint opacity-60" />
                  <p className="text-sm text-ink-subtle">Waiting for traces…</p>
                  <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-400"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-1">
                {allSpans.map((span, index) => (
                  <div
                    key={`${span.id}-${index}`}
                    className="opacity-0 animate-[fadeInSlide_0.3s_ease-out_forwards]"
                    style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}
                  >
                    <SpanTreeNode span={span} depth={0} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Outputs */}
      {batch.outputs && (
        <Card>
          <CardHeader title="Outputs" />
          <div className="p-5">
            <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-canvas p-4 font-mono text-xs leading-relaxed text-ink-muted">
              {typeof batch.outputs === 'string'
                ? batch.outputs
                : JSON.stringify(batch.outputs, null, 2)}
            </pre>
          </div>
        </Card>
      )}
    </div>
  );
}
