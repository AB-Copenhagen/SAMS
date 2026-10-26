'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AppRole } from '../lib/descope';

const ROLE_OPTIONS: AppRole[] = ['USER', 'STAFF', 'ADMIN'];

export default function InviteStaffUserForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AppRole>('USER');
  const [inviting, setInviting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), role }),
    });
    setInviting(false);
    if (res.ok) {
      setEmail('');
      setRole('USER');
      router.refresh();
    } else {
      const body = await res.json().catch(() => null);
      alert(body?.message || 'Invite failed');
    }
  }

  return (
    <form onSubmit={submit} className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 16 }}>
      <div className="field" style={{ flex: 1, marginBottom: 0 }}>
        <label htmlFor="invite-email">Invite by email</label>
        <input
          id="invite-email"
          type="email"
          required
          placeholder="person@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="invite-role">Role</label>
        <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn-primary" disabled={inviting}>
        {inviting ? 'Inviting…' : '+ Invite'}
      </button>
    </form>
  );
}
