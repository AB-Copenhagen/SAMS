'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface EmbedTokenInfo {
  token: string;
  createdAt: string | Date;
  createdBy: string;
}

interface Props {
  targetType: 'asset' | 'collection' | 'playlist';
  targetId: string;
  appBaseUrl: string;
  initialTokens: EmbedTokenInfo[];
  /** Collections only — a password-gated collection can't be embedded (no good UX for a mid-embed
   * password prompt), per spec. Always false for an asset or playlist target (neither has a
   * password concept). */
  passwordProtected?: boolean;
}

// Self-serve embed-link issuance (gh-123) — mirrors AssetSharePanel/CollectionSharePanel's own
// generate/copy/revoke UI pattern, kept as its own card rather than merged into those components
// since embed tokens are a wholly separate grant (lib/collections.ts's EmbedToken, not
// Asset/Collection.shareToken) with independent lifecycle. The schema (and API) support more than
// one outstanding embed token per target, but this UI surfaces only the most recent one at a
// time — simpler for self-serve use, and nothing in the spec calls for managing several at once.
export default function EmbedPanel({ targetType, targetId, appBaseUrl, initialTokens, passwordProtected = false }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const active = initialTokens[0] ?? null;
  const embedUrl = active ? `${appBaseUrl}/embed/${active.token}` : null;
  const iframeSnippet = embedUrl
    ? `<iframe src="${embedUrl}" data-sams-embed style="width:100%;border:0;" allowfullscreen></iframe>\n<script src="${appBaseUrl}/embed/player.js" async></script>`
    : null;

  async function generate() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/embed-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Request failed (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: string) {
    if (!confirm('Revoke this embed link? Any page embedding it will immediately stop showing this content.')) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/embed-tokens/${token}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  async function copySnippet() {
    if (!iframeSnippet) return;
    await navigator.clipboard.writeText(iframeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Embed</h3>

      {passwordProtected ? (
        <p style={{ fontSize: 13, color: '#8890b4', margin: 0 }}>
          This collection is password-protected and can&apos;t be embedded — remove the password above to enable embedding.
        </p>
      ) : active ? (
        <>
          <p style={{ fontSize: 13, color: '#6b7491', marginTop: 0 }}>
            Live — permanent until revoked. Paste this snippet into any page on the allowed destination domain.
          </p>
          <textarea
            readOnly
            value={iframeSnippet ?? ''}
            rows={3}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn-secondary" type="button" onClick={copySnippet}>
              {copied ? 'Copied!' : 'Copy embed code'}
            </button>
            <button className="btn-secondary" type="button" disabled={busy} onClick={() => revoke(active.token)}>
              Revoke
            </button>
          </div>
        </>
      ) : (
        <button className="btn-primary" type="button" disabled={busy} onClick={generate}>
          Generate embed code
        </button>
      )}

      {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
}
