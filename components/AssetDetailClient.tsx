'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import TagInput, { type TagSuggestion } from './TagInput';
import Combobox from './Combobox';
import AirTagButton from './AirTagButton';

type Season     = { id: string; name: string };
type Collection = { id: string; name: string; type: string; date: string | Date | null };

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
  signedUrl,
  seasons,
  collections,
  stadiums,
  tagSuggestions = [],
}: {
  asset: AssetProps;
  signedUrl: string;
  seasons: Season[];
  collections: Collection[];
  stadiums: string[];
  tagSuggestions?: TagSuggestion[];
}) {
  const router = useRouter();
  const [detectedTags, setDetectedTags] = useState<string[]>(() => {
    try { return JSON.parse(asset.detectedTagsJson ?? '[]') as string[]; } catch { return []; }
  });
  const [aiDescription, setAiDescription] = useState('');
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
      {/* Left column: preview + EXIF */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
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
          <ExifPanel exifJson={asset.exifJson} />
        </div>
      </div>

      {/* Right column: metadata form */}
      <div>
        <div className="card">
          <div className="card-header">Metadata</div>

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
            <label>Collection</label>
            <select value={form.collectionId} onChange={(e) => set('collectionId', e.target.value)}>
              <option value="">No collection</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>{collectionLabel(c)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Tags</label>
            <TagInput
              tags={form.tags}
              onChange={(tags) => { setForm((f) => ({ ...f, tags })); setSaved(false); }}
              suggestions={tagSuggestions}
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
          <div className="card-header" style={{ marginBottom: 12 }}>AI Analysis</div>

          {detectedTags.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              {aiDescription && (
                <p style={{ fontSize: 13, color: '#3a3f58', marginBottom: 10, lineHeight: 1.5 }}>{aiDescription}</p>
              )}
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

          <AirTagButton
            assetId={asset.id}
            onComplete={({ tags, description }) => {
              setDetectedTags(tags);
              setAiDescription(description);
            }}
          />
        </div>
      </div>
    </div>
  );
}
