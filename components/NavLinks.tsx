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

export type NavItemDef = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Whether this item's href matches the given pathname (handles nested routes). */
  isActive: (pathname: string) => boolean;
  /** Omitted = visible to any logged-in role. */
  minRole?: 'STAFF' | 'ADMIN';
};

export type NavSectionDef = {
  label: string;
  items: NavItemDef[];
};

// Single source of truth for sidebar nav + the header search's "Go to" results
// (components/HeaderSearch.tsx) — add a destination here once, it shows up in both.
export const NAV_SECTIONS: NavSectionDef[] = [
  {
    label: 'Library',
    items: [
      {
        href: '/home',
        label: 'Home',
        isActive: (p) => p === '/home' || p === '/',
        icon: (
          <Icon>
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </Icon>
        ),
      },
      {
        href: '/upload',
        label: 'Upload',
        isActive: (p) => p.startsWith('/upload'),
        icon: (
          <Icon>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </Icon>
        ),
      },
      {
        href: '/ingest/mobile',
        label: 'Quick capture',
        isActive: (p) => p.startsWith('/ingest/mobile'),
        icon: (
          <Icon>
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </Icon>
        ),
      },
      {
        href: '/media',
        label: 'Media library',
        isActive: (p) => p.startsWith('/media'),
        icon: (
          <Icon>
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </Icon>
        ),
      },
      {
        href: '/collections',
        label: 'Collections',
        isActive: (p) => p.startsWith('/collections'),
        icon: (
          <Icon>
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </Icon>
        ),
      },
    ],
  },
  {
    label: 'CRM',
    items: [
      {
        href: '/customers',
        label: 'Customers',
        isActive: (p) => p.startsWith('/customers') && !p.startsWith('/customers/reports'),
        minRole: 'STAFF',
        icon: (
          <Icon>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </Icon>
        ),
      },
      {
        href: '/customers/reports',
        label: 'Reports',
        isActive: (p) => p.startsWith('/customers/reports'),
        minRole: 'STAFF',
        icon: (
          <Icon>
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </Icon>
        ),
      },
      {
        href: '/customers/match-activity',
        label: 'Match activity',
        isActive: (p) => p.startsWith('/customers/match-activity'),
        minRole: 'STAFF',
        icon: (
          <Icon>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </Icon>
        ),
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        href: '/jobs',
        label: 'Jobs',
        isActive: (p) => p.startsWith('/jobs'),
        minRole: 'ADMIN',
        icon: (
          <Icon>
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </Icon>
        ),
      },
      {
        href: '/analytics',
        label: 'Analytics',
        isActive: (p) => p.startsWith('/analytics'),
        minRole: 'ADMIN',
        icon: (
          <Icon>
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </Icon>
        ),
      },
      {
        href: '/configure',
        label: 'Configure',
        isActive: (p) => p.startsWith('/configure'),
        icon: (
          <Icon>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </Icon>
        ),
      },
      {
        href: '/admin/users',
        label: 'Users',
        isActive: (p) => p.startsWith('/admin/users'),
        minRole: 'ADMIN',
        icon: (
          <Icon>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 11h-6" />
          </Icon>
        ),
      },
    ],
  },
];

// ADMIN implies STAFF-level access and up — see isStaffOrAdmin in lib/auth.ts.
const ROLE_RANK: Record<string, number> = { ADMIN: 2, STAFF: 1 };

export function visibleNavSections(role: string): NavSectionDef[] {
  return NAV_SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.minRole || (ROLE_RANK[role] ?? 0) >= ROLE_RANK[item.minRole]),
    }))
    .filter((section) => section.items.length > 0);
}

function NavItem({ item, active }: { item: NavItemDef; active: boolean }) {
  return (
    <Link href={item.href} className={'nav-item' + (active ? ' active' : '')}>
      {item.icon}
      <span className="nav-text">{item.label}</span>
    </Link>
  );
}

export default function NavLinks({ role }: { role: string }) {
  const pathname = usePathname();
  const sections = visibleNavSections(role);

  return (
    <>
      {sections.map((section, i) => (
        <div key={section.label}>
          {i > 0 && <div className="nav-divider" />}
          <div className="nav-section">{section.label}</div>
          {section.items.map((item) => (
            <NavItem key={item.href} item={item} active={item.isActive(pathname)} />
          ))}
        </div>
      ))}
    </>
  );
}
