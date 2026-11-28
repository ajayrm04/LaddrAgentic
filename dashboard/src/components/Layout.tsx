import { ReactNode, useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import LoadingOverlay from './LoadingOverlay';
import { useAgentsAndToolsLoading } from '../lib/hooks/useAgentsAndToolsLoading';

interface LayoutProps {
  children: ReactNode;
}

const SIDEBAR_KEY = 'laddr.sidebar.collapsed';

export default function Layout({ children }: LayoutProps) {
  const { isLoading, agentsCount, loadedToolsCount } = useAgentsAndToolsLoading();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
      } catch {
        /* storage unavailable — state still works for the session */
      }
      return next;
    });
  }, []);

  /* Lock body scroll while the mobile drawer is open */
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <LoadingOverlay
        isLoading={isLoading}
        message="Loading agents and MCP tools..."
        progress={
          agentsCount > 0
            ? { current: loadedToolsCount, total: agentsCount }
            : undefined
        }
      />

      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onToggle={toggleSidebar}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header onOpenMobileNav={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1600px] animate-fade-in" key={location.pathname}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
