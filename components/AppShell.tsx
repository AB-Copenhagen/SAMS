import type { User } from '../lib/auth';
import { getCachedUnreviewedCount } from '../lib/asset-review';
import SidebarShell from './SidebarShell';

export default async function AppShell({
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
  const unreviewedCount = await getCachedUnreviewedCount();

  return (
    <div className="app-shell">
      <SidebarShell user={user} unreviewedCount={unreviewedCount} />

      <div className="main-content">
        <div className={`page-body${wide ? ' page-body-wide' : ''}`}>{children}</div>
      </div>
    </div>
  );
}
