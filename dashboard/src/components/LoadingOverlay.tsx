import { Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
  progress?: {
    current: number;
    total: number;
  };
}

export default function LoadingOverlay({ isLoading, message, progress }: LoadingOverlayProps) {
  if (!isLoading) return null;

  const percent =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-canvas/92 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-5 px-6 text-center animate-fade-in">
        <div className="relative">
          <Loader2 className="h-9 w-9 animate-spin text-primary-400" />
          <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-primary-400/20" />
        </div>

        <div>
          <h3 className="text-base font-semibold text-ink">
            {message || 'Loading…'}
          </h3>
          {progress && (
            <div className="mx-auto mt-4 w-72 max-w-full">
              <div className="mb-2 flex items-center justify-between text-xs text-ink-subtle">
                <span>
                  Tools for {progress.current} of {progress.total} agents
                </span>
                <span className="tabular-nums font-medium text-ink-muted">
                  {percent}%
                </span>
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-surface-overlay"
                role="progressbar"
                aria-valuenow={percent ?? 0}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-primary-400 transition-[width] duration-500 ease-out-expo"
                  style={{ width: `${percent ?? 0}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-ink-faint">
          Connecting to MCP servers and discovering tools…
        </p>
      </div>
    </div>
  );
}
