import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHealth } from '../lib/queries/health';
import { useMetrics } from '../lib/queries/metrics';
import { useAgents } from '../lib/queries/agents';
import {
  Activity,
  Users,
  Briefcase,
  Clock,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Zap,
  Database,
  Coins,
  ArrowUpDown,
  Inbox,
} from 'lucide-react';
import { PageHeader, StatCard, Skeleton, EmptyState, Badge } from '../components/ui';
import clsx from 'clsx';

export default function Dashboard() {
  const { data: health, isLoading: healthLoading } = useHealth();
  const { data: metrics, isLoading: metricsLoading } = useMetrics();
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const tableData = useMemo(
    () =>
      agents?.map((agent) => ({
        name: agent.name,
        description: agent.role,
        toolsCount: agent.tools?.length || 0,
        traceCount: agent.trace_count || 0,
        lastExecuted: agent.last_executed || 'Never',
      })) || [],
    [agents]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tableData;
    return tableData.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
    );
  }, [tableData, searchQuery]);

  const sortedData = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.lastExecuted === 'Never' && b.lastExecuted === 'Never') return 0;
      if (a.lastExecuted === 'Never') return sortOrder === 'asc' ? 1 : -1;
      if (b.lastExecuted === 'Never') return sortOrder === 'asc' ? -1 : 1;
      const dateA = new Date(a.lastExecuted).getTime();
      const dateB = new Date(b.lastExecuted).getTime();
      return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });
  }, [filtered, sortOrder]);

  const itemsPerPage = 6;
  const totalPages = Math.max(1, Math.ceil(sortedData.length / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * itemsPerPage;
  const paginatedData = sortedData.slice(startIndex, startIndex + itemsPerPage);

  const formatTimestamp = (timestamp: string) => {
    if (timestamp === 'Never') return 'Never';
    try {
      return new Date(timestamp).toLocaleString('en-US', {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch {
      return timestamp;
    }
  };

  const isHealthy = health?.status === 'ok';

  /* Secondary metrics rendered as one compact strip, not 4 more cards */
  const secondaryStats = [
    { label: 'Tool Calls', value: metrics?.tool_calls ?? 0, icon: Zap },
    { label: 'Cache Hits', value: metrics?.cache_hits ?? 0, icon: Database },
    { label: 'Total Tokens', value: (metrics?.total_tokens ?? 0).toLocaleString(), icon: Coins },
    { label: 'Completed', value: metrics?.completed_jobs ?? 0, icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="System health, agent activity and workload at a glance."
      />

      {/* Primary stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="System Status"
          value={isHealthy ? 'Healthy' : 'Unknown'}
          hint={healthLoading ? undefined : isHealthy ? 'All services responding' : 'Check API server'}
          loading={healthLoading}
          tone={isHealthy ? 'success' : 'default'}
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard
          label="Active Agents"
          value={metrics?.active_agents_count ?? agents?.length ?? 0}
          hint="Registered in this workspace"
          loading={metricsLoading}
          tone="primary"
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Total Jobs"
          value={metrics?.total_jobs ?? 0}
          hint={`${metrics?.completed_jobs ?? 0} completed`}
          loading={metricsLoading}
          icon={<Briefcase className="h-4 w-4" />}
        />
        <StatCard
          label="Avg Runtime"
          value={`${((metrics?.avg_latency_ms ?? 0) / 1000).toFixed(1)}s`}
          hint="Mean job duration"
          loading={metricsLoading}
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {/* Secondary metrics strip */}
      <div className="surface grid grid-cols-2 divide-line lg:grid-cols-4 lg:divide-x">
        {secondaryStats.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-3 px-5 py-4 border-b border-line last:border-b-0 lg:border-b-0"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-overlay text-ink-subtle">
              <s.icon className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <div className="text-lg font-semibold tabular-nums text-ink leading-tight">
                {metricsLoading ? <Skeleton className="h-6 w-14" /> : s.value}
              </div>
              <div className="truncate text-xs text-ink-subtle">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Agents table */}
      <section>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="section-title">Agents</h2>
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              role="searchbox"
              placeholder="Search agents…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="input pl-9"
            />
          </div>
        </div>

        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[640px]">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Role</th>
                  <th className="w-24 text-right">Tools</th>
                  <th className="w-28 text-right">Traces</th>
                  <th className="w-44">
                    <button
                      type="button"
                      onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                      className="inline-flex items-center gap-1.5 uppercase tracking-wider transition-colors hover:text-ink-muted"
                    >
                      Last Executed
                      <ArrowUpDown
                        className={clsx(
                          'h-3 w-3 transition-transform',
                          sortOrder === 'asc' ? 'text-primary-400' : 'text-ink-faint'
                        )}
                      />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {agentsLoading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={`sk-${i}`}>
                      <td colSpan={5} className="px-5 py-3.5">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))}

                {!agentsLoading &&
                  paginatedData.map((row) => (
                    <tr
                      key={row.name}
                      onClick={() => navigate(`/agents/${encodeURIComponent(row.name)}`)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/agents/${encodeURIComponent(row.name)}`);
                        }
                      }}
                      className="cursor-pointer focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:outline-none"
                    >
                      <td className="font-medium text-ink">
                        <span className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-400/10 text-2xs font-bold text-primary-300">
                            {row.name.charAt(0).toUpperCase()}
                          </span>
                          {row.name}
                        </span>
                      </td>
                      <td className="max-w-[280px] truncate">{row.description}</td>
                      <td className="text-right tabular-nums text-ink-muted">{row.toolsCount}</td>
                      <td className="text-right tabular-nums text-ink-muted">{row.traceCount}</td>
                      <td className="whitespace-nowrap text-ink-subtle">
                        {row.lastExecuted === 'Never' ? (
                          <Badge tone="neutral">Never</Badge>
                        ) : (
                          formatTimestamp(row.lastExecuted)
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {!agentsLoading && paginatedData.length === 0 && (
            <div className="p-6">
              <EmptyState
                icon={<Inbox className="h-5 w-5" />}
                title={searchQuery ? 'No matching agents' : 'No agents yet'}
                description={
                  searchQuery
                    ? `Nothing matches “${searchQuery}”. Try a different search.`
                    : 'Create your first agent to get started.'
                }
              />
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-ink-faint">
              Showing {startIndex + 1}–
              {Math.min(startIndex + itemsPerPage, sortedData.length)} of{' '}
              {sortedData.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                disabled={safePage === 1}
                className="btn-ghost h-8 px-2"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: totalPages }).map((_, idx) => {
                const pageNum = idx + 1;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={clsx(
                      'h-8 min-w-8 rounded-md px-2 text-sm tabular-nums transition-colors',
                      safePage === pageNum
                        ? 'bg-primary-400/15 font-semibold text-primary-300'
                        : 'text-ink-subtle hover:bg-surface-overlay hover:text-ink'
                    )}
                    aria-current={safePage === pageNum ? 'page' : undefined}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
                disabled={safePage === totalPages}
                className="btn-ghost h-8 px-2"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
