import { useMemo } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, Menu } from 'lucide-react';

/* Segment → human label. Keeps "Playground History" from becoming "Playground History" via dashes only. */
const LABELS: Record<string, string> = {
  playground: 'Playground',
  'playground-history': 'Playground History',
  reports: 'Reports',
  traces: 'Traces',
  batches: 'Batches',
  logs: 'Logs',
  settings: 'Settings',
  graphs: 'Graphs',
  agents: 'Agents',
  dashboard: 'Dashboard',
};

function toLabel(segment: string) {
  const decoded = decodeURIComponent(segment);
  if (LABELS[decoded]) return LABELS[decoded];
  return decoded
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

interface HeaderProps {
  onOpenMobileNav: () => void;
}

export default function Header({ onOpenMobileNav }: HeaderProps) {
  const location = useLocation();

  const breadcrumbs = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean);
    const crumbs = [{ name: 'Home', path: '/' }];
    let current = '';
    segments.forEach((segment) => {
      current += `/${segment}`;
      crumbs.push({ name: toLabel(segment), path: current });
    });
    return crumbs;
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-md sm:px-6">
      <button
        onClick={onOpenMobileNav}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-muted
          hover:bg-surface-overlay hover:text-ink transition-colors md:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1.5 overflow-hidden text-sm">
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <li key={crumb.path} className="flex items-center gap-1.5 min-w-0">
                {index > 0 && (
                  <ChevronRight
                    className="h-3.5 w-3.5 shrink-0 text-ink-faint"
                    aria-hidden
                  />
                )}
                {isLast ? (
                  <span
                    className="truncate font-medium text-ink"
                    aria-current="page"
                  >
                    {crumb.name}
                  </span>
                ) : (
                  <Link
                    to={crumb.path}
                    className="shrink-0 text-ink-subtle transition-colors hover:text-ink"
                  >
                    {crumb.name}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </header>
  );
}
