import { useBatches } from '../lib/queries/batches';
import { Clock, CheckCircle, XCircle, Loader2, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { PageHeader, Card, CardSkeleton, EmptyState, Badge } from '../components/ui';

export default function Batches() {
  const { data: batches, isLoading } = useBatches(50);
  const navigate = useNavigate();

  const statusTone = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success' as const;
      case 'failed':
        return 'danger' as const;
      case 'running':
      case 'submitted':
        return 'primary' as const;
      default:
        return 'neutral' as const;
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-success" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-danger" />;
      case 'running':
      case 'submitted':
        return <Loader2 className="h-4 w-4 text-primary-400 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-ink-subtle" />;
    }
  };

  const calculateDuration = (createdAt?: string, completedAt?: string) => {
    if (!createdAt) return '—';
    const start = new Date(createdAt).getTime();
    const end = completedAt ? new Date(completedAt).getTime() : Date.now();
    const ms = Math.max(0, end - start);
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Batches"
        description="View and manage batch operations."
      />

      {isLoading && (
        <Card className="p-5">
          <CardSkeleton rows={6} />
        </Card>
      )}

      {!isLoading && (!batches || batches.length === 0) && (
        <EmptyState
          icon={<Clock className="h-5 w-5" />}
          title="No batches yet"
          description="Batch runs will appear here once they are submitted."
        />
      )}

      {!isLoading && batches && batches.length > 0 && (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table min-w-[880px]">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Batch ID</th>
                  <th>Agent</th>
                  <th className="text-right">Tasks</th>
                  <th className="text-right">Jobs</th>
                  <th>Created</th>
                  <th>Duration</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr
                    key={batch.batch_id}
                    onClick={() => navigate(`/batches/${batch.batch_id}`)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/batches/${batch.batch_id}`);
                      }
                    }}
                    className="cursor-pointer focus-visible:ring-2 focus-visible:ring-primary-400/50 focus-visible:outline-none"
                  >
                    <td>
                      <div className="flex items-center gap-2">
                        {statusIcon(batch.status)}
                        <Badge tone={statusTone(batch.status)} dot className="capitalize">
                          {batch.status}
                        </Badge>
                      </div>
                    </td>
                    <td className="font-mono text-sm text-ink">{batch.batch_id.slice(0, 8)}…</td>
                    <td className="font-medium text-ink">{batch.agent_name}</td>
                    <td className="text-right tabular-nums text-ink-muted">{batch.task_count}</td>
                    <td className="text-right tabular-nums text-ink-muted">{batch.job_ids?.length || 0}</td>
                    <td className="whitespace-nowrap text-ink-subtle">
                      {batch.created_at
                        ? format(new Date(batch.created_at), 'MMM d, HH:mm:ss')
                        : '—'}
                    </td>
                    <td className="tabular-nums text-ink-subtle">
                      {calculateDuration(batch.created_at, batch.completed_at)}
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/batches/${batch.batch_id}`);
                        }}
                        className="btn-ghost h-8 px-2 text-primary-400 hover:text-primary-300"
                      >
                        View
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
