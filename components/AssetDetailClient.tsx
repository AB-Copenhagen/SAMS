'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import TagInput from './TagInput';

type Season     = { id: string; name: string };
type Collection = { id: string; name: string; type: string };

type AssetProps = {
  id: string;
  title: string;
  description: string;
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
  exifJson: string | null;
};

function formatBytes(b: number) {
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

function ExifPanel({ exifJson }: { exifJson: string | null }) {
  const [open, setOpen] = useState(false);
  if (!exifJson) return (
    <div style={{ color: '#8890b4', fontSize: 13, padding: '12px 0' }}>No EXIF data available for this file.</div>
  );

  let exif: Record<string, unknown> = {};
  try { exif = JSON.parse(exifJson); } catch { return null; }

  const fields = [
    ['Date taken',     exif.DateTimeOriginal ? new Date(exif.DateTimeOriginal as string).toLocaleString('en-GB') : ''],
    ['Camera',         [exif.Make, exif.Model].filter(Boolean).join(' ')],
    ['Dimensions',     exif.ImageWidth && exif.ImageHeight ? `${exif.ImageWidth} × ${exif.ImageHeight}` : ''],
    ['Focal length',   exif.FocalLength ? `${exif.FocalLength}mm` : ''],
    ['Aperture',       exif.FNumber ? `f/${exif.FNumber}` : ''],
    ['ISO',            exif.ISO ? String(exif.ISO) : ''],
    ['Shutter speed',  exif.ExposureTime ? `1/${Math.round(1 / (exif.ExposureTime as number))}s` : ''],
    ['GPS',            exif.latitude && exif.longitude ? `${(exif.latitude as number).toFixed(6)}, ${(exif.longitude as number).toFixed(6)}` : ''],
    ['Orientation',    exif.Orientation ? String(exif.Orientation) : ''],
    ['Lens',           exif.LensModel ? String(exif.LensModel) : ''],
    ['Software',       exif.Software ? String(exif.Software) : ''],
  ].filter(([, v]) => v);

  return (
    <div>
      <button
        type="button"
        className="btn-ghost"
        style={{ width: '100%', justifyContent: 'space-between', color: '#3a3f58', padding: '10px 0', borderBottom: '1px solid #f0f2f7' }}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ fontWeight: 600, fontSize: 13 }}>EXIF / Camera data</span>
        <span style={{ fontSize: 18, lineHeight: 1 }}>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          {fields.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid #f7f8fc', fontSize: 13 }}>
              <span style={{ color: '#8890b4', width: 110, flexShrink: 0 }}>{label}</span>
              <span style={{ color: '#2d3154' }}>{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AssetDetailClient({
  asset,
  signedUrl,
  seasons,
  collections,
}: {
  asset: AssetProps;
  signedUrl: string;
  seasons: Season[];
  collections: Collection[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    title:       asset.title,
    description: asset.description,
    eventName:   asset.eventName,
    eventDate:   asset.eventDate,
    location:    asset.location,
    seasonId:    asset.seasonId,
    collectionId: asset.collectionId,
    tags:        (() => { try { return JSON.parse(asset.manualTagsJson) as string[]; } catch { return [] as string[]; } })(),
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

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
        eventName:   form.eventName,
        eventDate:   form.eventDate || null,
        location:    form.location,
        seasonId:    form.seasonId || null,
        collectionId: form.collectionId || null,
        manualTagsJson: JSON.stringify(form.tags),
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

  const isVideo = asset.fileType.startsWith('video/');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, alignItems: 'start' }}>
      {/* Preview */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {isVideo ? (
          <video
            src={signedUrl}
            controls
            style={{ width: '100%', display: 'block', background: '#0d0f1c', maxHeight: 520 }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={signedUrl}
            alt={asset.title || asset.objectKey}
            style={{ width: '100%', display: 'block', maxHeight: 580, objectFit: 'contain', background: '#0d0f1c' }}
          />
        )}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #f0f2f7', display: 'flex', gap: 16, fontSize: 12, color: '#8890b4' }}>
          <span>{asset.fileType.split('/')[1]?.toUpperCase()}</span>
          <span>{formatBytes(asset.fileSize)}</span>
          <span>Uploaded by {asset.uploaderEmail}</span>
          <span>{new Date(asset.uploadedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
      </div>

      {/* Metadata form */}
      <div>
        <div className="card">
          <div className="card-header">Metadata</div>

          <div className="field">
            <label>Title</label>
            <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Untitled" />
          </div>
          <div className="field">
            <label>Event / match</label>
            <input value={form.eventName} onChange={(e) => set('eventName', e.target.value)} placeholder="AB vs FC Nordsjælland" />
          </div>
          <div className="field">
            <label>Date</label>
            <input type="date" value={form.eventDate} onChange={(e) => set('eventDate', e.target.value)} />
          </div>
          <div className="field">
            <label>Location</label>
            <input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Gladsaxe Stadion" />
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
            <label>Collection</label>
            <select value={form.collectionId} onChange={(e) => set('collectionId', e.target.value)}>
              <option value="">No collection</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Tags</label>
            <TagInput
              tags={form.tags}
              onChange={(tags) => { setForm((f) => ({ ...f, tags })); setSaved(false); }}
            />
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

          {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
          {saved && <div className="alert alert-success" style={{ marginBottom: 12 }}>Saved.</div>}

          <button className="btn-primary" type="button" onClick={save} disabled={saving || deleting} style={{ width: '100%', justifyContent: 'center' }}>
            {saving ? <><span className="spinner" /> Saving…</> : 'Save changes'}
          </button>
          <button className="btn-danger" type="button" onClick={deleteAsset} disabled={saving || deleting} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
            {deleting ? <><span className="spinner" /> Deleting…</> : 'Delete asset'}
          </button>
        </div>

        <div className="card">
          <ExifPanel exifJson={asset.exifJson} />
        </div>
      </div>
    </div>
  );
}
