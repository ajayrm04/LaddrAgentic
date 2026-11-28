import { useMemo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home,
  Users,
  Play,
  Clock,
  GitBranch,
  Terminal,
  Settings,
  LogOut,
  FileText,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Layers,
} from 'lucide-react';
import clsx from 'clsx';
import { logout, getCurrentUser } from '../lib/auth';

interface NavItem {
  name: string;
  href: string;
  icon: typeof Home;
  end?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const groups: NavGroup[] = [
  {
    label: 'Build',
    items: [
      { name: 'Dashboard', href: '/', icon: Home, end: true },
      { name: 'Agents', href: '/agents', icon: Users },
      { name: 'Playground', href: '/playground', icon: Play },
      { name: 'History', href: '/playground-history', icon: Clock },
      { name: 'Graphs', href: '/graphs', icon: Network },
      { name: 'Reports', href: '/reports', icon: FileText },
    ],
  },
  {
    label: 'Observe',
    items: [
      { name: 'Traces', href: '/traces', icon: GitBranch },
      { name: 'Batches', href: '/batches', icon: Layers },
      { name: 'Logs', href: '/logs', icon: Terminal },
    ],
  },
  {
    label: 'Manage',
    items: [{ name: 'Settings', href: '/settings', icon: Settings }],
  },
];

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggle: () => void;
  onMobileClose: () => void;
}

export default function Sidebar({
  collapsed,
  mobileOpen,
  onToggle,
  onMobileClose,
}: SidebarProps) {
  const navigate = useNavigate();
  const user = getCurrentUser();

  const initials = useMemo(() => {
    const name = user?.username || 'Guest';
    return name
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('');
  }, [user?.username]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const linkClass = (isActive: boolean) =>
    clsx(
      'group relative flex items-center gap-3 rounded-md px-3 py-2 text-base font-medium',
      'transition-colors duration-150 ease-out',
      'focus-visible:ring-2 focus-visible:ring-primary-400/50',
      isActive
        ? 'bg-surface-overlay text-ink'
        : 'text-ink-muted hover:text-ink hover:bg-surface-raised'
    );

  return (
    <>
      {/* Mobile scrim */}
      <div
        onClick={onMobileClose}
        className={clsx(
          'fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 md:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        aria-hidden
      />

      <aside
        className={clsx(
          'z-50 flex h-screen shrink-0 flex-col border-r border-line bg-surface',
          'transition-[width,transform] duration-200 ease-out-expo',
          'max-md:fixed max-md:inset-y-0 max-md:left-0',
          collapsed ? 'w-[68px]' : 'w-60',
          mobileOpen
            ? 'max-md:translate-x-0'
            : 'max-md:-translate-x-full'
        )}
      >
        {/* Brand */}
        <div
          className={clsx(
            'flex h-14 shrink-0 items-center border-b border-line',
            collapsed ? 'justify-center px-2' : 'gap-2.5 px-4'
          )}
        >
          <span
            className={clsx(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-400/15 text-xs font-bold text-primary-300 ring-1 ring-primary-400/25',
              'transition-all duration-200'
            )}
            aria-hidden
          >
            L
          </span>
          {!collapsed && (
            <span className="text-[15px] font-semibold tracking-tight text-ink animate-fade-in">
              Laddr
            </span>
          )}
          <button
            onClick={onToggle}
            className={clsx(
              'ml-auto hidden md:flex h-7 w-7 items-center justify-center rounded-md text-ink-faint',
              'hover:bg-surface-overlay hover:text-ink transition-colors',
              collapsed && 'ml-0'
            )}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav
          className={clsx(
            'flex-1 overflow-y-auto overflow-x-hidden py-4',
            collapsed ? 'px-2' : 'px-3'
          )}
        >
          {groups.map((group) => (
            <div key={group.label} className="mb-5">
              {!collapsed && <div className="caption mb-2 px-2">{group.label}</div>}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.name}>
                    <NavLink
                      to={item.href}
                      end={item.end}
                      onClick={onMobileClose}
                      title={collapsed ? item.name : undefined}
                      className={({ isActive }) => linkClass(isActive)}
                    >
                      {({ isActive }) => (
                        <>
                          <span
                            className={clsx(
                              'absolute left-0 top-1/2 -translate-y-1/2 rounded-r bg-primary-400 transition-all duration-200',
                              isActive ? 'h-5 w-[3px]' : 'h-0 w-0'
                            )}
                            aria-hidden
                          />
                          <item.icon
                            className={clsx(
                              'h-[18px] w-[18px] shrink-0 transition-colors',
                              isActive
                                ? 'text-primary-400'
                                : 'text-ink-faint group-hover:text-ink-muted'
                            )}
                            strokeWidth={1.75}
                          />
                          {!collapsed && (
                            <span className="truncate">{item.name}</span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* User */}
        <div
          className={clsx(
            'shrink-0 border-t border-line p-3',
            collapsed && 'px-2'
          )}
        >
          <div
            className={clsx(
              'flex items-center gap-3',
              collapsed && 'flex-col gap-2'
            )}
          >
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full
                bg-primary-400/15 text-xs font-semibold text-primary-300
                ring-1 ring-primary-400/25"
              title={user?.username}
            >
              {initials || 'GU'}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-medium text-ink">
                  {user?.username || 'Guest User'}
                </div>
              </div>
            )}
            <button
              onClick={handleLogout}
              className={clsx(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-faint',
                'hover:bg-danger/10 hover:text-danger transition-colors',
                collapsed && 'mt-0'
              )}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
