'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  id: string;
  isPublic: boolean;
  shareToken: string | null;
  appBaseUrl: string;
}

export default function AssetSharePanel({ id, isPublic, shareToken, appBaseUrl }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const shareUrl = shareToken ? `${appBaseUrl}/s/${shareToken}/${id}` : null;

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
        </>
      )}

      {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
}
