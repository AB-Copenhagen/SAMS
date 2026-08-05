'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import type { PublicAsset } from '../lib/collections';
import { buildShareCaption } from '../lib/social';
import { DOWNLOAD_PRESETS, displayDate, exportUrl, isImage, originalUrl } from '../lib/public-asset-share';

export { DOWNLOAD_PRESETS, isImage, originalUrl, exportUrl, quickDownloadUrl, displayDate, previewUrl } from '../lib/public-asset-share';

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

function useShareFilesCapable(): boolean {
  const [capable, setCapable] = useState(false);
  useEffect(() => {
    setCapable(typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function');
  }, []);
  return capable;
}

/**
 * A plain downloaded file lands in Files (iOS) / Downloads (Android) — there's no web API to
 * write directly into the system Photos library. The Web Share API's file support is the closest
 * equivalent: handing the browser a File opens the native share sheet, which offers "Save
 * Image"/"Save Video" as a direct action there. Returns false (never throws) on anything short of
 * success so the caller can fall back to a normal download.
 */
async function saveToPhotos(url: string, filename: string, mimeType: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const blob = await res.blob();
    const file = new File([blob], filename, { type: blob.type || mimeType });
    if (!navigator.canShare({ files: [file] })) return false;
    await navigator.share({ files: [file] });
    return true;
  } catch {
    return false;
  }
}

/** Only renders where the browser can plausibly hand a file to the OS share sheet — plain `<a>` downloads elsewhere are unaffected. */
function SaveToPhotosButton({ url, filename, mimeType }: { url: string; filename: string; mimeType: string }) {
  const capable = useShareFilesCapable();
  const [saving, setSaving] = useState(false);
  if (!capable) return null;

  async function handleClick() {
    setSaving(true);
    const ok = await saveToPhotos(url, filename, mimeType);
    setSaving(false);
    if (!ok) window.location.href = url;
  }

  return (
    <button
      type="button"
      className="btn-primary"
      onClick={handleClick}
      disabled={saving}
      style={{ fontSize: 12, padding: '10px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      {saving ? <><span className="spinner" /> Preparing…</> : '📲 Save to Photos'}
    </button>
  );
}

export function DownloadOptions({ token, asset }: { token: string; asset: PublicAsset }) {
  if (!isImage(asset)) {
    const url = originalUrl(token, asset.id);
    const filename = `${(asset.title || asset.eventName || 'video').replace(/[^a-z0-9-_]/gi, '-')}.${asset.fileType.split('/')[1] || 'mp4'}`;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <SaveToPhotosButton url={url} filename={filename} mimeType={asset.fileType} />
        <a className="btn-secondary" style={{ textDecoration: 'none', display: 'inline-block' }} href={url}>
          Download
        </a>
      </div>
    );
  }

  const jpegFilename = `${(asset.title || asset.eventName || 'photo').replace(/[^a-z0-9-_]/gi, '-')}.jpg`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, color: '#8890b4' }}>Download as</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <SaveToPhotosButton url={exportUrl(token, asset.id, 'web')} filename={jpegFilename} mimeType="image/jpeg" />
        {DOWNLOAD_PRESETS.map((p) => (
          <a key={p.key} className="btn-secondary" style={{ textDecoration: 'none', fontSize: 12, padding: '10px 12px' }} href={exportUrl(token, asset.id, p.key)}>
            {p.label}
          </a>
        ))}
        <a className="btn-secondary" style={{ textDecoration: 'none', fontSize: 12, padding: '10px 12px' }} href={originalUrl(token, asset.id)}>
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
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: color,
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 15,
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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
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
