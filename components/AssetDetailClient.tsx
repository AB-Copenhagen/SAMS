'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import TagInput from './TagInput';
import Combobox from './Combobox';
import IdentifyPlayersButton from './IdentifyPlayersButton';
import EntityMultiSelect, { type EntityOption } from './EntityMultiSelect';
import type { EditParamsState } from './PhotoEditor';
import AssetSharePanel from './AssetSharePanel';

// Pulls in react-easy-crop — code-split out of the initial bundle so every asset detail page
// view (the most-visited admin page) doesn't pay for it unless "Edit and Download" is clicked.
const PhotoEditor = dynamic(() => import('./PhotoEditor'), { ssr: false });

type Season     = { id: string; name: string };
type Collection = { id: string; name: string; type: string; date: string | Date | null; seasonId: string | null };
export type AssetNav = {
  /** Breadcrumb link text back to wherever this nav context came from — a collection name, or
   * "Media Library" for a filtered gallery view. */
  label: string;
  backHref: string;
  position: number;
  total: number;
  prevHref: string | null;
  nextHref: string | null;
};

const overlayButtonStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: '50%',
  background: 'rgba(13,15,28,0.65)',
  color: 'white',
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
  textDecoration: 'none',
  flexShrink: 0,
};

function collectionLabel(c: Collection): string {
  if (!c.date) return c.name;
  const d = new Date(typeof c.date === 'string' ? c.date.includes('T') ? c.date : c.date + 'T12:00:00' : c.date);
  const prefix = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${prefix} · ${c.name}`;
}

type AssetProps = {
  id: string;
  title: string;
  description: string;
  shareText: string;
  eventName: string;
  eventDate: string;
  location: string;
  category: string;
  seasonId: string;
  collectionId: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  objectKey: string;
  uploaderEmail: string;
  manualTagsJson: string;
  detectedTagsJson: string | null;
  exifJson: string | null;
  rating: number | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  editedKey: string | null;
  editParamsJson: string | null;
  isPublic: boolean;
  shareToken: string | null;
  expiresAt: string | null;
};

function formatBytes(b: number) {
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

function ExifPanel({ exifJson }: { exifJson: string | null }) {
  const [open, setOpen] = useState(false);

  let exif: Record<string, unknown> = {};
  if (exifJson) {
    try { exif = JSON.parse(exifJson); } catch { /* ignore */ }
  }

  const w = (exif.ImageWidth ?? exif.ExifImageWidth ?? exif.PixelXDimension) as number | undefined;
  const h = (exif.ImageHeight ?? exif.ExifImageHeight ?? exif.PixelYDimension) as number | undefined;

  let dateTaken = '';
  if (exif.DateTimeOriginal) {
    try { dateTaken = new Date(exif.DateTimeOriginal as string).toLocaleString('en-GB'); } catch { /* ignore */ }
  }

  const fields = [
    ['Date taken',    dateTaken],
    ['Camera',        [exif.Make, exif.Model].filter(Boolean).join(' ')],
    ['Dimensions',    w && h ? `${w} × ${h}` : ''],
    ['Focal length',  exif.FocalLength ? `${exif.FocalLength}mm` : ''],
    ['Aperture',      exif.FNumber ? `f/${exif.FNumber}` : ''],
    ['ISO',           exif.ISO ? String(exif.ISO) : ''],
    ['Shutter speed', exif.ExposureTime ? `1/${Math.round(1 / (exif.ExposureTime as number))}s` : ''],
    ['Lens',          exif.LensModel ? String(exif.LensModel) : ''],
    ['GPS',           exif.latitude && exif.longitude
      ? `${(exif.latitude as number).toFixed(6)}, ${(exif.longitude as number).toFixed(6)}` : ''],
    ['Orientation',   exif.Orientation ? String(exif.Orientation) : ''],
    ['Software',      exif.Software ? String(exif.Software) : ''],
  ].filter(([, v]) => v);

  const hasData = fields.length > 0;

  return (
    <div style={{ borderTop: '1px solid #f0f2f7' }}>
      <button
        type="button"
        className="btn-ghost"
        style={{ width: '100%', justifyContent: 'space-between', color: '#3a3f58', padding: '12px 16px' }}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          EXIF / Camera data
          {!hasData && <span style={{ fontWeight: 400, color: '#8890b4', marginLeft: 8 }}>— not available</span>}
        </span>
        <span style={{ fontSize: 18, lineHeight: 1, color: '#8890b4' }}>{open ? '−' : '+'}</span>
      </button>
      {open && hasData && (
        <div style={{ padding: '0 16px 14px' }}>
          {fields.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid #f7f8fc', fontSize: 13 }}>
              <span style={{ color: '#8890b4', width: 110, flexShrink: 0 }}>{label}</span>
              <span style={{ color: '#2d3154' }}>{value}</span>
            </div>
          ))}
        </div>
      )}
      {open && !hasData && (
        <div style={{ padding: '0 16px 14px', fontSize: 13, color: '#8890b4' }}>
          No camera metadata found in this file.
        </div>
      )}
    </div>
  );
}

export default function AssetDetailClient({
  asset,
  nav,
  appBaseUrl,
  signedUrl,
  seasons,
  collections,
  stadiums,
  playerOptions = [],
  sponsorOptions = [],
  initialPlayerIds = [],
  initialSponsorIds = [],
  initialCustomCollectionIds = [],
}: {
  asset: AssetProps;
  nav?: AssetNav | null;
  appBaseUrl: string;
  signedUrl: string;
  seasons: Season[];
  collections: Collection[];
  stadiums: string[];
  playerOptions?: EntityOption[];
  sponsorOptions?: EntityOption[];
  initialPlayerIds?: string[];
  initialSponsorIds?: string[];
  initialCustomCollectionIds?: string[];
}) {
  const router = useRouter();

  // ← → step through the collection this asset was opened from; guarded against text inputs,
  // selects, and comboboxes so typing/browsing a dropdown isn't hijacked (mirrors the review
  // gallery's keyboard nav in ReviewWorkflowClient).
  useEffect(() => {
    if (!nav) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === 'ArrowRight' && nav!.nextHref) { e.preventDefault(); router.push(nav!.nextHref); }
      if (e.key === 'ArrowLeft' && nav!.prevHref) { e.preventDefault(); router.push(nav!.prevHref); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nav, router]);
  const [detectedTags, setDetectedTags] = useState<string[]>(() => {
    try { return JSON.parse(asset.detectedTagsJson ?? '[]') as string[]; } catch { return []; }
  });
  const [playerIds, setPlayerIds] = useState<string[]>(initialPlayerIds);
  const [sponsorIds, setSponsorIds] = useState<string[]>(initialSponsorIds);
  const [customCollectionIds, setCustomCollectionIds] = useState<string[]>(initialCustomCollectionIds);
  const [customCollectionsError, setCustomCollectionsError] = useState('');
  const [form, setForm] = useState({
    title:       asset.title,
    description: asset.description,
    shareText:   asset.shareText,
    eventName:   asset.eventName,
    eventDate:   asset.eventDate,
    location:    asset.location,
    seasonId:    asset.seasonId,
    collectionId: asset.collectionId,
    tags:        (() => { try { return JSON.parse(asset.manualTagsJson) as string[]; } catch { return [] as string[]; } })(),
    rating:      asset.rating,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function deleteAsset() {
    if (!confirm('Delete this asset? This cannot be undone.')) return;
    setDeleting(true);
    const res = await fetch(`/api/assets/${asset.id}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/media');
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.message ?? 'Delete failed');
      setDeleting(false);
    }
  }

  async function save() {
    setSaving(true);
    setError('');
    const res = await fetch(`/api/assets/${asset.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title:       form.title,
        description: form.description,
        shareText:   form.shareText,
        eventName:   form.eventName,
        eventDate:   form.eventDate || null,
        location:    form.location,
        seasonId:    form.seasonId || null,
        collectionId: form.collectionId || null,
        manualTagsJson: JSON.stringify(form.tags),
        rating:      form.rating,
        playerIds,
        sponsorIds,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.message ?? 'Save failed');
    }
  }

  // Independent from the "Collection" (match) field above and from the main Save button — this
  // adds/removes CollectionAsset membership immediately per change, same as the Media Library's
  // bulk "Add to collection" action, since a custom gallery is a separate, purely additive
  // grouping on top of whichever match this asset is assigned to (never touches collectionId).
  async function updateCustomCollections(newIds: string[]) {
    const added = newIds.filter((id) => !customCollectionIds.includes(id));
    const removed = customCollectionIds.filter((id) => !newIds.includes(id));
    setCustomCollectionIds(newIds);
    setCustomCollectionsError('');
    try {
      const results = await Promise.all([
        ...added.map((id) => fetch(`/api/collections/${id}/assets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetId: asset.id }),
        })),
        ...removed.map((id) => fetch(`/api/collections/${id}/assets/${asset.id}`, { method: 'DELETE' })),
      ]);
      if (results.some((r) => !r.ok)) throw new Error();
    } catch {
      setCustomCollectionsError('Failed to update custom collections — please try again.');
      setCustomCollectionIds(customCollectionIds);
    }
  }

  const isVideo = asset.fileType.startsWith('video/');
  const customCollectionOptions: EntityOption[] = collections
    .filter((c) => c.type === 'custom')
    .map((c) => ({ id: c.id, label: collectionLabel(c) }));

  return (
    <div className="asset-detail-layout">
      {/* Left column: preview + EXIF */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="asset-detail-media" style={{ position: 'relative' }}>
            {isVideo ? (
              <video src={signedUrl} controls />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signedUrl} alt={asset.title || asset.objectKey} />
            )}
            {nav && (
              <>
                <Link
                  href={nav.prevHref ?? '#'}
                  aria-label="Previous asset in collection"
                  onClick={(e) => { if (!nav.prevHref) e.preventDefault(); }}
                  style={{
                    ...overlayButtonStyle, position: 'absolute', top: '50%', left: 10, transform: 'translateY(-50%)',
                    opacity: nav.prevHref ? 1 : 0.35, cursor: nav.prevHref ? 'pointer' : 'default', pointerEvents: nav.prevHref ? 'auto' : 'none',
                  }}
                >
                  ‹
                </Link>
                <Link
                  href={nav.nextHref ?? '#'}
                  aria-label="Next asset in collection"
                  onClick={(e) => { if (!nav.nextHref) e.preventDefault(); }}
                  style={{
                    ...overlayButtonStyle, position: 'absolute', top: '50%', right: 10, transform: 'translateY(-50%)',
                    opacity: nav.nextHref ? 1 : 0.35, cursor: nav.nextHref ? 'pointer' : 'default', pointerEvents: nav.nextHref ? 'auto' : 'none',
                  }}
                >
                  ›
                </Link>
                <span
                  style={{
                    position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(13,15,28,0.65)', color: 'white', fontSize: 12, fontWeight: 600,
                    padding: '3px 10px', borderRadius: 12,
                  }}
                >
                  {nav.position} / {nav.total}
                </span>
              </>
            )}
            <div
              style={{
                position: 'absolute', top: 10, right: 10, display: 'flex', gap: 2,
                background: 'rgba(13,15,28,0.65)', borderRadius: 22, padding: '2px 4px',
              }}
            >
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
                  aria-pressed={form.rating === n}
                  onClick={() => { setForm((f) => ({ ...f, rating: f.rating === n ? null : n })); setSaved(false); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    minWidth: 40, minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, color: form.rating != null && n <= form.rating ? 'var(--color-accent)' : 'rgba(255,255,255,0.45)',
                  }}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f2f7', display: 'flex', gap: 16, fontSize: 12, color: '#8890b4', alignItems: 'center' }}>
            <span>{asset.fileType.split('/')[1]?.toUpperCase()}</span>
            <span>{formatBytes(asset.fileSize)}</span>
            <span>Uploaded by {asset.uploaderEmail}</span>
            <span>{new Date(asset.uploadedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            {asset.editedKey && <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Edited</span>}
            {!isVideo && (
              <button className="btn-secondary" type="button" onClick={() => setEditing(true)} style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 10px' }}>
                Edit and Download
              </button>
            )}
          </div>

          {/* Secondary/descriptive metadata — collapsed by default so the sidebar's tags,
              collection, and save/delete action stay the priority on open, matching the
              collapsed-by-default EXIF panel just below it. */}
          <div style={{ borderTop: '1px solid #f0f2f7' }}>
            <button
              type="button"
              className="btn-ghost"
              style={{ width: '100%', justifyContent: 'space-between', color: '#3a3f58', padding: '12px 16px' }}
              onClick={() => setDetailsOpen((o) => !o)}
            >
              <span style={{ fontWeight: 600, fontSize: 13 }}>Details</span>
              <span style={{ fontSize: 18, lineHeight: 1, color: '#8890b4' }}>{detailsOpen ? '−' : '+'}</span>
            </button>
            {detailsOpen && (
              <div style={{ padding: '0 16px 16px' }}>
                <div className="field">
                  <label>Title</label>
                  <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Untitled" />
                </div>
                <div className="field">
                  <label>Event / match</label>
                  <Combobox
                    value={form.eventName}
                    onChange={(v) => set('eventName', v)}
                    options={collections.map((c) => c.name)}
                    placeholder="AB vs FC Nordsjælland"
                  />
                </div>
                <div className="field">
                  <label>Date</label>
                  <input type="date" value={form.eventDate} onChange={(e) => set('eventDate', e.target.value)} />
                </div>
                <div className="field">
                  <label>Stadium</label>
                  <Combobox
                    value={form.location}
                    onChange={(v) => set('location', v)}
                    options={stadiums}
                    placeholder="Gladsaxe Stadion"
                  />
                </div>
                <div className="field">
                  <label>Season</label>
                  <select value={form.seasonId} onChange={(e) => set('seasonId', e.target.value)}>
                    <option value="">No season</option>
                    {seasons.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    placeholder="Optional description"
                    style={{ resize: 'vertical', minHeight: 60 }}
                  />
                </div>
                <div className="field" style={{ marginBottom: asset.reviewedAt ? 12 : 0 }}>
                  <label>Sample sharing text</label>
                  <textarea
                    value={form.shareText}
                    onChange={(e) => set('shareText', e.target.value)}
                    placeholder="Suggested caption for fans sharing this photo, e.g. &quot;Great save from Nikolaj! 🧤&quot;"
                    style={{ resize: 'vertical', minHeight: 60 }}
                  />
                  <p style={{ fontSize: 12, color: '#8890b4', marginTop: 4 }}>
                    Shown to visitors as a starting point when they share this photo — AB&apos;s Facebook and Instagram links are added automatically.
                  </p>
                </div>
                {asset.reviewedAt && (
                  <p style={{ fontSize: 12, color: '#8890b4' }}>
                    Reviewed by {asset.reviewedBy} on {new Date(asset.reviewedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
            )}
          </div>

          <ExifPanel exifJson={asset.exifJson} />
        </div>
      </div>

      {editing && (
        <PhotoEditor
          assetId={asset.id}
          hasEdit={!!asset.editedKey}
          initialParams={(() => {
            if (!asset.editParamsJson) return null;
            try {
              const parsed = JSON.parse(asset.editParamsJson);
              return { brightness: parsed.brightness ?? 0, contrast: parsed.contrast ?? 0, saturation: parsed.saturation ?? 0, filter: parsed.filter ?? null, autoCorrect: !!parsed.autoCorrect } as EditParamsState;
            } catch {
              return null;
            }
          })()}
          onClose={() => setEditing(false)}
        />
      )}

      {/* Right column: metadata form */}
      <div className="asset-detail-sidebar">
        <div className="card">
          <div className="card-header">Tags &amp; collection</div>

          <div className="field">
            <label>Tagged players</label>
            <EntityMultiSelect
              options={playerOptions}
              selected={playerIds}
              onChange={(ids) => { setPlayerIds(ids); setSaved(false); }}
              placeholder="Add player…"
            />
          </div>
          <div className="field">
            <label>Tagged sponsors</label>
            <EntityMultiSelect
              options={sponsorOptions}
              selected={sponsorIds}
              onChange={(ids) => { setSponsorIds(ids); setSaved(false); }}
              placeholder="Add sponsor…"
            />
          </div>
          <div className="field">
            <label>Tags</label>
            <TagInput
              tags={form.tags}
              onChange={(tags) => { setForm((f) => ({ ...f, tags })); setSaved(false); }}
            />
          </div>
          <div className="field">
            <label>Collection</label>
            <select
              value={form.collectionId}
              onChange={(e) => {
                const newCollectionId = e.target.value;
                const collection = collections.find((c) => c.id === newCollectionId);
                setForm((f) => ({
                  ...f,
                  collectionId: newCollectionId,
                  // Inherit the match's own event name/date/season onto this asset, but only to
                  // fill gaps — never clobber a value already sitting in the form.
                  eventName: f.eventName || (collection ? collection.name : f.eventName),
                  eventDate: f.eventDate || (collection?.date ? new Date(collection.date).toISOString().split('T')[0] : f.eventDate),
                  seasonId: f.seasonId || (collection?.seasonId ?? f.seasonId),
                }));
                setSaved(false);
              }}
            >
              <option value="">No collection</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>{collectionLabel(c)}</option>
              ))}
            </select>
          </div>
          {customCollectionOptions.length > 0 && (
            <div className="field">
              <label>Custom collections</label>
              <EntityMultiSelect
                options={customCollectionOptions}
                selected={customCollectionIds}
                onChange={updateCustomCollections}
                placeholder="Add to a custom collection…"
              />
              <p style={{ fontSize: 12, color: '#8890b4', marginTop: 4 }}>
                Adds this asset to one or more custom/shared galleries in addition to its match above — applied immediately, independent of Save changes.
              </p>
              {customCollectionsError && <div className="alert alert-error" style={{ marginTop: 6 }}>{customCollectionsError}</div>}
            </div>
          )}

          {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
          {saved && <div className="alert alert-success" style={{ marginBottom: 12 }}>Saved.</div>}

          <button className="btn-primary" type="button" onClick={save} disabled={saving || deleting} style={{ width: '100%', justifyContent: 'center' }}>
            {saving ? <><span className="spinner" /> Saving…</> : 'Save changes'}
          </button>
          <button className="btn-danger" type="button" onClick={deleteAsset} disabled={saving || deleting} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
            {deleting ? <><span className="spinner" /> Deleting…</> : 'Delete asset'}
          </button>
        </div>

        <AssetSharePanel id={asset.id} isPublic={asset.isPublic} shareToken={asset.shareToken} appBaseUrl={appBaseUrl} expiresAt={asset.expiresAt} />

        <div className="card">
          <div className="card-header" style={{ marginBottom: 12 }}>Detected tags</div>

          {detectedTags.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {detectedTags.map((tag) => (
                  <span key={tag} style={{
                    background: '#eef0fb', color: '#3d4894', fontSize: 11.5,
                    padding: '3px 9px', borderRadius: 20, fontWeight: 500,
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          )}

          {!isVideo && (
            <IdentifyPlayersButton
              assetId={asset.id}
              onComplete={({ players, sponsors, playerIds: newPlayerIds, sponsorIds: newSponsorIds }) => {
                setDetectedTags((tags) => {
                  const next = [...tags];
                  for (const name of players) {
                    const slug = `player:${name.toLowerCase().replace(/\s+/g, '-')}`;
                    if (!next.includes(slug)) next.push(slug);
                  }
                  for (const name of sponsors) {
                    const slug = `sponsor:${name.toLowerCase().replace(/\s+/g, '-')}`;
                    if (!next.includes(slug)) next.push(slug);
                  }
                  return next;
                });
                setPlayerIds((ids) => Array.from(new Set([...ids, ...newPlayerIds])));
                setSponsorIds((ids) => Array.from(new Set([...ids, ...newSponsorIds])));
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
