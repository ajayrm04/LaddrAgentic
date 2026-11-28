import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { AlertTriangle, Network, Plus, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { Card, CardBody, CardSkeleton, EmptyState, PageHeader } from '../components/ui';

interface GraphSummary {
  graph_id: string;
  name: string;
  description?: string | null;
  node_count: number;
  edge_count: number;
  created_at?: string | null;
  updated_at?: string | null;
}

/* ------------------------------------------------------------------ */
/* Shared confirm dialog (spec §10 — replaces window.confirm)          */
/* ------------------------------------------------------------------ */

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Focus the panel on mount + lock body scroll
    panelRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="surface w-full max-w-md animate-fade-up p-5 shadow-pop outline-none"
      >
        <h2 id="confirm-dialog-title" className="section-title">
          {title}
        </h2>
        {description && (
          <p className="mt-1.5 text-sm text-ink-subtle">{description}</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Deleting…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Graphs() {
  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<GraphSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<{ graphs: GraphSummary[] }>('/api/graphs');
      setGraphs(data.graphs);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to load graphs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createGraph = async () => {
    setCreating(true);
    try {
      const { data } = await api.post<{ graph_id: string }>('/api/graphs', {
        name: 'Untitled graph',
        nodes: [
          { id: 'input', type: 'input', position: { x: 50, y: 100 } },
          { id: 'out', type: 'output', position: { x: 600, y: 100 } },
        ],
        edges: [],
      });
      navigate(`/graphs/${data.graph_id}`);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to create graph');
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/api/graphs/${pendingDelete.graph_id}`);
      setGraphs((prev) => prev.filter((g) => g.graph_id !== pendingDelete.graph_id));
      setPendingDelete(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Graphs"
        description="Visual agent workflows. Drag, connect, run."
        actions={
          <button onClick={createGraph} disabled={creating} className="btn-primary">
            <Plus className="h-4 w-4" /> {creating ? 'Creating…' : 'New graph'}
          </button>
        }
      />

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-danger-border bg-danger-subtle px-4 py-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">{error}</div>
          <button className="btn-ghost h-7 px-2" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} rows={3} />
          ))}
        </div>
      ) : graphs.length === 0 ? (
        <EmptyState
          icon={<Network className="h-6 w-6" />}
          title="No graphs yet"
          description="Create one to visually compose an agent pipeline."
          action={
            <button
              onClick={createGraph}
              disabled={creating}
              className="btn-primary"
            >
              <Plus className="h-4 w-4" /> {creating ? 'Creating…' : 'New graph'}
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {graphs.map((g) => (
            <Card key={g.graph_id} hover>
              <CardBody className="flex flex-col gap-3">
                <Link to={`/graphs/${g.graph_id}`} className="group block min-w-0">
                  <h3 className="section-title truncate transition-colors group-hover:text-primary-300">
                    {g.name}
                  </h3>
                  {g.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-ink-subtle">
                      {g.description}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-subtle tabular-nums">
                    <span>{g.node_count} nodes</span>
                    <span>{g.edge_count} edges</span>
                    {g.updated_at && (
                      <span>updated {format(new Date(g.updated_at), 'MMM d')}</span>
                    )}
                  </div>
                </Link>
                <div className="flex items-center justify-end border-t border-line pt-3">
                  <button
                    onClick={() => setPendingDelete(g)}
                    className="btn-ghost h-8 px-2 hover:text-danger"
                    aria-label={`Delete graph ${g.name}`}
                    title="Delete graph"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete graph?"
        description={
          pendingDelete
            ? `"${pendingDelete.name}" and its nodes and edges will be permanently deleted. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        busy={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
