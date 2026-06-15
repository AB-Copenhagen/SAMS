import type { User } from '../lib/auth';
import NavLinks from './NavLinks';
import LogoutButton from './LogoutButton';

export default function AppShell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">AB</div>
          <div>
            <div className="sidebar-logo-text">AB Media</div>
            <div className="sidebar-logo-sub">Asset Manager</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLinks role={user.role} />
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-name">{user.name ?? user.email}</div>
            <div className="user-role">{user.role}</div>
          </div>
          <LogoutButton />
        </div>
      </aside>

      <div className="main-content">
        <div className="page-body">{children}</div>
      </div>
    </div>
  );
}
