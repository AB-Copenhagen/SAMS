'use client';

// Browser-safe helpers shared by BulkUploadZone and the mobile ingest page.
// Talks to the generic /api/ingest/* API (session-cookie authenticated — no device token needed
// from a logged-in browser tab).

import { createSHA256 } from 'hash-wasm';

export interface IngestMetadata {
  eventName?: string;
  eventDate?: string;
  location?: string;
  manualTags?: string[];
  collectionId?: string | null;
  seasonId?: string | null;
}

export type IngestResult = { duplicate: true; existingAssetId: string } | { duplicate: false; assetId: string };

const HASH_CHUNK_SIZE = 16 * 1024 * 1024; // 16MB — read/hash in fixed chunks so a multi-GB file
                                           // is never held in memory as one ArrayBuffer.
const PART_UPLOAD_CONCURRENCY = 5;
const PART_URL_BATCH_SIZE = 50; // how many presigned part URLs to request per API call

// Web Crypto's SubtleCrypto.digest() is single-shot only (needs the whole input up front) —
// hash-wasm's incremental hasher lets us feed the file in fixed-size chunks instead of loading
// it entirely into memory just to compute contentHash.
async function sha256HexStreaming(file: File): Promise<string> {
  const hasher = await createSHA256();
  for (let offset = 0; offset < file.size; offset += HASH_CHUNK_SIZE) {
    const chunk = await file.slice(offset, offset + HASH_CHUNK_SIZE).arrayBuffer();
    hasher.update(new Uint8Array(chunk));
  }
  return hasher.digest('hex');
}

async function putToStorage(url: string, body: BodyInit, contentType: string): Promise<string> {
  const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': contentType }, body });
  if (!res.ok) throw new Error(`Storage upload failed (HTTP ${res.status})`);
  return res.headers.get('etag')?.replace(/"/g, '') ?? '';
}

// Presigns every part URL up front, in batches, using the parts endpoint's existing
// ?partNumbers=1,2,3 batch support — this replaces the old one-GET-per-part pattern.
async function fetchAllPartUrls(jobId: string, partsTotal: number): Promise<Map<number, string>> {
  const batches: number[][] = [];
  for (let start = 1; start <= partsTotal; start += PART_URL_BATCH_SIZE) {
    const numbers: number[] = [];
    for (let n = start; n < start + PART_URL_BATCH_SIZE && n <= partsTotal; n++) numbers.push(n);
    batches.push(numbers);
  }

  const urlByPart = new Map<number, string>();
  await Promise.all(batches.map(async (numbers) => {
    const res = await fetch(`/api/ingest/sessions/${jobId}/parts?partNumbers=${numbers.join(',')}`);
    if (!res.ok) throw new Error('Could not get upload URLs');
    const { urls } = await res.json() as { urls: { partNumber: number; url: string }[] };
    for (const u of urls) urlByPart.set(u.partNumber, u.url);
  }));
  return urlByPart;
}

// Uploads every part with bounded concurrency instead of one-at-a-time — the real memory win is
// slicing straight from the original File (a lazy Blob view, no JS-side copy) rather than from a
// whole-file ArrayBuffer held for the entire upload. Completion order doesn't matter: the server's
// completeMultipartUpload already sorts parts by partNumber.
async function uploadPartsConcurrently(
  file: File,
  urlByPart: Map<number, string>,
  partsTotal: number,
  partSize: number,
  onProgress?: (message: string) => void,
): Promise<{ partNumber: number; eTag: string }[]> {
  const parts: { partNumber: number; eTag: string }[] = new Array(partsTotal);
  let nextPartNumber = 1;
  let completed = 0;

  async function worker() {
    for (;;) {
      const partNumber = nextPartNumber++;
      if (partNumber > partsTotal) return;

      const url = urlByPart.get(partNumber);
      if (!url) throw new Error(`Missing presigned URL for part ${partNumber}`);

      const start = (partNumber - 1) * partSize;
      const chunk = file.slice(start, start + partSize);
      const eTag = await putToStorage(url, chunk, file.type);
      parts[partNumber - 1] = { partNumber, eTag };
      completed++;
      onProgress?.(`Uploading parts (${completed}/${partsTotal})…`);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PART_UPLOAD_CONCURRENCY, partsTotal) }, () => worker()),
  );
  return parts;
}

export async function uploadViaIngestApi(
  file: File,
  opts: { channel: 'browser' | 'mobile'; metadata?: IngestMetadata; exifJson?: string | null },
  onProgress?: (message: string) => void,
): Promise<IngestResult> {
  onProgress?.('Hashing…');
  const contentHash = await sha256HexStreaming(file);

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
    const urlByPart = await fetchAllPartUrls(session.jobId, session.partsTotal);
    const parts = await uploadPartsConcurrently(file, urlByPart, session.partsTotal, session.partSize, onProgress);

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

  await putToStorage(session.presignedUrl, file, file.type);
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
