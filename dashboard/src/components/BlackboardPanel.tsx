import { useEffect, useState } from 'react';
import { Database } from 'lucide-react';
import api from '../lib/api';

interface BlackboardEntry {
  value: any;
  updated_by?: string | null;
  updated_at?: string | null;
}

export default function BlackboardPanel({ promptId }: { promptId: string }) {
  const [entries, setEntries] = useState<Record<string, BlackboardEntry>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await api.get<{ blackboard: Record<string, BlackboardEntry> }>(
          `/api/blackboard/${promptId}`
        );
        if (!cancelled) setEntries(data.blackboard || {});
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [promptId]);

  const keys = Object.keys(entries);
  return (
    <div className="bg-surface-raised rounded-lg border border-line">
      <div className="px-6 py-4 border-b border-line flex items-center gap-2">
        <Database className="w-4 h-4 text-primary-400" />
        <h2 className="text-lg font-semibold text-ink">Blackboard</h2>
        <span className="text-xs text-ink-faint ml-auto">{keys.length} keys</span>
      </div>
      <div className="p-6">
        {loading ? (
          <p className="text-sm text-ink-faint">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-ink-faint">No shared state yet. Agents write here as they collaborate.</p>
        ) : (
          <div className="space-y-3">
            {keys.map((key) => {
              const entry = entries[key];
              return (
                <div key={key} className="bg-canvas border border-line rounded p-3">
                  <div className="flex items-center justify-between mb-1">
                    <code className="text-sm text-primary-400 font-mono">{key}</code>
                    <span className="text-xs text-ink-faint">
                      {entry.updated_by || 'unknown'}
                      {entry.updated_at ? ` · ${new Date(entry.updated_at).toLocaleTimeString()}` : ''}
                    </span>
                  </div>
                  <pre className="text-xs text-ink-muted whitespace-pre-wrap break-words">
                    {typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value, null, 2)}
                  </pre>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
