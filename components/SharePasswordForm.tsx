'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SharePasswordForm({ token, name }: { token: string; name: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/share/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || 'Incorrect password');
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Incorrect password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/AB1889.png" alt="AB Copenhagen" className="login-logo-mark" />
          <div>
            <div className="login-title">{name}</div>
            <div className="login-subtitle">This collection is password protected</div>
          </div>
        </div>
        <form onSubmit={submit}>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>{error}</div>}
          <button className="btn-primary" type="submit" disabled={submitting || !password} style={{ width: '100%' }}>
            {submitting ? 'Checking…' : 'View collection'}
          </button>
        </form>
      </div>
    </div>
  );
}
