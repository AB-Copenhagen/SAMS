import Link from 'next/link';
import type { User } from '../lib/auth';
import LogoutButton from './LogoutButton';
import HeaderSearch from './HeaderSearch';

export default function TopHeader({
  user,
  onToggleSidebar,
}: {
  user: User;
  onToggleSidebar: () => void;
}) {
  return (
    <header className="top-header">
      <button
        type="button"
        className="top-header-toggle"
        aria-label="Open menu"
        onClick={onToggleSidebar}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/WhiteCrest-AB1889.png" alt="AB Copenhagen" className="top-header-mark" />
      <span className="top-header-text">AB Media</span>

      <div className="top-header-search">
        <HeaderSearch role={user.role} />
      </div>

      <div className="top-header-user">
        <Link href="/profile" className="top-header-user-info">
          <div className="top-header-user-name">{user.name ?? user.email}</div>
          <div className="top-header-user-role">{user.role}</div>
        </Link>
        <LogoutButton />
      </div>
    </header>
  );
}
