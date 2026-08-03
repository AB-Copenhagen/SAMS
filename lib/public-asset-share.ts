import type { PublicAsset } from './collections';

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

/**
 * Cached, redirect-based 1920px preview for inline display (the lightbox) — distinct from
 * exportUrl, which always live-renders and forces a download for the explicit "Download as…"
 * links. Never use this for anything the visitor is meant to save to disk.
 */
export function previewUrl(token: string, assetId: string) {
  return `/api/share/${token}/assets/${assetId}/preview`;
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
