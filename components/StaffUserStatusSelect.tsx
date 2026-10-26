'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StaffUserStatus } from '../lib/staff-users';

const STATUS_OPTIONS: StaffUserStatus[] = ['PENDING', 'ACTIVE', 'SUSPENDED'];

export default function StaffUserStatusSelect({ email, status }: { email: string; status: StaffUserStatus }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function changeStatus(next: StaffUserStatus) {
    if (next === status) return;
    if (!confirm(`Change this user's status to ${next}?`)) return;
    setSaving(true);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(email)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      setSaving(false);
      alert('Status change failed');
    }
  }

  return (
    <select
      value={status}
      disabled={saving}
      onChange={(e) => changeStatus(e.target.value as StaffUserStatus)}
      style={{ font: 'inherit', background: 'none', color: 'inherit', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '4px 8px' }}
    >
      {STATUS_OPTIONS.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}
