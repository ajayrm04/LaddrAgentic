import { useState, useEffect, useRef, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  Terminal,
  Download,
  Trash2,
  Play,
  Pause,
  Search,
  RefreshCw,
  Globe,
  Cpu,
  Database,
  Package,
  type LucideIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getWebSocketBaseUrl } from '../lib/config';
import {
  Card,
  CardHeader,
  PageHeader,
  Badge,
  Skeleton,
  type BadgeTone,
} from '../components/ui';

interface ContainerInfo {
  id: string;
  name: string;
  service_name: string;
  project_name: string;
  type: 'api' | 'worker' | 'infrastructure' | 'other';
  status: string;
  image: string;
  created: string;
}

interface LogLine {
  timestamp: string;
  message: string;
}

interface ContainerLogs {
  container: string;
  container_id: string;
  status: string;
  logs: LogLine[];
  total: number;
}

/** Hard cap on log lines held in state / rendered to the DOM (keeps tail behavior). */
const MAX_LOG_LINES = 1000;

/** Container type → icon (no emoji in UI). */
const TYPE_ICONS: Record<ContainerInfo['type'], LucideIcon> = {
  api: Globe,
  worker: Cpu,
  infrastructure: Database,
  other: Package,
};

const TYPE_TONES: Record<ContainerInfo['type'], BadgeTone> = {
  api: 'primary',
  worker: 'info',
  infrastructure: 'neutral',
  other: 'neutral',
};

const STATUS_TONES: Record<string, BadgeTone> = {
  running: 'success',
  exited: 'danger',
  paused: 'warning',
};

const CONTROL_INPUT =
  'input h-9 py-0 text-xs sm:text-sm';

/** Wrap search matches in <mark> without touching the rest of the line. */
function highlightMatches(text: string, term: string): ReactNode {
  const query = term.trim().toLowerCase();
  if (!query || !text) return text;

  const lower = text.toLowerCase();
  const nodes: ReactNode[] = [];
  let last = 0;
  let idx = lower.indexOf(query);

  while (idx !== -1) {
    if (idx > last) nodes.push(text.slice(last, idx));
    nodes.push(
      <mark key={idx} className="rounded-sm bg-primary-400/25 text-inherit">
        {text.slice(idx, idx + query.length)}
      </mark>
    );
    last = idx + query.length;
    idx = lower.indexOf(query, last);
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export default function Logs() {
  const [selectedContainer, setSelectedContainer] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [tail, setTail] = useState(200);
  const [searchTerm, setSearchTerm] = useState('');
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const [wsLogs, setWsLogs] = useState<LogLine[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Fetch list of containers
  const {
    data: containersData,
    refetch: refetchContainers,
    isLoading: isLoadingContainers,
  } = useQuery({
    queryKey: ['containers'],
    queryFn: async () => {
      const response = await api.get('/api/logs/containers');
      return response.data as { containers: ContainerInfo[]; total: number };
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Fetch logs for selected container
  const { data: logsData, refetch: refetchLogs, isLoading: isLoadingLogs } = useQuery({
    queryKey: ['container-logs', selectedContainer, tail],
    queryFn: async () => {
      if (!selectedContainer) return null;
      const response = await api.get(`/api/logs/containers/${selectedContainer}`, {
        params: { tail, timestamps: true },
      });
      return response.data as ContainerLogs;
    },
    enabled: !!selectedContainer && !isStreaming,
    refetchInterval: isStreaming ? false : 5000, // Refresh every 5 seconds when not streaming
  });

  // WebSocket for real-time logs
  useEffect(() => {
    if (!selectedContainer || !isStreaming) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const wsBaseUrl = getWebSocketBaseUrl();
    // Remove trailing slash if present
    const baseUrl = wsBaseUrl.endsWith('/') ? wsBaseUrl.slice(0, -1) : wsBaseUrl;
    const wsUrl = `${baseUrl}/ws/logs/${selectedContainer}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected for logs');
      setWsLogs([]);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'log') {
        setWsLogs((prev) => {
          const next = [...prev, data.data];
          // Keep only the newest lines so the DOM never grows unbounded.
          return next.length > MAX_LOG_LINES
            ? next.slice(next.length - MAX_LOG_LINES)
            : next;
        });
      } else if (data.type === 'connected') {
        console.log('Connected to container:', data.data);
      } else if (data.type === 'error') {
        console.error('WebSocket error:', data.data.error);
        setIsStreaming(false);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsStreaming(false);
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
    };

    return () => {
      ws.close();
    };
  }, [selectedContainer, isStreaming]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logsData, wsLogs, autoScroll]);

  const displayLogs = isStreaming ? wsLogs : (logsData?.logs || []);

  // Filter logs by search term
  const filteredLogs = searchTerm
    ? displayLogs.filter((log) =>
        log.message.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : displayLogs;

  // Never render more than MAX_LOG_LINES rows (tail keeps the newest entries)
  const visibleLogs = filteredLogs.slice(-MAX_LOG_LINES);

  // Filter containers by type
  const filteredContainers = containersData?.containers.filter((c) => {
    if (typeFilter === 'all') return true;
    return c.type === typeFilter;
  }) || [];

  const downloadLogs = () => {
    const logsText = filteredLogs
      .map((log) => `${log.timestamp} ${log.message}`)
      .join('\n');
    const blob = new Blob([logsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedContainer || 'container'}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearLogs = () => {
    if (isStreaming) {
      setWsLogs([]);
    } else {
      refetchLogs();
    }
  };

  const formatTimestamp = (timestamp: string) => {
    if (!timestamp) return '';
    try {
      // Format: 2024-01-01T12:00:00.000000000Z -> 12:00:00.000
      const timePart = timestamp.split('T')[1];
      if (!timePart) return timestamp;
      const timeWithMs = timePart.split('Z')[0];
      return timeWithMs.substring(0, 12); // HH:MM:SS.mmm
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-400/10 text-primary-400">
              <Terminal className="h-5 w-5" />
            </span>
            Container Logs
          </span>
        }
        description="View logs from Docker containers — API and worker services."
        actions={
          <>
            {selectedContainer && (
              <>
                <button
                  onClick={() => setIsStreaming(!isStreaming)}
                  className={isStreaming ? 'btn-danger' : 'btn-primary'}
                >
                  {isStreaming ? (
                    <>
                      <Pause className="h-4 w-4" /> Stop Stream
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" /> Live Stream
                    </>
                  )}
                </button>
                <button
                  onClick={downloadLogs}
                  disabled={filteredLogs.length === 0}
                  className="btn-secondary"
                >
                  <Download className="h-4 w-4" />
                  Download
                </button>
                <button
                  onClick={clearLogs}
                  disabled={filteredLogs.length === 0}
                  className="btn-secondary"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear
                </button>
              </>
            )}
            <button onClick={() => refetchContainers()} className="btn-secondary">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 lg:gap-6">
        {/* Containers List */}
        <div className="lg:col-span-1">
          <Card className="overflow-hidden">
            <CardHeader
              title="Containers"
              subtitle={`${filteredContainers.length} of ${containersData?.total ?? 0}`}
            />

            {/* Type Filter */}
            <div className="border-b border-line p-3">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label="Filter containers by type"
                className={CONTROL_INPUT}
              >
                <option value="all">All Types</option>
                <option value="api">API</option>
                <option value="worker">Workers</option>
                <option value="infrastructure">Infrastructure</option>
              </select>
            </div>

            <div className="max-h-[45vh] overflow-y-auto lg:max-h-[64vh]">
              {isLoadingContainers ? (
                <div className="space-y-2 p-3" aria-hidden>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              ) : filteredContainers.length === 0 ? (
                <div className="p-6 text-center text-sm text-ink-subtle">
                  No containers found
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {filteredContainers.map((container) => {
                    const selected = selectedContainer === container.name;
                    const TypeIcon =
                      TYPE_ICONS[container.type] ?? Package;
                    return (
                      <button
                        key={container.id}
                        onClick={() => {
                          setSelectedContainer(container.name);
                          setIsStreaming(false);
                          setSearchTerm('');
                        }}
                        aria-current={selected || undefined}
                        className={clsx(
                          'group w-full border-l-2 p-3 text-left transition-colors duration-150',
                          selected
                            ? 'border-primary-400 bg-primary-400/5'
                            : 'border-transparent hover:bg-surface-overlay'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-overlay text-ink-muted transition-colors group-hover:text-primary-400">
                            <TypeIcon className="h-4 w-4" strokeWidth={1.75} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                              <Badge tone={TYPE_TONES[container.type] ?? 'neutral'}>
                                {container.type}
                              </Badge>
                              <Badge
                                tone={STATUS_TONES[container.status.toLowerCase()] ?? 'neutral'}
                                dot
                              >
                                {container.status}
                              </Badge>
                            </div>
                            <p className="truncate text-sm font-medium text-ink">
                              {container.service_name}
                            </p>
                            <p className="truncate text-xs text-ink-subtle">
                              {container.name}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Logs Display */}
        <div className="lg:col-span-3">
          <Card className="overflow-hidden">
            <CardHeader
              title={selectedContainer || 'No container selected'}
              subtitle={`${filteredLogs.length} lines${
                searchTerm ? ` (filtered from ${displayLogs.length})` : ''
              }`}
              action={
                isStreaming ? (
                  <Badge tone="success" dot className="[&_>span]:animate-pulse">
                    Live
                  </Badge>
                ) : selectedContainer ? (
                  <Badge tone="neutral">Paused</Badge>
                ) : (
                  <Badge tone="neutral">Idle</Badge>
                )
              }
            />

            {/* Logs Controls */}
            {selectedContainer && (
              <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-raised px-4 py-3">
                {!isStreaming && (
                  <>
                    <label htmlFor="log-tail" className="text-xs text-ink-muted">
                      Lines
                    </label>
                    <select
                      id="log-tail"
                      value={tail}
                      onChange={(e) => setTail(Number(e.target.value))}
                      className={clsx(CONTROL_INPUT, 'w-auto')}
                    >
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={200}>200</option>
                      <option value={500}>500</option>
                      <option value={1000}>1000</option>
                    </select>
                  </>
                )}

                <div className="relative min-w-[180px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                  <input
                    type="text"
                    placeholder="Search logs..."
                    aria-label="Search logs"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={clsx(CONTROL_INPUT, 'pl-9')}
                  />
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-muted">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    className="h-4 w-4 rounded border-line bg-surface-raised accent-primary-400"
                  />
                  Auto-scroll
                </label>
              </div>
            )}

            {/* Logs Content */}
            <div
              ref={logsContainerRef}
              className="h-[45vh] overflow-y-auto bg-canvas font-mono text-xs terminal-scroll lg:h-[64vh]"
            >
              {isLoadingLogs ? (
                <div className="space-y-2 p-4" aria-label="Loading logs" role="status">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-3.5" />
                  ))}
                </div>
              ) : visibleLogs.length === 0 ? (
                <div className="flex h-full items-center justify-center px-4 text-center text-sm text-ink-subtle">
                  {selectedContainer
                    ? searchTerm
                      ? 'No logs match your search'
                      : 'No logs available'
                    : 'Select a container to view logs'}
                </div>
              ) : (
                <div className="p-4">
                  {visibleLogs.map((log, index) => (
                    <div
                      key={index}
                      className="flex gap-3 py-0.5 transition-colors hover:bg-surface-raised/40"
                    >
                      {log.timestamp && (
                        <span className="shrink-0 select-none font-medium text-ink-faint">
                          {formatTimestamp(log.timestamp)}
                        </span>
                      )}
                      <span className="break-all leading-relaxed text-ink-muted">
                        {highlightMatches(log.message, searchTerm)}
                      </span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
