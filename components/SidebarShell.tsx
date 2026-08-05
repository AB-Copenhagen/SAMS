'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { User } from '../lib/auth';
import NavLinks from './NavLinks';
import LogoutButton from './LogoutButton';

// Holds the mobile drawer open/closed state. Below the sidebar's collapse breakpoint (see
// `@media (max-width: 860px)` in globals.css) the sidebar is off-canvas by default; this is what
// slides it in via `.sidebar-open` and closes it again on navigation or backdrop tap.
export default function SidebarShell({ user, unreviewedCount }: { user: User; unreviewedCount: number }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <>
      <div className="mobile-topbar">
        <button
          type="button"
          className="sidebar-toggle"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/WhiteCrest-AB1889.png" alt="AB Copenhagen" className="mobile-topbar-mark" />
        <span className="mobile-topbar-text">AB Media</span>
      </div>

      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}

      <aside className={`sidebar${open ? ' sidebar-open' : ''}`}>
        <div className="sidebar-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/WhiteCrest-AB1889.png" alt="AB Copenhagen" className="sidebar-logo-mark" />
          <div>
            <div className="sidebar-logo-text">AB Media</div>
            <div className="sidebar-logo-sub">Asset Manager</div>
          </div>
          <button type="button" className="sidebar-close" aria-label="Close menu" onClick={() => setOpen(false)}>
            ×
          </button>
        </div>

        <nav className="sidebar-nav">
          <NavLinks role={user.role} unreviewedCount={unreviewedCount} />
        </nav>

        <div className="sidebar-footer">
          <Link href="/profile" className="user-info">
            <div className="user-name">{user.name ?? user.email}</div>
            <div className="user-role">{user.role}</div>
          </Link>
          <LogoutButton />
        </div>
      </aside>
    </>
  );
}
