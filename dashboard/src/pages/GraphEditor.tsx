import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { ArrowLeft, Play, Save, Trash2, Settings2, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import api from '../lib/api';

const NODE_COLORS: Record<string, string> = {
  input: '#1FB8CD',
  output: '#22c55e',
  agent: '#a855f7',
  tool: '#f59e0b',
  conditional: '#ef4444',
  merge: '#64748b',
};

function nodeStyle(type: string) {
  const color = NODE_COLORS[type] || '#6b7280';
  return {
    background: '#1F2121',
    color: '#e5e7eb',
    border: `1px solid ${color}`,
    borderRadius: 8,
    padding: 8,
    fontSize: 12,
    minWidth: 120,
  };
}

const nodeTypes = ['input', 'output', 'agent', 'tool', 'conditional', 'merge'];

export default function GraphEditor() {
  const { graphId } = useParams<{ graphId: string }>();
  const [name, setName] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [gRes, aRes] = await Promise.all([
          api.get(`/api/graphs/${graphId}`),
          api.get('/api/agents'),
        ]);
        const g = gRes.data;
        setName(g.name);
        setNodes(
          (g.nodes || []).map((n: any) => ({
            id: n.id,
            type: 'default',
            position: n.position || { x: 100, y: 100 },
            data: { label: nodeLabel(n), nodeType: n.type, raw: n },
            style: nodeStyle(n.type),
          }))
        );
        setEdges(
          (g.edges || []).map((e: any, i: number) => ({
            id: e.id || `e-${i}`,
            source: e.source,
            target: e.target,
            label: e.label,
            condition: e.condition,
            data: { condition: e.condition },
            animated: false,
          }))
        );
        setAgents((aRes.data.agents || aRes.data || []).map((a: any) => a.name || a));
      } catch (e: any) {
        setError(e?.response?.data?.detail || 'Failed to load graph');
      }
    })();
  }, [graphId]);

  const nodeLabel = (n: any) => {
    if (n.type === 'agent') return `🤖 ${n.agent_name || 'agent'}`;
    if (n.type === 'tool') return `🔧 ${n.tool_name || 'tool'}`;
    if (n.type === 'input') return '📥 Input';
    if (n.type === 'output') return '📤 Output';
    if (n.type === 'conditional') return '🔀 If/Else';
    if (n.type === 'merge') return '∪ Merge';
    return n.type;
  };

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, id: `e-${Date.now()}` }, eds));
  }, [setEdges]);

  const onNodeClick = useCallback((_e: any, node: Node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  }, []);

  const onEdgeClick = useCallback((_e: any, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);

  const addNode = (type: string) => {
    const id = `${type}-${Date.now()}`;
    const newNode: Node = {
      id,
      type: 'default',
      position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: {
        label: type === 'agent' ? '🤖 agent' : type === 'tool' ? '🔧 tool' : type === 'input' ? '📥 Input' : type === 'output' ? '📤 Output' : type === 'conditional' ? '🔀 If/Else' : '∪ Merge',
        nodeType: type,
        raw: { id, type, config: {} },
      },
      style: nodeStyle(type),
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const updateSelectedNode = (patch: any) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== selectedNode.id) return n;
        const raw = { ...(n.data.raw || {}), ...patch };
        return {
          ...n,
          data: { ...n.data, label: nodeLabel(raw), raw },
          style: nodeStyle(raw.type),
        };
      })
    );
    setSelectedNode((prev) => (prev ? { ...prev, data: { ...prev.data, raw: { ...(prev.data.raw || {}), ...patch } } } : prev));
  };

  const deleteSelected = () => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  };

  const serialize = () => {
    const nodesPayload = nodes.map((n) => {
      const raw = n.data?.raw || {};
      return {
        id: n.id,
        type: raw.type || 'agent',
        agent_name: raw.agent_name,
        tool_name: raw.tool_name,
        config: raw.config || {},
        position: n.position,
      };
    });
    const edgesPayload = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      condition: (e as any).condition,
      label: e.label,
    }));
    return { nodes: nodesPayload, edges: edgesPayload };
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { nodes: ns, edges: es } = serialize();
      await api.put(`/api/graphs/${graphId}`, { name, nodes: ns, edges: es });
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const runGraph = async () => {
    setRunning(true);
    setError(null);
    setRun(null);
    try {
      await save();
      const { data } = await api.post(`/api/graphs/${graphId}/run`, { inputs: {}, stream: false });
      setRun(data);
      // poll
      const poll = async () => {
        for (let i = 0; i < 120; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const { data: r } = await api.get(`/api/graphs/${graphId}/runs/${data.run_id}`);
          setRun(r);
          if (r.status === 'completed' || r.status === 'failed') break;
        }
        setRunning(false);
      };
      poll();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Run failed');
      setRunning(false);
    }
  };

  const selectedRaw = selectedNode?.data?.raw || {};

  return (
    <div className="h-screen flex flex-col bg-[#191A1A]">
      <div className="h-14 flex items-center justify-between px-4 border-b border-[#1F2121] bg-[#0D0E0E]">
        <div className="flex items-center gap-3">
          <Link to="/graphs" className="p-2 hover:bg-[#1F2121] rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-transparent text-white font-semibold text-lg outline-none border-b border-transparent focus:border-[#1FB8CD]"
          />
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-sm text-red-400">{error}</span>}
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[#1F2121] hover:bg-[#252525] text-gray-200 border border-gray-700 rounded-lg disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
          <button
            onClick={runGraph}
            disabled={running}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[#1FB8CD] hover:bg-[#1AA5B8] text-white rounded-lg disabled:opacity-50"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Palette */}
        <aside className="w-44 border-r border-[#1F2121] bg-[#0D0E0E] p-3 space-y-2 overflow-y-auto">
          <div className="text-xs uppercase text-gray-500 font-semibold mb-2">Nodes</div>
          {nodeTypes.map((t) => (
            <button
              key={t}
              onClick={() => addNode(t)}
              className="w-full text-left px-3 py-2 text-sm rounded-lg border border-gray-800 hover:border-[#1FB8CD]/40 text-gray-200 bg-[#191A1A]"
              style={{ borderLeftColor: NODE_COLORS[t], borderLeftWidth: 3 }}
            >
              {t === 'input' && '📥 Input'}
              {t === 'output' && '📤 Output'}
              {t === 'agent' && '🤖 Agent'}
              {t === 'tool' && '🔧 Tool'}
              {t === 'conditional' && '🔀 If/Else'}
              {t === 'merge' && '∪ Merge'}
            </button>
          ))}
        </aside>

        {/* Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            fitView
            style={{ background: '#191A1A' }}
          >
            <Background color="#2A2C2C" gap={20} />
            <Controls />
            <MiniMap nodeColor={(n) => NODE_COLORS[n.data?.raw?.type] || '#6b7280'} maskColor="rgba(0,0,0,0.6)" />
          </ReactFlow>

          {/* Run result overlay */}
          {run && (
            <div className="absolute bottom-4 right-4 w-96 max-h-80 overflow-auto bg-[#0D0E0E] border border-gray-800 rounded-lg p-4 text-sm">
              <div className="flex items-center gap-2 mb-2">
                {run.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                {run.status === 'failed' && <XCircle className="w-4 h-4 text-red-400" />}
                {run.status === 'running' && <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />}
                <span className="font-semibold text-white">{run.status}</span>
                <span className="text-xs text-gray-500 ml-auto">{run.run_id?.slice(0, 8)}</span>
              </div>
              {run.error && <div className="text-red-400 text-xs mb-2">{run.error}</div>}
              {run.node_results && (
                <div className="space-y-1">
                  {Object.entries(run.node_results).map(([nid, r]: any) => (
                    <div key={nid} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${r.status === 'completed' ? 'bg-green-400' : r.status === 'failed' ? 'bg-red-400' : r.status === 'skipped' ? 'bg-gray-500' : 'bg-cyan-400 animate-pulse'}`} />
                        <span className="text-gray-300">{nid}</span>
                        <span className="text-gray-500 ml-auto">{r.status}</span>
                      </div>
                      {r.error && <div className="ml-4 text-red-400 break-words">{r.error}</div>}
                    </div>
                  ))}
                </div>
              )}
              {run.trace_job_id && (
                <Link
                  to={`/playground-history/${run.trace_job_id}`}
                  className="mt-3 inline-flex items-center gap-1 text-xs text-[#1FB8CD] hover:underline"
                >
                  View traces in Playground History →
                </Link>
              )}
              {run.outputs && (
                <pre className="mt-3 max-h-32 overflow-auto text-xs text-gray-300 bg-[#191A1A] rounded p-2 whitespace-pre-wrap">
                  {typeof run.outputs === 'string' ? run.outputs : JSON.stringify(run.outputs, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Config panel */}
        <aside className="w-72 border-l border-[#1F2121] bg-[#0D0E0E] p-4 overflow-y-auto">
          {selectedEdge ? (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-white">Edge condition</h3>
              <div className="text-xs text-gray-500 font-mono">{selectedEdge.source} → {selectedEdge.target}</div>
              <label className="block">
                <span className="text-xs text-gray-400">Field (in upstream output)</span>
                <input
                  value={(selectedEdge as any).condition?.field || (selectedEdge as any).data?.condition?.field || 'branch'}
                  onChange={(e) => {
                    const cond = { ...(selectedEdge as any).condition, field: e.target.value };
                    setEdges((eds) => eds.map((ed) => ed.id === selectedEdge.id ? { ...ed, data: { ...ed.data, condition: cond }, condition: cond } as any : ed));
                    setSelectedEdge((prev: Edge | null) => prev ? { ...prev, condition: cond } as any : prev);
                  }}
                  className="mt-1 w-full bg-[#191A1A] border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-400">Must equal</span>
                <input
                  value={(selectedEdge as any).condition?.equals || (selectedEdge as any).data?.condition?.equals || 'true'}
                  onChange={(e) => {
                    const cond = { ...(selectedEdge as any).condition, equals: e.target.value };
                    setEdges((eds) => eds.map((ed) => ed.id === selectedEdge.id ? { ...ed, data: { ...ed.data, condition: cond }, condition: cond } as any : ed));
                    setSelectedEdge((prev: Edge | null) => prev ? { ...prev, condition: cond } as any : prev);
                  }}
                  className="mt-1 w-full bg-[#191A1A] border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200"
                />
              </label>
              <p className="text-xs text-gray-500">Leave both as default for an unconditional edge.</p>
            </div>
          ) : selectedNode ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Node config</h3>
                <button onClick={deleteSelected} className="text-gray-500 hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="text-xs text-gray-500 font-mono">{selectedNode.id}</div>

              <label className="block">
                <span className="text-xs text-gray-400">Type</span>
                <select
                  value={selectedRaw.type || 'agent'}
                  onChange={(e) => updateSelectedNode({ type: e.target.value })}
                  className="mt-1 w-full bg-[#191A1A] border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200"
                >
                  {nodeTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>

              {selectedRaw.type === 'agent' && (
                <label className="block">
                  <span className="text-xs text-gray-400">Agent</span>
                  <select
                    value={selectedRaw.agent_name || ''}
                    onChange={(e) => updateSelectedNode({ agent_name: e.target.value })}
                    className="mt-1 w-full bg-[#191A1A] border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200"
                  >
                    <option value="">— select —</option>
                    {agents.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
              )}

              {selectedRaw.type === 'tool' && (
                <label className="block">
                  <span className="text-xs text-gray-400">Tool name</span>
                  <input
                    value={selectedRaw.tool_name || ''}
                    onChange={(e) => updateSelectedNode({ tool_name: e.target.value })}
                    className="mt-1 w-full bg-[#191A1A] border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200"
                    placeholder="web_search"
                  />
                </label>
              )}

              {selectedRaw.type === 'agent' && (
                <>
                  <label className="block">
                    <span className="text-xs text-gray-400">Prompt / task</span>
                    <textarea
                      value={selectedRaw.config?.prompt || ''}
                      onChange={(e) =>
                        updateSelectedNode({
                          config: { ...(selectedRaw.config || {}), prompt: e.target.value },
                        })
                      }
                      rows={4}
                      className="mt-1 w-full bg-[#191A1A] border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200"
                      placeholder="What should this agent do?"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!selectedRaw.config?.allow_delegation}
                      onChange={(e) =>
                        updateSelectedNode({
                          config: { ...(selectedRaw.config || {}), allow_delegation: e.target.checked },
                        })
                      }
                      className="rounded"
                    />
                    <span className="text-xs text-gray-400">Allow delegation to other agents</span>
                  </label>
                </>
              )}

              {selectedRaw.type === 'tool' && (
                <label className="block">
                  <span className="text-xs text-gray-400">Tool arguments (key: value, one per line)</span>
                  <textarea
                    value={Object.entries(selectedRaw.config?.args || {})
                      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
                      .join('\n')}
                    onChange={(e) => {
                      const args: Record<string, any> = {};
                      e.target.value.split('\n').forEach((line) => {
                        const idx = line.indexOf(':');
                        if (idx > 0) {
                          const key = line.slice(0, idx).trim();
                          const raw = line.slice(idx + 1).trim();
                          if (!key) return;
                          try {
                            args[key] = JSON.parse(raw);
                          } catch {
                            args[key] = raw;
                          }
                        }
                      });
                      updateSelectedNode({ config: { ...(selectedRaw.config || {}), args } });
                    }}
                    rows={5}
                    className="mt-1 w-full bg-[#191A1A] border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 font-mono"
                    placeholder={'query: quantum computing\nnum_results: 5'}
                  />
                </label>
              )}

              {selectedRaw.type === 'conditional' && (
                <>
                  <label className="block">
                    <span className="text-xs text-gray-400">Condition field (in upstream output)</span>
                    <input
                      value={selectedRaw.config?.condition_field || 'branch'}
                      onChange={(e) =>
                        updateSelectedNode({
                          config: { ...(selectedRaw.config || {}), condition_field: e.target.value },
                        })
                      }
                      className="mt-1 w-full bg-[#191A1A] border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200"
                      placeholder="branch"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-gray-400">Must equal</span>
                    <input
                      value={selectedRaw.config?.condition_equals || 'true'}
                      onChange={(e) =>
                        updateSelectedNode({
                          config: { ...(selectedRaw.config || {}), condition_equals: e.target.value },
                        })
                      }
                      className="mt-1 w-full bg-[#191A1A] border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200"
                      placeholder="true"
                    />
                  </label>
                  <p className="text-xs text-gray-500">
                    Outgoing edges are taken only when the upstream output's field matches. Configure the condition on each edge in Advanced mode.
                  </p>
                </>
              )}

              {(selectedRaw.type === 'input' || selectedRaw.type === 'output' || selectedRaw.type === 'merge') && (
                <p className="text-xs text-gray-500">No configuration needed — this node passes data through.</p>
              )}

              <details className="mt-4">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">Advanced (raw JSON)</summary>
                <textarea
                  value={JSON.stringify(selectedRaw.config || {}, null, 2)}
                  onChange={(e) => {
                    try {
                      updateSelectedNode({ config: JSON.parse(e.target.value) });
                    } catch {
                      /* ignore parse errors while typing */
                    }
                  }}
                  rows={6}
                  className="mt-2 w-full bg-[#191A1A] border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 font-mono"
                />
              </details>
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              <Settings2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
              Select a node to configure it.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
