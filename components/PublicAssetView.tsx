'use client';

import { useState, type CSSProperties } from 'react';
import type { PublicAsset } from '../lib/collections';
import { buildShareCaption } from '../lib/social';

// Kept in sync with lib/export-presets.ts's EXPORT_PRESETS keys/labels — duplicated here (rather
// than imported) because that module pulls in `sharp`, which can't be bundled into client code.
export const DOWNLOAD_PRESETS: { key: string; label: string }[] = [
  { key: 'web', label: 'Web' },
  { key: 'instagram-square', label: 'Instagram (square)' },
  { key: 'instagram-story', label: 'Instagram (story)' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'linkedin', label: 'LinkedIn' },
];

export function isImage(asset: PublicAsset) {
  return asset.fileType.startsWith('image/');
}

export function originalUrl(token: string, assetId: string) {
  return `/api/share/${token}/assets/${assetId}/download`;
}

export function exportUrl(token: string, assetId: string, preset: string) {
  return `/api/share/${token}/assets/${assetId}/export?preset=${preset}`;
}

/** Fast default for quick-tap downloads — web-optimized for photos, original for video (no resize pipeline). */
export function quickDownloadUrl(token: string, asset: PublicAsset) {
  return isImage(asset) ? exportUrl(token, asset.id, 'web') : originalUrl(token, asset.id);
}

export function displayDate(asset: PublicAsset): { label: string; value: string } {
  if (asset.dateTaken) return { label: 'Taken', value: new Date(asset.dateTaken).toLocaleString('en-GB') };
  if (asset.eventDate) return { label: 'Event date', value: new Date(asset.eventDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) };
  return { label: 'Uploaded', value: new Date(asset.uploadedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) };
}

export function AssetDetails({ asset }: { asset: PublicAsset }) {
  const date = displayDate(asset);
  const hasTags = asset.tags.players.length > 0 || asset.tags.sponsors.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#3b4070' }}>
      {asset.description && <p style={{ margin: 0, color: '#3b4070' }}>{asset.description}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', color: '#6b7491' }}>
        {asset.eventName && <span><strong style={{ color: '#3b4070' }}>Match/Event:</strong> {asset.eventName}</span>}
        <span><strong style={{ color: '#3b4070' }}>{date.label}:</strong> {date.value}</span>
        {asset.location && <span><strong style={{ color: '#3b4070' }}>Location:</strong> {asset.location}</span>}
        {asset.rating != null && <span><strong style={{ color: '#3b4070' }}>Rating:</strong> {'★'.repeat(asset.rating)}</span>}
      </div>
      {hasTags && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
          {asset.tags.players.map((p) => (
            <span key={p.id} className="tag-chip">{p.name}{p.number != null ? ` #${p.number}` : ''}</span>
          ))}
          {asset.tags.sponsors.map((s) => (
            <span key={s.id} className="tag-chip">{s.name}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function DownloadOptions({ token, asset }: { token: string; asset: PublicAsset }) {
  if (!isImage(asset)) {
    return (
      <a className="btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }} href={originalUrl(token, asset.id)}>
        Download
      </a>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, color: '#8890b4' }}>Download as</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {DOWNLOAD_PRESETS.map((p) => (
          <a key={p.key} className="btn-secondary" style={{ textDecoration: 'none', fontSize: 12, padding: '5px 10px' }} href={exportUrl(token, asset.id, p.key)}>
            {p.label}
          </a>
        ))}
        <a className="btn-primary" style={{ textDecoration: 'none', fontSize: 12, padding: '5px 10px' }} href={originalUrl(token, asset.id)}>
          Original (full size)
        </a>
      </div>
    </div>
  );
}

/** Builds a permalink to the clean, standalone single-asset page — the thing meant to be handed to someone outside the org, not a deep link back into the full gallery. */
function assetPermalink(token: string, assetId: string): string {
  return `${window.location.origin}/s/${token}/${assetId}`;
}

function emailShareHref(url: string, text: string) {
  return `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(url)}`;
}

function ShareIconButton({ label, glyph, color, onClick, href }: { label: string; glyph: string; color: string; onClick?: () => void; href?: string }) {
  const style: CSSProperties = {
    width: 32,
    height: 32,
    borderRadius: '50%',
    background: color,
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 700,
    textDecoration: 'none',
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
  };
  if (href) {
    return <a href={href} target="_blank" rel="noopener noreferrer" title={label} aria-label={label} style={style}>{glyph}</a>;
  }
  return <button type="button" title={label} aria-label={label} onClick={onClick} style={style}>{glyph}</button>;
}

export function ShareAction({ token, asset }: { token: string; asset: PublicAsset }) {
  const [igCaptionCopied, setIgCaptionCopied] = useState(false);
  const [ttCaptionCopied, setTtCaptionCopied] = useState(false);

  const url = typeof window !== 'undefined' ? assetPermalink(token, asset.id) : '';
  const fallbackText = asset.title || asset.eventName || 'Check out this photo';
  const text = buildShareCaption(asset.shareText, fallbackText);

  // Neither Instagram nor TikTok has a web share-intent URL for posting — the standard flow on
  // both is to copy a caption and paste it manually when posting, so each gets its own copy
  // action rather than pretending a link would work.
  async function copyCaption(setCopied: (v: boolean) => void) {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, color: '#8890b4' }}>Share this</span>
      {asset.shareText && (
        <p style={{ margin: 0, fontSize: 12, color: '#6b7491', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
          &ldquo;{asset.shareText}&rdquo;
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <ShareIconButton
          label="Copy caption for Instagram"
          glyph={igCaptionCopied ? '✓' : '📷'}
          color={igCaptionCopied ? 'var(--color-primary)' : '#E1306C'}
          onClick={() => copyCaption(setIgCaptionCopied)}
        />
        <ShareIconButton
          label="Copy caption for TikTok"
          glyph={ttCaptionCopied ? '✓' : '🎵'}
          color={ttCaptionCopied ? 'var(--color-primary)' : '#000000'}
          onClick={() => copyCaption(setTtCaptionCopied)}
        />
        <ShareIconButton label="Email" glyph="✉" color="#6b7491" href={emailShareHref(url, text)} />
      </div>
    </div>
  );
}
