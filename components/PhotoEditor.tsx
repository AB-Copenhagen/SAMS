'use client';

import { useState, useCallback, useMemo, type ComponentType, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import ReactEasyCrop, { type Area } from 'react-easy-crop';

interface MediaSize {
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
}

// react-easy-crop's own .d.ts only forwards types under this project's `moduleResolution: "node"`
// (its "exports" map's conditional types aren't consulted), so the default export resolves to a
// non-JSX-able module namespace at the type level. Cast to the actual prop shape we use instead.
interface CropperComponentProps {
  image: string;
  crop: { x: number; y: number };
  zoom: number;
  aspect: number;
  onCropChange: (location: { x: number; y: number }) => void;
  onZoomChange: (zoom: number) => void;
  onCropComplete: (croppedArea: Area, croppedAreaPixels: Area) => void;
  onMediaLoaded: (mediaSize: MediaSize) => void;
  mediaProps?: { style?: CSSProperties };
}
const Cropper = ReactEasyCrop as unknown as ComponentType<CropperComponentProps>;

export type PhotoFilter = 'grayscale' | 'sepia' | 'vivid' | null;

export interface EditParamsState {
  brightness: number;
  contrast: number;
  saturation: number;
  filter: PhotoFilter;
  autoCorrect: boolean;
}

const DEFAULT_PARAMS: EditParamsState = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  filter: null,
  autoCorrect: false,
};

const ASPECT_OPTIONS: Array<{ label: string; value: number | null }> = [
  { label: 'Original', value: null },
  { label: 'Square', value: 1 },
  { label: 'Portrait', value: 4 / 5 },
  { label: 'Landscape', value: 16 / 9 },
];

const EXPORT_PRESETS: Array<{ key: string; label: string }> = [
  { key: 'web', label: 'Web-optimized' },
  { key: 'instagram-square', label: 'Instagram (square)' },
  { key: 'instagram-story', label: 'Instagram (story)' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'linkedin', label: 'LinkedIn' },
];

function toMultiplier(value: number): number {
  return 1 + value / 100;
}

function previewFilter(params: EditParamsState): string {
  const parts = [
    `brightness(${toMultiplier(params.brightness)})`,
    `saturate(${toMultiplier(params.saturation) * (params.filter === 'vivid' ? 1.3 : 1)})`,
    `contrast(${toMultiplier(params.contrast)})`,
  ];
  if (params.filter === 'grayscale') parts.push('grayscale(1)');
  if (params.filter === 'sepia') parts.push('sepia(1)');
  return parts.join(' ');
}

export default function PhotoEditor({
  assetId,
  hasEdit,
  initialParams,
  onClose,
}: {
  assetId: string;
  hasEdit: boolean;
  initialParams: EditParamsState | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [params, setParams] = useState<EditParamsState>(initialParams ?? DEFAULT_PARAMS);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<number | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [error, setError] = useState('');

  const effectiveAspect = aspect ?? (naturalSize ? naturalSize.width / naturalSize.height : 1);
  const cssFilter = useMemo(() => previewFilter(params), [params]);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  function set<K extends keyof EditParamsState>(key: K, value: EditParamsState[K]) {
    setParams((p) => ({ ...p, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/assets/${assetId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crop: croppedAreaPixels
            ? { x: croppedAreaPixels.x, y: croppedAreaPixels.y, width: croppedAreaPixels.width, height: croppedAreaPixels.height }
            : null,
          ...params,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? 'Save failed');
      }
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function revert() {
    if (!confirm('Revert to the original photo? This discards the current edited version.')) return;
    setReverting(true);
    setError('');
    try {
      const res = await fetch(`/api/assets/${assetId}/edit`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Revert failed');
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revert failed');
    } finally {
      setReverting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 960 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Edit photo</h3>
          <button className="modal-close" type="button" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
            <div style={{ position: 'relative', height: 480, background: '#0d0f1c', borderRadius: 8, overflow: 'hidden' }}>
              <Cropper
                image={`/api/assets/${assetId}/original`}
                crop={crop}
                zoom={zoom}
                aspect={effectiveAspect}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                onMediaLoaded={(size) => setNaturalSize({ width: size.naturalWidth, height: size.naturalHeight })}
                mediaProps={{ style: { filter: cssFilter } }}
              />
            </div>

            <div>
              <div className="field">
                <label>Aspect ratio</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ASPECT_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      className={aspect === opt.value ? 'btn-primary' : 'btn-secondary'}
                      style={{ fontSize: 12, padding: '4px 8px' }}
                      onClick={() => setAspect(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label>Brightness ({params.brightness})</label>
                <input type="range" min={-100} max={100} value={params.brightness} onChange={(e) => set('brightness', Number(e.target.value))} style={{ width: '100%' }} />
              </div>
              <div className="field">
                <label>Contrast ({params.contrast})</label>
                <input type="range" min={-100} max={100} value={params.contrast} onChange={(e) => set('contrast', Number(e.target.value))} style={{ width: '100%' }} />
              </div>
              <div className="field">
                <label>Saturation ({params.saturation})</label>
                <input type="range" min={-100} max={100} value={params.saturation} onChange={(e) => set('saturation', Number(e.target.value))} style={{ width: '100%' }} />
              </div>

              <div className="field">
                <label>Filter</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {([['None', null], ['Grayscale', 'grayscale'], ['Sepia', 'sepia'], ['Vivid', 'vivid']] as const).map(([label, value]) => (
                    <button
                      key={label}
                      type="button"
                      className={params.filter === value ? 'btn-primary' : 'btn-secondary'}
                      style={{ fontSize: 12, padding: '4px 8px' }}
                      onClick={() => set('filter', value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <button
                  type="button"
                  className={params.autoCorrect ? 'btn-primary' : 'btn-secondary'}
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => set('autoCorrect', !params.autoCorrect)}
                >
                  Auto Color Correct {params.autoCorrect ? '✓' : ''}
                </button>
              </div>

              {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

              <button className="btn-primary" type="button" onClick={save} disabled={saving || reverting} style={{ width: '100%', justifyContent: 'center' }}>
                {saving ? <><span className="spinner" /> Saving…</> : 'Save'}
              </button>
              {hasEdit && (
                <button className="btn-danger" type="button" onClick={revert} disabled={saving || reverting} style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
                  {reverting ? <><span className="spinner" /> Reverting…</> : 'Revert to original'}
                </button>
              )}

              <div style={{ borderTop: '1px solid #f0f2f7', marginTop: 16, paddingTop: 12 }}>
                <label style={{ fontSize: 12, color: '#8890b4', fontWeight: 600, display: 'block', marginBottom: 6 }}>Export</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {EXPORT_PRESETS.map((p) => (
                    <a
                      key={p.key}
                      href={`/api/assets/${assetId}/export?preset=${p.key}`}
                      download
                      className="btn-secondary"
                      style={{ justifyContent: 'center', textDecoration: 'none', fontSize: 12 }}
                    >
                      {p.label}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
