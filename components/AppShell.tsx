'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { User } from '../lib/auth';
import TopHeader from './TopHeader';
import SidebarShell from './SidebarShell';

export default function AppShell({
  user,
  wide,
  children,
}: {
  user: User;
  /** Lifts the default 1100px page-body cap for screens that benefit from the extra width on a
   * large monitor — the media gallery and asset detail views, not every page. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  return (
    <div className="app-shell">
      <TopHeader user={user} onToggleSidebar={() => setSidebarOpen((o) => !o)} />

      <div className="app-shell-body">
        <SidebarShell user={user} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="main-content">
          <div className={`page-body${wide ? ' page-body-wide' : ''}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}
