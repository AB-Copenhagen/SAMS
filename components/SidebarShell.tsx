'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import type { User } from '../lib/auth';
import NavLinks from './NavLinks';

// Below the sidebar's collapse breakpoint (see `@media (max-width: 860px)` in globals.css) the
// sidebar is off-canvas by default; `open`/`onClose` (lifted into AppShell, toggled from
// TopHeader's drawer button) control whether it's slid in via `.sidebar-open`, and it closes
// itself again on navigation or backdrop tap.
export default function SidebarShell({
  user,
  open,
  onClose,
}: {
  user: User;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => { onClose(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} />}

      <aside className={`sidebar${open ? ' sidebar-open' : ''}`}>
        <div className="sidebar-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/WhiteCrest-AB1889.png" alt="AB Copenhagen" className="sidebar-logo-mark" />
          <div>
            <div className="sidebar-logo-text">AB Media</div>
            <div className="sidebar-logo-sub">Asset Manager</div>
          </div>
          <button type="button" className="sidebar-close" aria-label="Close menu" onClick={onClose}>
            ×
          </button>
        </div>

        <nav className="sidebar-nav">
          <NavLinks role={user.role} />
        </nav>
      </aside>
    </>
  );
}
