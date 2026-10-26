'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AppRole } from '../lib/descope';

const ROLE_OPTIONS: AppRole[] = ['USER', 'STAFF', 'ADMIN'];

export default function UserRoleSelect({ email, role }: { email: string; role: AppRole }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function changeRole(next: AppRole) {
    if (next === role) return;
    if (!confirm(`Change this user's role to ${next}?`)) return;
    setSaving(true);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(email)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: next }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      setSaving(false);
      alert('Role change failed');
    }
  }

  return (
    <select
      value={role}
      disabled={saving}
      onChange={(e) => changeRole(e.target.value as AppRole)}
      style={{ font: 'inherit', background: 'none', color: 'inherit', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '4px 8px' }}
    >
      {ROLE_OPTIONS.map((r) => (
        <option key={r} value={r}>{r}</option>
      ))}
    </select>
  );
}
