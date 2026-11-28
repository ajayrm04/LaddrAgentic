import { Server, Database, Zap, ExternalLink } from 'lucide-react';
import { useHealth } from '../lib/queries/health';
import { getApiDocsUrl } from '../lib/config';
import { PageHeader, Card, CardHeader, CardBody, Skeleton } from '../components/ui';

export default function Settings() {
  const { data: health, isLoading } = useHealth();

  const rows = [
    { icon: Server, label: 'Version', value: health?.version || 'Unknown' },
    { icon: Database, label: 'Database', value: health?.components?.database || 'Unknown' },
    { icon: Zap, label: 'Storage', value: health?.components?.storage || 'Unknown' },
    { icon: Server, label: 'Message Bus', value: health?.components?.message_bus || 'Unknown' },
  ];

  const links = [
    { title: 'API Documentation', desc: 'FastAPI interactive docs', href: getApiDocsUrl() },
    { title: 'MinIO Console', desc: 'Storage management', href: 'http://localhost:9001' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="System information and service endpoints for this Laddr instance."
      />

      <Card>
        <CardHeader
          icon={<Server className="h-4 w-4" />}
          title="System Information"
          subtitle="Read-only status reported by the API server."
        />
        <CardBody className="space-y-1">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9" />
              ))}
            </div>
          ) : (
            rows.map(({ icon: Icon, label, value }, i) => (
              <div
                key={label}
                className={`flex items-center justify-between gap-4 rounded-md px-3 py-2.5 transition-colors hover:bg-surface-raised ${
                  i < rows.length - 1 ? 'border-b border-line-subtle' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-overlay text-ink-subtle">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm text-ink-muted">{label}</span>
                </div>
                <span className="font-mono text-sm text-ink">{value}</span>
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={<ExternalLink className="h-4 w-4" />}
          title="Service Links"
          subtitle="Open these in a new tab."
        />
        <CardBody>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {links.map((link) => (
              <a
                key={link.title}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-raised
                  p-4 transition-all duration-150 hover:border-primary-400/40 hover:bg-surface-overlay
                  focus-visible:ring-2 focus-visible:ring-primary-400/50"
              >
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-ink">{link.title}</h3>
                  <p className="mt-0.5 text-xs text-ink-subtle">{link.desc}</p>
                </div>
                <ExternalLink className="h-4 w-4 shrink-0 text-ink-faint transition-colors group-hover:text-primary-400" />
              </a>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
