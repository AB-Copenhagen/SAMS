'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  id: string;
  isPublic: boolean;
  hasPassword: boolean;
  shareToken: string | null;
  appBaseUrl: string;
}

export default function CollectionSharePanel({ id, isPublic, hasPassword, shareToken, appBaseUrl }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const shareUrl = shareToken ? `${appBaseUrl}/s/${shareToken}` : null;

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/collections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setSaving(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Sharing</h3>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={isPublic}
            disabled={saving}
            onChange={(e) => patch({ isPublic: e.target.checked })}
          />
          Public link enabled
        </label>
      </div>

      {isPublic && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input readOnly value={shareUrl ?? 'Generating…'} style={{ flex: 1, minWidth: 240 }} />
            <button className="btn-secondary" type="button" onClick={copyLink} disabled={!shareUrl}>
              {copied ? 'Copied!' : 'Copy link'}
            </button>
            <button className="btn-secondary" type="button" onClick={() => patch({ regenerateToken: true })} disabled={saving}>
              Regenerate link
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#6b7491' }}>
              {hasPassword ? 'Password required to view/download' : 'No password — anyone with the link can view/download'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder={hasPassword ? 'New password' : 'Set a password (optional)'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ maxWidth: 220 }}
            />
            <button
              className="btn-primary"
              type="button"
              disabled={saving || !password.trim()}
              onClick={async () => { await patch({ password }); setPassword(''); }}
            >
              {hasPassword ? 'Change password' : 'Set password'}
            </button>
            {hasPassword && (
              <button className="btn-secondary" type="button" disabled={saving} onClick={() => patch({ password: null })}>
                Remove password
              </button>
            )}
          </div>
        </>
      )}

      {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
}
