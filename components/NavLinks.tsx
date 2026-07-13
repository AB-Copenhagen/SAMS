'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

type NavItemProps = { href: string; label: string; icon: React.ReactNode; active: boolean; badge?: number };

function NavItem({ href, label, icon, active, badge }: NavItemProps) {
  return (
    <Link href={href} className={'nav-item' + (active ? ' active' : '')}>
      {icon}
      <span className="nav-text">{label}</span>
      {!!badge && <span className="nav-badge">{badge}</span>}
    </Link>
  );
}

function NavSection({ label }: { label: string }) {
  return (
    <div className="nav-section">
      <span>{label}</span>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  );
}

export default function NavLinks({ role, unreviewedCount = 0 }: { role: string; unreviewedCount?: number }) {
  const pathname = usePathname();

  return (
    <>
      <NavItem
        href="/home"
        label="Home"
        active={pathname === '/home' || pathname === '/'}
        icon={
          <Icon>
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </Icon>
        }
      />
      <NavItem
        href="/upload"
        label="Upload"
        active={pathname.startsWith('/upload')}
        icon={
          <Icon>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </Icon>
        }
      />
      <NavItem
        href="/review"
        label="Review"
        active={pathname.startsWith('/review')}
        badge={unreviewedCount}
        icon={
          <Icon>
            <path d="M20 6L9 17l-5-5" />
          </Icon>
        }
      />
      <NavItem
        href="/media"
        label="Media library"
        active={pathname.startsWith('/media')}
        icon={
          <Icon>
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </Icon>
        }
      />
      <NavItem
        href="/collections"
        label="Collections"
        active={pathname.startsWith('/collections')}
        icon={
          <Icon>
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </Icon>
        }
      />
      <NavItem
        href="/configure"
        label="Configure"
        active={pathname.startsWith('/configure')}
        icon={
          <Icon>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </Icon>
        }
      />

      {role === 'ADMIN' && (
        <NavItem
          href="/jobs"
          label="Jobs"
          active={pathname.startsWith('/jobs')}
          icon={
            <Icon>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </Icon>
          }
        />
      )}

      <div className="nav-divider" />

      <NavSection label="Library" />
      <NavSection label="Analytics" />
    </>
  );
}
