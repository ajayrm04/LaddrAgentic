import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { AlertTriangle, GitBranch, Loader2, Plus, Trash2 } from 'lucide-react';
import api from '../lib/api';

interface GraphSummary {
  graph_id: string;
  name: string;
  description?: string | null;
  node_count: number;
  edge_count: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export default function Graphs() {
  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
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

  useState(() => { load(); });

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

  const deleteGraph = async (id: string) => {
    if (!window.confirm('Delete this graph?')) return;
    try {
      await api.delete(`/api/graphs/${id}`);
      setGraphs((prev) => prev.filter((g) => g.graph_id !== id));
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to delete');
    }
  };

  return (
    <div className="space-y-6 bg-[#191A1A] p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Graphs</h1>
          <p className="text-sm text-gray-400 mt-1">Visual agent workflows. Drag, connect, run.</p>
        </div>
        <button
          onClick={createGraph}
          disabled={creating}
          className="flex items-center gap-2 px-4 py-2 bg-[#1FB8CD] hover:bg-[#1AA5B8] text-white rounded-lg font-medium disabled:opacity-50"
        >
          <Plus className="w-4 h-4" /> {creating ? 'Creating…' : 'New graph'}
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading graphs…
        </div>
      ) : graphs.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <GitBranch className="w-12 h-12 mx-auto mb-4 text-gray-600" />
          <p className="mb-1">No graphs yet</p>
          <p className="text-sm text-gray-500">Create one to visually compose an agent pipeline.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {graphs.map((g) => (
            <div
              key={g.graph_id}
              className="bg-[#1F2121] border border-gray-800 rounded-lg p-5 hover:border-[#1FB8CD]/40 transition-colors"
            >
              <Link to={`/graphs/${g.graph_id}`} className="block">
                <h3 className="text-white font-semibold truncate">{g.name}</h3>
                {g.description && <p className="text-sm text-gray-400 mt-1 line-clamp-2">{g.description}</p>}
                <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
                  <span>{g.node_count} nodes</span>
                  <span>{g.edge_count} edges</span>
                  {g.updated_at && <span>updated {format(new Date(g.updated_at), 'MMM d')}</span>}
                </div>
              </Link>
              <div className="flex items-center justify-end mt-3">
                <button
                  onClick={() => deleteGraph(g.graph_id)}
                  className="text-gray-500 hover:text-red-400 transition-colors"
                  title="Delete graph"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
