'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  id: string;
  isPublic: boolean;
  shareToken: string | null;
  appBaseUrl: string;
  expiresAt: string | Date | null;
}

/** yyyy-mm-dd for a date <input>, in local time so the picker shows the date the admin actually set. */
function toDateInputValue(value: string | Date): string {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AssetSharePanel({ id, isPublic, shareToken, appBaseUrl, expiresAt }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const shareUrl = shareToken ? `${appBaseUrl}/s/${shareToken}/${id}` : null;
  const isExpired = expiresAt != null && new Date(expiresAt).getTime() <= Date.now();

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/assets/${id}`, {
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
      <h3 style={{ marginTop: 0 }}>Public link</h3>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isPublic ? 12 : 0 }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input readOnly value={shareUrl ?? 'Generating…'} style={{ flex: 1, minWidth: 240 }} />
            <button className="btn-secondary" type="button" onClick={copyLink} disabled={!shareUrl}>
              {copied ? 'Copied!' : 'Copy link'}
            </button>
            <button className="btn-secondary" type="button" onClick={() => patch({ regenerateToken: true })} disabled={saving}>
              Regenerate link
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#8890b4', marginTop: 6, marginBottom: 0 }}>
            Anyone with this link can view and download this asset only — not the rest of its collection.
          </p>

          {isExpired && (
            <div className="alert alert-warning" style={{ marginTop: 10 }}>
              This link expired on {new Date(expiresAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} —
              visitors see a 404.
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#3b4070' }}>
              Link expires
              <input
                type="date"
                value={expiresAt ? toDateInputValue(expiresAt) : ''}
                disabled={saving}
                onChange={(e) => patch({ expiresAt: e.target.value ? `${e.target.value}T23:59:59` : null })}
              />
            </label>
            {expiresAt && (
              <button className="btn-secondary" type="button" disabled={saving} onClick={() => patch({ expiresAt: null })}>
                Clear expiry
              </button>
            )}
          </div>
        </>
      )}

      {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
}
