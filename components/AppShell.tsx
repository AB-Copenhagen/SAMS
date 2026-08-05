import type { User } from '../lib/auth';
import { prisma } from '../lib/db';
import { REVIEWABLE_ASSET_WHERE } from '../lib/asset-review';
import SidebarShell from './SidebarShell';

export default async function AppShell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const unreviewedCount = await prisma.asset.count({ where: REVIEWABLE_ASSET_WHERE });

  return (
    <div className="app-shell">
      <SidebarShell user={user} unreviewedCount={unreviewedCount} />

      <div className="main-content">
        <div className="page-body">{children}</div>
      </div>
    </div>
  );
}
