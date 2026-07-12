'use client';

// Browser-safe helpers shared by BulkUploadZone and the mobile ingest page.
// Talks to the generic /api/ingest/* API (session-cookie authenticated — no device token needed
// from a logged-in browser tab).

export interface IngestMetadata {
  eventName?: string;
  eventDate?: string;
  location?: string;
  manualTags?: string[];
  collectionId?: string | null;
  seasonId?: string | null;
}

export type IngestResult = { duplicate: true; existingAssetId: string } | { duplicate: false; assetId: string };

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function putToStorage(url: string, body: BodyInit, contentType: string): Promise<string> {
  const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body });
  if (!res.ok) throw new Error(`Storage upload failed (HTTP ${res.status})`);
  return res.headers.get('etag')?.replace(/"/g, '') ?? '';
}

export async function uploadViaIngestApi(
  file: File,
  opts: { channel: 'browser' | 'mobile'; metadata?: IngestMetadata; exifJson?: string | null },
  onProgress?: (message: string) => void,
): Promise<IngestResult> {
  onProgress?.('Hashing…');
  const buffer = await file.arrayBuffer();
  const contentHash = await sha256Hex(buffer);

  const sessionRes = await fetch('/api/ingest/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name, fileType: file.type, fileSize: file.size,
      contentHash, channel: opts.channel, metadata: opts.metadata,
    }),
  });
  if (!sessionRes.ok) {
    const body = await sessionRes.json().catch(() => ({}));
    throw new Error(body.message ?? `Could not start upload (HTTP ${sessionRes.status})`);
  }
  const session = await sessionRes.json();

  if (session.status === 'duplicate') {
    return { duplicate: true, existingAssetId: session.existingAssetId };
  }

  onProgress?.('Uploading…');

  if (session.mode === 'multipart') {
    const parts: { partNumber: number; eTag: string }[] = [];
    for (let partNumber = 1; partNumber <= session.partsTotal; partNumber++) {
      onProgress?.(`Uploading part ${partNumber}/${session.partsTotal}…`);
      const start = (partNumber - 1) * session.partSize;
      const chunk = buffer.slice(start, start + session.partSize);

      const urlRes = await fetch(`/api/ingest/sessions/${session.jobId}/parts?partNumbers=${partNumber}`);
      const { urls } = await urlRes.json();
      const eTag = await putToStorage(urls[0].url, chunk, file.type);
      parts.push({ partNumber, eTag });
    }
    onProgress?.('Saving…');
    const completeRes = await fetch(`/api/ingest/sessions/${session.jobId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parts, exifJson: opts.exifJson ?? null }),
    });
    if (!completeRes.ok) throw new Error('Failed to finalize upload');
    const result = await completeRes.json();
    return { duplicate: false, assetId: result.assetId };
  }

  await putToStorage(session.presignedUrl, buffer, file.type);
  onProgress?.('Saving…');
  const completeRes = await fetch(`/api/ingest/sessions/${session.jobId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exifJson: opts.exifJson ?? null }),
  });
  if (!completeRes.ok) throw new Error('Failed to finalize upload');
  const result = await completeRes.json();
  return { duplicate: false, assetId: result.assetId };
}
