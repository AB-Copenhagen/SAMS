'use client';

import { useEffect, useRef, useState } from 'react';
import type { PublicAsset } from '../lib/collections';
import { buildShareCaption } from '../lib/social';
import { DOWNLOAD_PRESETS, exportUrl, isImage, originalUrl } from '../lib/public-asset-share';

export { DOWNLOAD_PRESETS, isImage, originalUrl, exportUrl, quickDownloadUrl, previewUrl } from '../lib/public-asset-share';

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

/** Builds a permalink to the clean, standalone single-asset page — the thing meant to be handed to someone outside the org, not a deep link back into the full gallery. */
function assetPermalink(token: string, assetId: string): string {
  return `${window.location.origin}/s/${token}/${assetId}`;
}

function emailShareHref(url: string, text: string) {
  return `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(url)}`;
}

function MenuDivider() {
  return <div className="save-share-divider" />;
}

/**
 * Everything the visitor can do with a photo, collapsed into one dropdown so the photo itself is
 * the only thing on screen by default. Consolidates what used to be three separate always-visible
 * button rows (save to photos, download presets, share captions).
 */
export function SaveShareMenu({ token, asset }: { token: string; asset: PublicAsset }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [igCopied, setIgCopied] = useState(false);
  const [ttCopied, setTtCopied] = useState(false);
  const shareCapable = useShareFilesCapable();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const url = typeof window !== 'undefined' ? assetPermalink(token, asset.id) : '';
  const fallbackText = asset.title || asset.eventName || 'Check out this photo';
  const captionText = buildShareCaption(asset.shareText, fallbackText);

  async function copyCaption(setCopied: (v: boolean) => void) {
    await navigator.clipboard.writeText(`${captionText}\n${url}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSaveToPhotos() {
    const video = !isImage(asset);
    const saveUrl = video ? originalUrl(token, asset.id) : exportUrl(token, asset.id, 'web');
    const ext = video ? (asset.fileType.split('/')[1] || 'mp4') : 'jpg';
    const filename = `${(asset.title || asset.eventName || (video ? 'video' : 'photo')).replace(/[^a-z0-9-_]/gi, '-')}.${ext}`;

    setSaving(true);
    const ok = await saveToPhotos(saveUrl, filename, asset.fileType);
    setSaving(false);
    if (!ok) window.location.href = saveUrl;
    else setOpen(false);
  }

  return (
    <div className="save-share-menu" ref={rootRef}>
      <button type="button" className="save-share-trigger" onClick={() => setOpen((v) => !v)}>
        Save &amp; Share <span style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="save-share-panel">
          {shareCapable && (
            <>
              <button type="button" className="save-share-row" onClick={handleSaveToPhotos} disabled={saving}>
                {saving ? <><span className="spinner" /> Preparing…</> : <>📲 Save to Photos</>}
              </button>
              <MenuDivider />
            </>
          )}

          {isImage(asset) ? (
            <>
              {DOWNLOAD_PRESETS.map((p) => (
                <a key={p.key} className="save-share-row" href={exportUrl(token, asset.id, p.key)} onClick={() => setOpen(false)}>
                  Download — {p.label}
                </a>
              ))}
              <a className="save-share-row" href={originalUrl(token, asset.id)} onClick={() => setOpen(false)}>
                Download — Original (full size)
              </a>
            </>
          ) : (
            <a className="save-share-row" href={originalUrl(token, asset.id)} onClick={() => setOpen(false)}>
              Download original
            </a>
          )}

          <MenuDivider />

          <button type="button" className="save-share-row" onClick={() => copyCaption(setIgCopied)}>
            {igCopied ? '✓ Copied' : '📷 Copy caption for Instagram'}
          </button>
          <button type="button" className="save-share-row" onClick={() => copyCaption(setTtCopied)}>
            {ttCopied ? '✓ Copied' : '🎵 Copy caption for TikTok'}
          </button>
          <a className="save-share-row" href={emailShareHref(url, captionText)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
            ✉ Email
          </a>
        </div>
      )}
    </div>
  );
}
