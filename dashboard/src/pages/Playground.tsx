import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { format } from 'date-fns';
import {
  Play,
  ChevronDown,
  ChevronRight,
  Clock,
  Zap,
  Database,
  Activity,
  Code,
  Brain,
  X,
  StopCircle,
  GitBranch,
  FileText,
  Copy,
  Loader2,
} from "lucide-react";
import { Link } from "react-router-dom";
import BlackboardRunView from "../components/BlackboardRunView";
import { Card, CardBody, CardHeader, PageHeader } from "../components/ui";
import { useAgents } from "../lib/queries/agents";
import {
  useRunPlayground,
  useCancelPlayground,
} from "../lib/queries/playground.ts";
import { usePlaygroundTraces } from "../lib/hooks/useWebSocket";
interface Span {
  id: number;
  name: string;
  type: "agent" | "tool" | "llm" | "reasoning" | "event";
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

interface SpanRowProps {
  span: Span;
  depth: number;
  isExpanded: boolean;
  onToggle: () => void;
}

const fmtNumber = (v: any) => {
  if (v == null) return "";
  return typeof v === "number" && !isNaN(v) ? v.toLocaleString() : String(v);
};

const formatFinalOutput = (value: any): string => {
  if (typeof value !== "string") {
    return JSON.stringify(value, null, 2) ?? String(value);
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
  } catch {
    return value;
  }
};

function flattenSpans(list: Span[], out: Span[] = []): Span[] {
  for (const span of list || []) {
    out.push(span);
    if (span.children && span.children.length) flattenSpans(span.children, out);
  }
  return out;
}

/** Pull the best available answer out of the recorded trace spans. */
function bestAnswerFromSpans(spans: Span[]): any | null {
  const flat = flattenSpans(spans);
  const finishes: any[] = [];
  for (const span of flat) {
    if (span.event_type !== "autonomous_think") continue;
    const raw = (span.metadata as any)?.response;
    let parsed: any = raw;
    if (typeof raw === "string") {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
    }
    if (parsed && typeof parsed === "object" && parsed.type === "finish" && parsed.answer != null) {
      finishes.push(parsed.answer);
    }
  }
  if (finishes.length) return finishes[finishes.length - 1];

  const completes = flat.filter(
    (span) => span.event_type === "task_complete" && span.output != null
  );
  if (completes.length) return completes[completes.length - 1].output;
  return null;
}

/** Split a stored result into an answer and an optional error message. */
function normalizeOutcome(value: any): { answer: any; error: string | null } {
  let answer: any = value;
  let error: string | null = null;

  if (answer && typeof answer === "object" && !Array.isArray(answer)) {
    const keys = Object.keys(answer);
    if (answer.error != null) error = String(answer.error);
    if ("result" in answer) answer = answer.result;
    else if ("answer" in answer) answer = answer.answer;
    else if (error != null && keys.every((k) => k === "error")) answer = null;
  }

  if (answer && typeof answer === "object" && !Array.isArray(answer) && Object.keys(answer).length === 0) {
    answer = null;
  }
  if (typeof answer === "string" && answer.trim() === "") answer = null;

  return { answer, error };
}

const MODE_OPTIONS = [
  { id: "single", label: "Single Agent", hint: "Run with one agent" },
  { id: "sequential", label: "Sequential Run", hint: "Chain multiple agents" },
  {
    id: "blackboard",
    label: "Blackboard Run",
    hint: "Agents collaborate via shared state (parallel)",
  },
] as const;

/** Small copy-to-clipboard control used across output blocks. */
function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={clsx("btn-ghost h-7 px-2 text-xs", className)}
      aria-label={copied ? "Copied to clipboard" : "Copy to clipboard"}
      title="Copy to clipboard"
    >
      <Copy className="h-3.5 w-3.5" />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function SpanRow({ span, depth, isExpanded, onToggle }: SpanRowProps) {
  const hasChildren = span.children && span.children.length > 0;

  // Get icon based on span type
  const getIcon = () => {
    switch (span.type) {
      case "agent":
        return <Activity className="w-4 h-4 text-primary-400" />;
      case "tool":
        return <Code className="w-4 h-4 text-info" />;
      case "llm":
        return <Brain className="w-4 h-4 text-success" />;
      case "reasoning":
        return <Database className="w-4 h-4 text-warning" />;
      default:
        return <div className="w-4 h-4 rounded-full bg-surface-overlay" />;
    }
  };

  // Format duration
  const formatDuration = (ms?: number) => {
    if (!ms) return null;
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="border-b border-line">
      {/* Main row */}
      <div
        className="flex items-center gap-3 py-3 px-4 hover:bg-surface-raised cursor-pointer transition-colors"
        style={{ paddingLeft: `${depth * 24 + 16}px` }}
        onClick={onToggle}
      >
        {/* Expand/collapse icon */}
        <div className="w-4 h-4 flex-shrink-0">
          {hasChildren &&
            (isExpanded ? (
              <ChevronDown className="w-4 h-4 text-ink-subtle" />
            ) : (
              <ChevronRight className="w-4 h-4 text-ink-subtle" />
            ))}
        </div>

        {/* Type icon */}
        <div className="flex-shrink-0">{getIcon()}</div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink truncate">
              {span.name}
            </span>
            <span className="text-xs text-ink-faint">{span.type}</span>
          </div>
        </div>

        {/* Metrics */}
        <div className="flex items-center gap-4 flex-shrink-0">
          {span.metadata.tokens && (
            <div className="flex items-center gap-1.5 text-xs text-ink-subtle">
              <Zap className="w-3.5 h-3.5" />
              <span>{fmtNumber(span.metadata.tokens)}</span>
            </div>
          )}
          {span.metadata.duration_ms && (
            <div className="flex items-center gap-1.5 text-xs text-ink-subtle">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatDuration(span.metadata.duration_ms)}</span>
            </div>
          )}
          {span.metadata.cost && (
            <div className="text-xs text-ink-subtle">
              ${span.metadata.cost.toFixed(4)}
            </div>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div
          className="bg-canvas px-4 py-3 border-t border-line"
          style={{ paddingLeft: `${depth * 24 + 16}px` }}
        >
          <div className="space-y-3 text-sm">
            {/* For llm_usage - show provider, model, token details */}
            {span.event_type === "llm_usage" && span.metadata && (
              <div>
                <div className="text-xs font-semibold text-ink-subtle mb-1">
                  LLM Usage
                </div>
                <div className="bg-surface rounded p-2 text-xs border border-line space-y-1">
                  {span.metadata.provider && (
                    <div>
                      <span className="text-ink-faint">Provider:</span>
                      <span className="ml-2 text-ink-muted">
                        {span.metadata.provider}
                      </span>
                    </div>
                  )}
                  {span.metadata.model && (
                    <div>
                      <span className="text-ink-faint">Model:</span>
                      <span className="ml-2 text-ink-muted">
                        {span.metadata.model}
                      </span>
                    </div>
                  )}
                  {span.metadata.prompt_tokens !== undefined && (
                    <div>
                      <span className="text-ink-faint">Prompt Tokens:</span>
                      <span className="ml-2 text-ink-muted">
                        {fmtNumber(span.metadata.prompt_tokens)}
                      </span>
                    </div>
                  )}
                  {span.metadata.completion_tokens !== undefined && (
                    <div>
                      <span className="text-ink-faint">Completion Tokens:</span>
                      <span className="ml-2 text-ink-muted">
                        {fmtNumber(span.metadata.completion_tokens)}
                      </span>
                    </div>
                  )}
                  {span.metadata.total_tokens !== undefined && (
                    <div>
                      <span className="text-ink-faint">Total Tokens:</span>
                      <span className="ml-2 text-primary-400 font-semibold">
                        {fmtNumber(span.metadata.total_tokens)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* For autonomous_think - show response and timing */}
            {span.event_type === "autonomous_think" && span.metadata && (
              <>
                {span.metadata.response && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs font-semibold text-ink-subtle">
                        Reasoning Response
                        <span className="ml-2 text-ink-faint font-normal">
                          (
                          {typeof span.metadata.response === "string"
                            ? span.metadata.response.length.toLocaleString()
                            : JSON.stringify(
                                span.metadata.response
                              ).length.toLocaleString()}{" "}
                          chars)
                        </span>
                      </div>
                      <CopyButton
                        text={
                          typeof span.metadata.response === "string"
                            ? span.metadata.response
                            : JSON.stringify(span.metadata.response, null, 2)
                        }
                      />
                    </div>
                    <div className="bg-surface rounded p-3 border border-line max-h-96 overflow-y-auto">
                      <pre className="text-xs text-ink-muted whitespace-pre-wrap break-words">
                        {typeof span.metadata.response === "string"
                          ? span.metadata.response
                          : JSON.stringify(span.metadata.response, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
                {span.metadata.iteration !== undefined && (
                  <div className="bg-surface rounded p-2 text-xs border border-line mt-2">
                    <span className="text-ink-faint">Iteration:</span>
                    <span className="ml-2 text-ink-muted">
                      {span.metadata.iteration}
                    </span>
                    {span.metadata.duration_ms && (
                      <>
                        <span className="text-ink-faint ml-4">Duration:</span>
                        <span className="ml-2 text-ink-muted">
                          {(span.metadata.duration_ms / 1000).toFixed(2)}s
                        </span>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Standard Input (for other event types) */}
            {span.event_type !== "llm_usage" &&
              span.event_type !== "autonomous_think" &&
              span.input &&
              Object.keys(span.input).length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-ink-subtle mb-1">
                    Input
                  </div>
                  <pre className="bg-surface rounded p-2 text-xs text-ink-muted overflow-x-auto border border-line">
                    {JSON.stringify(span.input, null, 2)}
                  </pre>
                </div>
              )}

            {/* Standard Output (for other event types) */}
            {span.event_type !== "llm_usage" &&
              span.event_type !== "autonomous_think" &&
              span.output && (
                <div>
                  <div className="text-xs font-semibold text-ink-subtle mb-1">
                    Output
                  </div>
                  <pre className="bg-surface rounded p-2 text-xs text-ink-muted overflow-x-auto border border-line">
                    {JSON.stringify(span.output, null, 2)}
                  </pre>
                </div>
              )}

            {/* Metadata */}
            <div>
              <div className="text-xs font-semibold text-ink-subtle mb-1">
                Metadata
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-ink-faint">Agent:</span>
                  <span className="ml-2 text-ink-muted">{span.agent}</span>
                </div>
                <div>
                  <span className="text-ink-faint">Event:</span>
                  <span className="ml-2 text-ink-muted">{span.event_type}</span>
                </div>
                <div>
                  <span className="text-ink-faint">Time:</span>
                  <span className="ml-2 text-ink-muted">
                    {new Date(span.start_time).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Render children */}
      {isExpanded && hasChildren && (
        <div>
          {span.children.map((child) => (
            <SpanTreeNode key={child.id} span={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function SpanTreeNode({ span, depth }: { span: Span; depth: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <SpanRow
      span={span}
      depth={depth}
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded(!isExpanded)}
    />
  );
}

export default function Playground() {
  const { data: agents } = useAgents();
  const runPlayground = useRunPlayground();
  const cancelPlayground = useCancelPlayground();

  // Form state
  const [promptText, setPromptText] = useState("");
  const [mode, setMode] = useState<"single" | "sequential" | "blackboard">("single");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

  // Live trace state
  const [activePlaygroundId, setActivePlaygroundId] = useState<string | null>(
    null
  );
  const [showTraces, setShowTraces] = useState(false);
  const traceScrollRef = useRef<HTMLDivElement | null>(null);
  const { traces, isConnected, isComplete, error, finalOutput, reportId, runError, liveOutput, liveAgent, liveOutputsByAgent, status: runStatus } =
    usePlaygroundTraces(activePlaygroundId);

  // When a run finishes, bring the final output into view.
  useEffect(() => {
    if (isComplete && showTraces) {
      traceScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [isComplete, showTraces]);

  // Set default agent when agents load
  useState(() => {
    if (agents && agents.length > 0 && !selectedAgent) {
      setSelectedAgent(agents[0].name);
    }
  });

  const toggleAgentSelection = (agentName: string) => {
    if (selectedAgents.includes(agentName)) {
      setSelectedAgents(selectedAgents.filter((a) => a !== agentName));
    } else {
      setSelectedAgents([...selectedAgents, agentName]);
    }
  };

  const handleRun = async () => {
    if (!promptText.trim()) return;

    try {
      // Clear previous traces before starting new run
      setActivePlaygroundId(null);
      setShowTraces(false);

      const payload = { query: promptText };
      const reqBody =
        mode === "sequential"
          ? {
              prompt_name: selectedAgents[0] || "coordinator",
              inputs: payload,
              mode: "sequential",
              agents: selectedAgents,
            }
          : mode === "blackboard"
          ? {
              prompt_name: selectedAgents[0] || "coordinator",
              inputs: payload,
              mode: "blackboard",
              agents: selectedAgents,
            }
          : {
              prompt_name: selectedAgent || "coordinator",
              inputs: payload,
              mode: "single",
            };

      const res = await runPlayground.mutateAsync(reqBody);
      if ((res as any)?.prompt_id) {
        // Small delay to ensure traces are cleared before new ones start
        setTimeout(() => {
          setActivePlaygroundId((res as any).prompt_id as string);
          setShowTraces(true);
        }, 100);
      }
    } catch (err) {
      console.error("Failed to run playground:", err);
    }
  };

  const handleCancel = async () => {
    if (!activePlaygroundId) return;
    try {
      await cancelPlayground.mutateAsync(activePlaygroundId);
    } catch (err) {
      console.error("Failed to cancel playground:", err);
    }
  };

  const handleCloseTraces = () => {
    setShowTraces(false);
    // Don't clear activePlaygroundId immediately to allow traces to finish loading
    if (isComplete) {
      setTimeout(() => setActivePlaygroundId(null), 500);
    }
  };

  // Full-screen trace overlay: Escape closes it and the page behind it is
  // kept from scrolling while the overlay is open.
  const traceOverlayOpen = Boolean(showTraces && activePlaygroundId);

  useEffect(() => {
    if (!traceOverlayOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleCloseTraces();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceOverlayOpen, isComplete]);

  // Extract spans from traces (WebSocket sends hierarchical structure)
  // Handle both [{spans: [...]}] format and direct spans array
  const spans: Span[] = (() => {
    if (traces.length === 0) return [];
    // Check if first element has spans property
    if (traces[0]?.spans && Array.isArray(traces[0].spans)) {
      return traces[0].spans;
    }
    // Fallback: if traces is already an array of spans
    if (Array.isArray(traces) && traces.length > 0 && traces[0]?.id) {
      return traces as Span[];
    }
    return [];
  })();

  // Final outcome for every run mode. Prefer the stored result, then fall
  // back to the last finish answer recorded in the trace spans.
  const outcome = useMemo(() => {
    const normalized = normalizeOutcome(finalOutput);
    const answer = normalized.answer ?? bestAnswerFromSpans(spans);
    return { answer, error: normalized.error };
  }, [finalOutput, spans]);

  const runFailed = ["error", "failed", "canceled"].includes(
    (runStatus || "").toLowerCase()
  );
  const errorMessage =
    outcome.error ||
    runError ||
    (isComplete && runFailed
      ? `Run ${runStatus || "failed"} without a final answer.`
      : null);

  // Recursively calculate total tokens from all spans
  const calculateTotalTokens = (spanList: Span[]): number => {
    return spanList.reduce((sum, span) => {
      const spanTokens = span.metadata?.tokens || 0;
      const childTokens = calculateTotalTokens(span.children || []);
      return sum + spanTokens + childTokens;
    }, 0);
  };

  // Calculate total duration: time from first span to last span
  const calculateTotalDuration = (spanList: Span[]): number => {
    if (spanList.length === 0) return 0;

    try {
      // Get first span's start time
      const firstSpan = spanList[0];
      const firstStartTime = new Date(firstSpan.start_time).getTime();

      // Get last span's start time
      const lastSpan = spanList[spanList.length - 1];
      const lastStartTime = new Date(lastSpan.start_time).getTime();

      // Return the difference
      return lastStartTime - firstStartTime;
    } catch (e) {
      return 0;
    }
  };

  const totalTokens = calculateTotalTokens(spans);
  const totalDuration = calculateTotalDuration(spans);

  // --- Traces-style tree builder (adapted from Traces.tsx) ---
  type TraceNode = { event: any; children: TraceNode[] };

  const buildTraceTree = (events: any[] = []): TraceNode[] => {
    const roots: TraceNode[] = [];
    const stack: TraceNode[] = [];

    const isOpen = (t: string) =>
      t.endsWith("_start") ||
      t === "tool_call" ||
      t === "agent_start" ||
      t === "task_start";
    const isClose = (t: string) =>
      t.endsWith("_complete") ||
      t === "tool_result" ||
      t === "agent_end" ||
      t === "task_complete";

    for (const ev of events) {
      const type = ev.event_type;
      const node: TraceNode = { event: ev, children: [] };

      if (isOpen(type)) {
        stack.push(node);
      } else if (isClose(type)) {
        const last = stack.pop();
        if (last) {
          last.children.push(node);
          const parent = stack[stack.length - 1];
          if (parent) parent.children.push(last);
          else roots.push(last);
        } else {
          roots.push(node);
        }
      } else if (type === "llm_usage" || type === "autonomous_think") {
        const parent = stack[stack.length - 1];
        if (parent) parent.children.push(node);
        else roots.push(node);
      } else {
        const parent = stack[stack.length - 1];
        if (parent) parent.children.push(node);
        else roots.push(node);
      }
    }

    while (stack.length) {
      const leftover = stack.pop()!;
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(leftover);
      else roots.push(leftover);
    }

    return roots;
  };

  const getEventTypeColor = (eventType: string) => {
    const colors: Record<string, string> = {
      agent_start: "text-primary-400",
      agent_end: "text-success",
      tool_call: "text-warning",
      tool_result: "text-info",
      delegation: "text-primary-300",
      error: "text-danger",
    };
    return colors[eventType] || "text-ink-muted";
  };

  function TraceNodeRow({
    node,
    depth = 0,
  }: {
    node: TraceNode;
    depth?: number;
  }) {
    // Start collapsed by default — show details only when user clicks (old architecture)
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
    const ev = node.event;
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div className="mb-2">
        <div className="flex flex-col">
          <div
            className={`flex items-center gap-3 rounded px-4 py-3 transition-colors ${
              depth === 0 ? "" : "bg-canvas/5"
            }`}
            style={{ paddingLeft: `${depth * 24}px` }}
          >
            <div className="w-6 flex items-center justify-center">
              {/* Chevron controls showing/hiding the details only. Children (trace structure) are always visible below. */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className="p-1 rounded hover:bg-surface-overlay/30"
                aria-label={isExpanded ? "Collapse details" : "Expand details"}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-ink-muted" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-ink-faint" />
                )}
              </button>
            </div>

            <div className="w-6 flex-shrink-0">
              <GitBranch
                className={`w-4 h-4 ${getEventTypeColor(ev.event_type)}`}
              />
            </div>

                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="text-sm font-medium text-ink">{ev.event_type}</div>
                              <div className="text-xs text-ink-subtle">{ev.agent || '-'}</div>
                            </div>
                            <div className="text-xs text-ink-faint">{ev.start_time ? format(new Date(ev.start_time), 'HH:mm:ss.SSS') : ''}</div>
                          </div>

                          <div className="text-xs text-ink-subtle mt-2 flex items-center gap-3">
                            {ev.event_type === 'tool_call' && (ev.payload?.tool || ev.metadata?.tool || ev.metadata?.params?.tool) && (
                              <span className="px-2 py-0.5 bg-surface-overlay rounded">Tool: {ev.payload?.tool ?? ev.metadata?.tool ?? ev.metadata?.params?.tool}</span>
                            )}
                            {ev.event_type === 'tool_result' && (ev.payload?.tool || ev.metadata?.tool || ev.metadata?.params?.tool) && (
                              <span className="px-2 py-0.5 bg-surface-overlay rounded">{ev.payload?.tool ?? ev.metadata?.tool ?? ev.metadata?.params?.tool}{ev.payload?.status ? ` - ${ev.payload.status}` : ''}</span>
                            )}
                            {ev.event_type === 'delegation' && (ev.payload?.target_agent || ev.metadata?.target_agent || ev.input?.target_agent) && (
                              <span className="px-2 py-0.5 bg-surface-overlay rounded">→ {ev.payload?.target_agent ?? ev.metadata?.target_agent ?? ev.input?.target_agent}</span>
                            )}
                            {ev.event_type === 'llm_usage' && (
                              <>
                                <span className="px-2 py-0.5 bg-primary-400/10 text-primary-300 rounded font-medium">{ev.metadata.model || 'model'}</span>
                                <span className="text-ink-subtle">{fmtNumber(ev.metadata?.prompt_tokens ?? 0)} in</span>
                                <span className="text-ink-subtle">/ {fmtNumber(ev.metadata?.completion_tokens ?? 0)} out</span>
                              </>
                            )}
                          </div>
                        </div>
          </div>

          {/* Inline expanded details (payload / metadata / input / output) - hidden when collapsed */}
          {isExpanded && (
            <div
              className="bg-canvas px-4 py-3 border-t border-line"
              style={{ paddingLeft: `${depth * 24 + 16}px` }}
            >
              <div className="space-y-3 text-sm">
                {/* For llm_usage - show provider, model, token details */}
                {ev.event_type === "llm_usage" && ev.metadata && (
                  <div>
                    <div className="text-xs font-semibold text-ink-subtle mb-1">
                      LLM Usage
                    </div>
                    <div className="bg-surface rounded p-2 text-xs border border-line space-y-1">
                      {ev.metadata.provider && (
                        <div>
                          <span className="text-ink-faint">Provider:</span>
                          <span className="ml-2 text-ink-muted">{ev.metadata.provider}</span>
                        </div>
                      )}
                      {ev.metadata.model && (
                        <div>
                          <span className="text-ink-faint">Model:</span>
                          <span className="ml-2 text-ink-muted">{ev.metadata.model}</span>
                        </div>
                      )}
                      {ev.metadata.prompt_tokens !== undefined && (
                        <div>
                          <span className="text-ink-faint">Prompt Tokens:</span>
                          <span className="ml-2 text-ink-muted">{fmtNumber(ev.metadata.prompt_tokens)}</span>
                        </div>
                      )}
                      {ev.metadata.completion_tokens !== undefined && (
                        <div>
                          <span className="text-ink-faint">Completion Tokens:</span>
                          <span className="ml-2 text-ink-muted">{fmtNumber(ev.metadata.completion_tokens)}</span>
                        </div>
                      )}
                      {ev.metadata.total_tokens !== undefined && (
                        <div>
                          <span className="text-ink-faint">Total Tokens:</span>
                          <span className="ml-2 text-primary-400 font-semibold">{fmtNumber(ev.metadata.total_tokens)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* For autonomous_think - show response and timing */}
                {ev.event_type === "autonomous_think" && ev.metadata && (
                  <>
                    {ev.metadata.response && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs font-semibold text-ink-subtle">
                            Reasoning Response
                            <span className="ml-2 text-ink-faint font-normal">(
                              {typeof ev.metadata.response === "string"
                                ? fmtNumber(ev.metadata.response.length)
                                : fmtNumber(JSON.stringify(ev.metadata.response).length)} chars)
                            </span>
                          </div>
                          <CopyButton
                            text={
                              typeof ev.metadata.response === "string"
                                ? ev.metadata.response
                                : JSON.stringify(ev.metadata.response, null, 2)
                            }
                          />
                        </div>
                        <div className="bg-surface rounded p-3 border border-line max-h-96 overflow-y-auto">
                          <pre className="text-xs text-ink-muted whitespace-pre-wrap break-words">
                            {typeof ev.metadata.response === "string"
                              ? ev.metadata.response
                              : JSON.stringify(ev.metadata.response, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                    {ev.metadata.iteration !== undefined && (
                      <div className="bg-surface rounded p-2 text-xs border border-line mt-2">
                        <span className="text-ink-faint">Iteration:</span>
                        <span className="ml-2 text-ink-muted">{ev.metadata.iteration}</span>
                        {ev.metadata.duration_ms && (
                          <>
                            <span className="text-ink-faint ml-4">Duration:</span>
                            <span className="ml-2 text-ink-muted">{(ev.metadata.duration_ms / 1000).toFixed(2)}s</span>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Standard Input (for other event types) */}
                {ev.event_type !== "llm_usage" && ev.event_type !== "autonomous_think" && ev.input && Object.keys(ev.input).length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-ink-subtle mb-1">Input</div>
                    <pre className="bg-surface rounded p-2 text-xs text-ink-muted overflow-x-auto border border-line">{JSON.stringify(ev.input, null, 2)}</pre>
                  </div>
                )}

                {/* Standard Output (for other event types) */}
                {ev.event_type !== "llm_usage" && ev.event_type !== "autonomous_think" && (ev.output || ev.metadata.error) && (
                  <div>
                    <div className="text-xs font-semibold text-ink-subtle mb-1">Output</div>
                    <pre className="bg-surface rounded p-2 text-xs text-ink-muted overflow-x-auto border border-line">{JSON.stringify(ev.output || ev.metadata.error, null, 2)}</pre>
                  </div>
                )}

                {/* Metadata */}
                <div>
                  <div className="text-xs font-semibold text-ink-subtle mb-1">Metadata</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-ink-faint">Agent:</span>
                      <span className="ml-2 text-ink-muted">{ev.agent || ev.agent_name || '-'}</span>
                    </div>
                    <div>
                      <span className="text-ink-faint">Event:</span>
                      <span className="ml-2 text-ink-muted">{ev.event_type}</span>
                    </div>
                    <div>
                      <span className="text-ink-faint">Time:</span>
                      <span className="ml-2 text-ink-muted">{ev.start_time ? new Date(ev.start_time).toLocaleTimeString() : (ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : '')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Always render children (trace structure) regardless of details collapsed/expanded */}
        {hasChildren && (
          <div>
            {node.children.map((c, i) => (
              <TraceNodeRow
                key={c.event?.id ?? `${depth}-${i}`}
                node={c}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const traceTree = buildTraceTree(spans || []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Playground"
        description="Test your agents with custom prompts"
      />

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left Side - Prompt Input */}
        <Card className="flex min-w-0 flex-1 flex-col">
          <CardHeader
            title="Prompt / Query"
            subtitle="Describe the task you want the agents to run"
          />

          <CardBody className="flex flex-1 flex-col gap-4">
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              aria-label="Prompt / Query"
              className="input min-h-[280px] flex-1 resize-none font-mono leading-relaxed lg:min-h-[400px]"
              placeholder="Enter your prompt here...

Example: Research the top 5 programming languages in 2024 and write a comparison report."
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-ink-subtle tabular-nums">
                {promptText.length} characters
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {runPlayground.isPending && (
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={cancelPlayground.isPending}
                    className="btn-secondary"
                  >
                    <StopCircle className="h-4 w-4" />
                    {cancelPlayground.isPending ? "Stopping..." : "Stop"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={
                    runPlayground.isPending ||
                    !promptText.trim() ||
                    ((mode === "sequential" || mode === "blackboard") &&
                      selectedAgents.length < 2)
                  }
                  className="btn-primary"
                >
                  {runPlayground.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {runPlayground.isPending ? "Starting..." : "Run"}
                </button>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Right Side - Configuration */}
        <div className="w-96 flex flex-col bg-surface">
          {/* Mode Selection */}
          <div className="flex-none px-6 py-4 border-b border-line">
            <div className="caption mb-3">Mode</div>
            <div className="inline-flex w-full rounded-lg border border-line bg-surface-raised p-1">
              {MODE_OPTIONS.map((opt) => {
                const active = mode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMode(opt.id as "single" | "sequential" | "blackboard")}
                    aria-pressed={active}
                    title={opt.hint}
                    className={
                      "flex-1 rounded-md px-2 py-2 text-xs font-medium transition-colors duration-150 " +
                      (active
                        ? "bg-surface-overlay text-ink shadow-card"
                        : "text-ink-subtle hover:text-ink")
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-ink-faint">
              {MODE_OPTIONS.find((o) => o.id === mode)?.hint}
            </p>
          </div>

          {/* Agent Selection */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <label className="block text-sm font-medium text-ink-muted mb-3">
              {mode === "single" ? "Select Agent" : mode === "blackboard" ? "Select Agents (collaborators)" : "Select Agents (in order)"}
            </label>

            {mode === "single" ? (
              <div className="space-y-2">
                {agents &&
                  agents.map((agent) => (
                    <label
                      key={agent.name}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedAgent === agent.name
                          ? "bg-primary-500/10 border-primary-400"
                          : "bg-surface-raised border-line hover:border-line-strong"
                      }`}
                    >
                      <input
                        type="radio"
                        name="agent"
                        checked={selectedAgent === agent.name}
                        onChange={() => setSelectedAgent(agent.name)}
                        className="w-4 h-4 text-primary-400 focus:ring-primary-400 focus:ring-offset-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-ink font-medium">
                          {agent.name}
                        </div>
                        <div className="text-xs text-ink-subtle truncate">
                          {agent.role}
                        </div>
                      </div>
                    </label>
                  ))}
              </div>
            ) : (
              <div className="space-y-2">
                {agents &&
                  agents.map((agent) => {
                    const isSelected = selectedAgents.includes(agent.name);
                    // Blackboard runs are parallel, so a numbered execution
                    // order would be misleading.
                    const order =
                      isSelected && mode !== "blackboard"
                        ? selectedAgents.indexOf(agent.name) + 1
                        : null;

                    return (
                      <label
                        key={agent.name}
                        className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-primary-500/10 border-primary-400"
                            : "bg-surface-raised border-line hover:border-line-strong"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleAgentSelection(agent.name)}
                          className="w-4 h-4 text-primary-400 rounded focus:ring-primary-400 focus:ring-offset-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-ink font-medium">
                            {agent.name}
                          </div>
                          <div className="text-xs text-ink-subtle truncate">
                            {agent.role}
                          </div>
                        </div>
                        {order && (
                          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary-500 text-[#06171A] text-xs font-bold">
                            {order}
                          </div>
                        )}
                      </label>
                    );
                  })}
                {selectedAgents.length > 0 && mode !== "blackboard" && (
                  <div className="mt-3 p-3 bg-surface-raised border border-line rounded-lg">
                    <div className="text-xs text-ink-subtle mb-1">
                      Execution order:
                    </div>
                    <div className="text-sm text-ink">
                      {selectedAgents.join(" → ")}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live Trace Section */}
      {/* Live Trace Panel - Bottom */}
      {showTraces && activePlaygroundId && (
        <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
          <div className="flex-none px-6 py-3 border-b border-line flex items-center justify-between bg-canvas">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-ink">Live Trace</h2>
              {isConnected && !isComplete && (
                <span className="flex items-center gap-1.5 text-xs text-primary-400">
                  <span className="w-2 h-2 bg-primary-400 rounded-full animate-pulse" />
                  Running
                </span>
              )}
              {isComplete && (
                <span className="text-xs px-2 py-1 rounded bg-success/15 text-success">
                  Completed
                </span>
              )}
            </div>

            <div className="flex items-center gap-4">
              {/* Cancel button - only show when running */}
              {!isComplete && (
                <button
                  onClick={handleCancel}
                  disabled={cancelPlayground.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-danger-subtle hover:bg-danger/15 text-danger border border-danger-border rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <StopCircle className="w-3.5 h-3.5" />
                  {cancelPlayground.isPending ? "Canceling..." : "Cancel"}
                </button>
              )}

              {/* Summary Metrics */}
              {spans.length > 0 && (
                <div className="flex items-center gap-6 text-xs text-ink-subtle">
                  <div className="flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5" />
                    <span>{spans.length} spans</span>
                  </div>
                  {totalTokens > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5" />
                      <span>{totalTokens.toLocaleString()} tokens</span>
                    </div>
                  )}
                  {/* Only show duration when complete */}
                  {isComplete && totalDuration > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{(totalDuration / 1000).toFixed(2)}s</span>
                    </div>
                  )}
                </div>
              )}

              {/* Close Button */}
              <button
                onClick={handleCloseTraces}
                className="p-1.5 hover:bg-surface-overlay rounded text-ink-subtle hover:text-ink transition-colors"
                aria-label="Close trace panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div ref={traceScrollRef} className="flex-1 overflow-y-auto bg-surface">
            {/* Final outcome is shown for every mode, including Blackboard. */}
            {isComplete && reportId && (
              <section className="m-4 rounded-lg border border-primary-400/25/60 bg-canvas p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-primary-300">Cited report</h3>
                    <p className="text-xs text-ink-subtle mt-1">
                      Structured findings with source citations, disagreements, and limitations.
                    </p>
                  </div>
                  <Link
                    to={`/reports/${reportId}`}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 border border-primary-400/30 rounded-lg font-medium transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    View Report
                  </Link>
                </div>
              </section>
            )}

            {isComplete && errorMessage && (
              <section className="m-4 rounded-lg border border-danger-border/60 bg-red-950/20 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-danger">Run Error</h3>
                  {runStatus && (
                    <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-danger">
                      {runStatus}
                    </span>
                  )}
                </div>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm text-danger">
                  {errorMessage}
                </pre>
              </section>
            )}

            {isComplete && outcome.answer != null && (
              <section className="m-4 rounded-lg border border-primary-400/25/60 bg-canvas p-4">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-primary-300">Final Output</h3>
                  {runStatus && (
                    <span className="text-xs px-2 py-0.5 rounded bg-primary-500/10 text-primary-300">
                      {runStatus}
                    </span>
                  )}
                </div>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm text-ink">
                  {formatFinalOutput(outcome.answer)}
                </pre>
              </section>
            )}

            {mode === "blackboard" ? (
              <BlackboardRunView
                agents={selectedAgents.length ? selectedAgents : [selectedAgent].filter(Boolean)}
                promptId={activePlaygroundId}
                liveAgent={liveAgent}
                liveOutputsByAgent={liveOutputsByAgent}
                isComplete={isComplete}
                spans={spans}
              />
            ) : (
              <>
            {liveOutput && !isComplete && (
              <section className="m-4 rounded-lg border border-primary-400/25/60 bg-canvas p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 bg-primary-400 rounded-full animate-pulse" />
                  <h3 className="text-sm font-semibold text-primary-300">
                    Live output{liveAgent ? ` · ${liveAgent}` : ''}
                  </h3>
                </div>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm text-ink">
                  {liveOutput}
                  <span className="inline-block w-2 h-4 bg-primary-400 ml-0.5 animate-pulse align-middle" />
                </pre>
              </section>
            )}

            {spans.length > 0 ? (
              <div className="p-4 space-y-1">
                {traceTree.map((node, index) => (
                  <div
                    key={`trace-${index}-${node.event.id ?? index}`}
                    className="opacity-0 animate-[fadeInSlide_0.3s_ease-out_forwards]"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <TraceNodeRow node={node} depth={0} />
                  </div>
                ))}
              </div>
            ) : isComplete ? (
              <div className="flex items-center justify-center h-full text-ink-faint">
                <div className="text-center">
                  <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">
                    {outcome.answer == null
                      ? "Run completed without trace spans or a final output."
                      : "No trace spans were recorded for this run."}
                  </p>
                </div>
              </div>
            ) : !isConnected ? (
              <div className="flex items-center justify-center h-full text-ink-faint">
                <div className="text-center">
                  <Activity className="w-12 h-12 mx-auto mb-3 opacity-50 animate-pulse" />
                  <p className="text-sm">Connecting to WebSocket...</p>
                  {error && <p className="text-xs text-danger mt-2">{error}</p>}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-ink-faint">
                <div className="text-center">
                  <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Waiting for traces...</p>
                  <p className="text-xs text-ink-faint mt-2">WebSocket connected, waiting for trace data...</p>
                </div>
              </div>
            )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
