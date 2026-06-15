'use client';

import { useDescope } from '@descope/react-sdk';
import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const sdk = useDescope();
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    await sdk.logout();
    router.push('/login');
  }

  return (
    <button type="button" className="btn-ghost" onClick={handleLogout} style={{ width: '100%', justifyContent: 'flex-start' }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
      Sign out
    </button>
  );
}
