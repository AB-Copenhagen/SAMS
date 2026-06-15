'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import TagInput from './TagInput';

type Season     = { id: string; name: string };
type Collection = { id: string; name: string; type: string };

type ItemStatus = 'queued' | 'uploading' | 'done' | 'error';

type QueueItem = {
  id: string;
  file: File;
  preview: string | null;
  status: ItemStatus;
  errorMsg?: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function isMedia(file: File): boolean {
  return file.type.startsWith('image/') || file.type.startsWith('video/');
}

async function traverseEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject)
    );
    return isMedia(file) ? [file] : [];
  }

  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const allEntries: FileSystemEntry[] = [];

    await new Promise<void>((resolve, reject) => {
      const readBatch = () =>
        reader.readEntries((batch) => {
          if (batch.length === 0) resolve();
          else { allEntries.push(...batch); readBatch(); }
        }, reject);
      readBatch();
    });

    const nested = await Promise.all(allEntries.map(traverseEntry));
    return nested.flat();
  }

  return [];
}

function makePreview(file: File): string | null {
  return file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
}

function Thumb({ item }: { item: QueueItem }) {
  if (item.preview) {
    return (
      <div className="queue-item-thumb">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.preview} alt="" />
      </div>
    );
  }
  return (
    <div className="queue-item-thumb" style={{ fontSize: 18 }}>
      🎬
    </div>
  );
}

function StatusLabel({ item }: { item: QueueItem }) {
  if (item.status === 'uploading') return <><span className="spinner" /> Uploading</>;
  if (item.status === 'done')      return <>✓ Done</>;
  if (item.status === 'error')     return <>✗ {item.errorMsg ?? 'Error'}</>;
  return <>Queued</>;
}

export default function BulkUploadZone() {
  const [eventName,    setEventName]    = useState('');
  const [eventDate,    setEventDate]    = useState('');
  const [location,     setLocation]     = useState('');
  const [tags,         setTags]         = useState<string[]>([]);
  const [collectionId, setCollectionId] = useState('');
  const [seasonId,     setSeasonId]     = useState('');

  const [seasons,     setSeasons]     = useState<Season[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);

  const [queue,       setQueue]       = useState<QueueItem[]>([]);
  const [isDragging,  setIsDragging]  = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const dragDepth      = useRef(0);

  // webkitdirectory is not a standard React prop — set it imperatively
  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '');
    }
  }, []);

  // Fetch collections and seasons for dropdowns
  useEffect(() => {
    fetch('/api/seasons').then(r => r.ok ? r.json() : []).then(setSeasons).catch(() => {});
    fetch('/api/collections').then(r => r.ok ? r.json() : []).then(setCollections).catch(() => {});
  }, []);

  // Revoke object URLs on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      queue.forEach((i) => { if (i.preview) URL.revokeObjectURL(i.preview); });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(files: File[]) {
    const items: QueueItem[] = files
      .filter(isMedia)
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: makePreview(file),
        status: 'queued',
      }));
    setQueue((q) => [...q, ...items]);
  }

  function remove(id: string) {
    setQueue((q) => {
      const item = q.find((i) => i.id === id);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return q.filter((i) => i.id !== id);
    });
  }

  function clearAll() {
    queue.forEach((i) => { if (i.preview) URL.revokeObjectURL(i.preview); });
    setQueue([]);
  }

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current++;
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current--;
    if (dragDepth.current === 0) setIsDragging(false);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); }, []);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);

    const entries = Array.from(e.dataTransfer.items)
      .map((item) => item.webkitGetAsEntry())
      .filter((entry): entry is FileSystemEntry => entry !== null);

    const files = (await Promise.all(entries.map(traverseEntry))).flat();
    addFiles(files);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadAll() {
    const pending = queue.filter((i) => i.status === 'queued');
    if (!pending.length || isUploading) return;

    setIsUploading(true);

    for (const item of pending) {
      setQueue((q) => q.map((i) => i.id === item.id ? { ...i, status: 'uploading' } : i));

      const fd = new FormData();
      fd.append('file',         item.file);
      fd.append('title',        item.file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
      fd.append('eventName',    eventName);
      fd.append('eventDate',    eventDate);
      fd.append('location',     location);
      fd.append('manualTags',   JSON.stringify(tags));
      fd.append('collectionId', collectionId);
      fd.append('seasonId',     seasonId);

      try {
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        if (res.ok) {
          setQueue((q) => q.map((i) => i.id === item.id ? { ...i, status: 'done' } : i));
        } else {
          const body = await res.json().catch(() => ({}));
          setQueue((q) => q.map((i) => i.id === item.id
            ? { ...i, status: 'error', errorMsg: body.message ?? 'Upload failed' }
            : i));
        }
      } catch {
        setQueue((q) => q.map((i) => i.id === item.id
          ? { ...i, status: 'error', errorMsg: 'Network error' }
          : i));
      }
    }

    setIsUploading(false);
  }

  const queuedCount = queue.filter((i) => i.status === 'queued').length;
  const doneCount   = queue.filter((i) => i.status === 'done').length;
  const errorCount  = queue.filter((i) => i.status === 'error').length;

  return (
    <>
      {/* Batch metadata */}
      <div className="card">
        <div className="card-header">Batch metadata — applied to all files in this upload</div>
        <div className="meta-row">
          <div className="field">
            <label>Event name</label>
            <input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Home vs. FC Rosenberg" />
          </div>
          <div className="field">
            <label>Event date</label>
            <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Location</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Gladsaxe Stadion" />
          </div>
          <div className="field">
            <label>Season</label>
            <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
              <option value="">No season</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Collection</label>
            <select value={collectionId} onChange={(e) => setCollectionId(e.target.value)}>
              <option value="">No collection</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Tags</label>
            <TagInput tags={tags} onChange={setTags} />
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        className={`drop-zone${isDragging ? ' dragging' : ''}`}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="drop-zone-icon">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M24 30V14M24 14L17 21M24 14L31 21"/>
            <path d="M8 34c0 3.3 2.7 6 6 6h20c3.3 0 6-2.7 6-6"/>
            <path d="M36 22c-1-6.5-6.5-11.5-13.5-11.5S10 16.5 9 22C5.5 23 3 26.2 3 30c0 4.4 3.6 8 8 8H11"/>
          </svg>
        </div>
        <h3>Drop photos &amp; videos here</h3>
        <p>Drag individual files or entire folders — images and videos only</p>
        <div className="drop-zone-actions" onClick={(e) => e.stopPropagation()}>
          <button className="btn-secondary" type="button" onClick={() => fileInputRef.current?.click()}>
            Browse files
          </button>
          <button className="btn-secondary" type="button" onClick={() => folderInputRef.current?.click()}>
            Browse folder
          </button>
        </div>
      </div>

      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = ''; }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = ''; }}
      />

      {/* Queue */}
      {queue.length > 0 && (
        <div className="card">
          <div className="queue-header">
            <div className="queue-title">
              {queue.length} file{queue.length !== 1 ? 's' : ''}
              {doneCount > 0  && <span style={{ color: '#16a34a' }}> · {doneCount} done</span>}
              {errorCount > 0 && <span style={{ color: '#dc2626' }}> · {errorCount} failed</span>}
            </div>
            <div className="queue-actions">
              <button className="btn-danger" type="button" onClick={clearAll} disabled={isUploading}>
                Clear all
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={uploadAll}
                disabled={isUploading || queuedCount === 0}
              >
                {isUploading
                  ? <><span className="spinner" /> Uploading…</>
                  : `Upload ${queuedCount} file${queuedCount !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>

          <div className="queue-list">
            {queue.map((item) => (
              <div key={item.id} className="queue-item">
                <Thumb item={item} />
                <div className="queue-item-info">
                  <div className="queue-item-name">{item.file.name}</div>
                  <div className="queue-item-meta">{formatBytes(item.file.size)}</div>
                </div>
                <div className={`queue-item-status status-${item.status}`}>
                  <StatusLabel item={item} />
                </div>
                {item.status !== 'uploading' && (
                  <button
                    className="queue-item-remove"
                    type="button"
                    onClick={() => remove(item.id)}
                    title="Remove"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
