import Link from 'next/link';
import type { User } from '../lib/auth';
import { prisma } from '../lib/db';
import { REVIEWABLE_IMAGE_WHERE } from '../lib/asset-review';
import NavLinks from './NavLinks';
import LogoutButton from './LogoutButton';

export default async function AppShell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const unreviewedCount = await prisma.asset.count({ where: REVIEWABLE_IMAGE_WHERE });

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ab-logo.svg" alt="AB Copenhagen" className="sidebar-logo-mark" />
          <div>
            <div className="sidebar-logo-text">AB Media</div>
            <div className="sidebar-logo-sub">Asset Manager</div>
          </div>
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

      <div className="main-content">
        <div className="page-body">{children}</div>
      </div>
    </div>
  );
}
